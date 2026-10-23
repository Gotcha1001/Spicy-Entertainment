import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

// ───────────── Types ─────────────

type PaystackInitResponse = {
  status: boolean;
  message?: string;
  data?: { authorization_url: string; reference: string };
};

type PaystackRefundResponse = {
  status: boolean;
  message?: string;
  data?: { id?: number; status?: string };
};

/**
 * What bookings.getForCheckout (internalQuery) MUST return. It must also
 * verify: the caller (clerkId) is the guest, the booking is `pending_payment`
 * and not past its hold time, the dancer is `active` + `isOnboarded`, and
 * she has a `payoutAccountRef` (Paystack subaccount code).
 */
export type CheckoutInfo = {
  hostId: Id<"hosts">;
  payerId: Id<"users">;
  guestEmail: string;
  hostSubaccountCode: string;
  amountCents: number;
  platformFeeCents: number;
};

function requireEnv(name: "PAYSTACK_SECRET" | "SITE_URL"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set in this Convex deployment`);
  return value;
}

// ───────────── Checkout (public) ─────────────

/** Returns the Paystack hosted-checkout URL for the client to redirect to. */
export const initCheckout = action({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, { bookingId }): Promise<string> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not signed in");

    const secret = requireEnv("PAYSTACK_SECRET");
    const siteUrl = requireEnv("SITE_URL");

    const b: CheckoutInfo = await ctx.runQuery(
      internal.bookings.getForCheckout,
      { bookingId, clerkId: identity.subject },
    );

    const reference = `bk_${bookingId}_${Date.now()}`;

    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: b.guestEmail,
        amount: b.amountCents, // ZAR cents
        currency: "ZAR",
        subaccount: b.hostSubaccountCode,
        transaction_charge: b.platformFeeCents, // flat amount the platform keeps
        // Who pays Paystack's fee: "subaccount" = the dancer (comes out of her
        // share); "account" = the platform (comes out of your fee).
        bearer: "subaccount",
        reference,
        metadata: { bookingId },
        callback_url: `${siteUrl}/bookings/${bookingId}`,
      }),
    });

    const data = (await res.json()) as PaystackInitResponse;
    if (!res.ok || !data.status || !data.data) {
      throw new Error(data.message ?? "Paystack initialize failed");
    }

    await ctx.runMutation(internal.payments.record, {
      providerReference: reference,
      bookingId,
      hostId: b.hostId,
      payerId: b.payerId,
      amountCents: b.amountCents,
      platformFeeCents: b.platformFeeCents,
    });

    return data.data.authorization_url;
  },
});

// ───────────── Internal: payment rows ─────────────

export const record = internalMutation({
  args: {
    providerReference: v.string(),
    bookingId: v.id("bookings"),
    hostId: v.id("hosts"),
    payerId: v.id("users"),
    amountCents: v.number(),
    platformFeeCents: v.number(),
  },
  handler: async (ctx, a): Promise<Id<"payments">> => {
    return await ctx.db.insert("payments", {
      providerReference: a.providerReference,
      bookingId: a.bookingId,
      hostId: a.hostId,
      payerId: a.payerId,
      amountCents: a.amountCents,
      platformFeeCents: a.platformFeeCents,
      hostShareCents: a.amountCents - a.platformFeeCents,
      currency: "ZAR",
      status: "initiated",
      createdAt: Date.now(),
    });
  },
});

/**
 * Called by the webhook on `charge.success` (after its signature check).
 * Idempotent: Paystack retries webhooks, so a repeat does nothing.
 */
export const markSucceeded = internalMutation({
  args: {
    reference: v.string(),
    amountCents: v.number(),
    currency: v.string(),
  },
  handler: async (ctx, { reference, amountCents, currency }): Promise<void> => {
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_reference", (q) => q.eq("providerReference", reference))
      .unique();

    if (!payment) return; // unknown reference: acknowledge, don't retry
    if (payment.status !== "initiated") return; // idempotent

    // Never trust a webhook blindly: the amount and currency must match what we asked for.
    if (payment.amountCents !== amountCents || currency !== "ZAR") {
      await ctx.db.patch(payment._id, { status: "failed" });
      return;
    }

    await ctx.db.patch(payment._id, { status: "succeeded" });

    const booking = await ctx.db.get(payment.bookingId);

    // Paid too late (hold expired / cancelled), or paid twice: give the money back.
    if (!booking || booking.status !== "pending_payment") {
      await ctx.scheduler.runAfter(0, internal.payments.refundPayment, {
        paymentId: payment._id,
      });
      return;
    }

    const roomName = `show_${booking._id}`;
    await ctx.db.patch(booking._id, {
      status: "paid",
      paymentId: payment._id,
      roomName,
    });

    const host = await ctx.db.get(booking.hostId);
    if (!host) return;

    // One-way live session: party = viewer (requester), dancer = publisher (recipient).
    await ctx.db.insert("callSessions", {
      requesterId: booking.guestId,
      recipientId: host.userId,
      bookingId: booking._id,
      roomName,
      status: "accepted",
      scheduledFor: booking.startsAt,
      endsAt: booking.endsAt,
      createdAt: Date.now(),
    });
  },
});

/** `charge.failed` webhook (optional): marks an initiated payment as failed. */
export const markFailed = internalMutation({
  args: { reference: v.string() },
  handler: async (ctx, { reference }): Promise<void> => {
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_reference", (q) => q.eq("providerReference", reference))
      .unique();
    if (payment && payment.status === "initiated") {
      await ctx.db.patch(payment._id, { status: "failed" });
    }
  },
});

// ───────────── Refunds (no-shows, late payments, cancellations) ─────────────

export const getPayment = internalQuery({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, { paymentId }): Promise<Doc<"payments"> | null> => {
    return await ctx.db.get(paymentId);
  },
});

/** The succeeded payment for a booking, if any. */
export const getSucceededForBooking = internalQuery({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, { bookingId }): Promise<Doc<"payments"> | null> => {
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_booking", (q) => q.eq("bookingId", bookingId))
      .collect();
    return payments.find((p) => p.status === "succeeded") ?? null;
  },
});

/**
 * Refunds one payment through Paystack, then records it.
 * NOTE: with split payments, confirm with Paystack how refunds are funded
 * (platform balance vs. the dancer's subaccount) before going live.
 */
export const refundPayment = internalAction({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, { paymentId }): Promise<void> => {
    const payment = await ctx.runQuery(internal.payments.getPayment, {
      paymentId,
    });
    if (!payment || payment.status !== "succeeded") return; // nothing to refund / already done

    const secret = requireEnv("PAYSTACK_SECRET");
    const res = await fetch("https://api.paystack.co/refund", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ transaction: payment.providerReference }),
    });
    const data = (await res.json()) as PaystackRefundResponse;
    if (!res.ok || !data.status) {
      console.error("[payments] Paystack refund failed", {
        paymentId,
        message: data.message,
      });
      throw new Error(data.message ?? "Paystack refund failed");
    }

    await ctx.runMutation(internal.payments.markRefunded, {
      paymentId,
      refundReference:
        data.data?.id !== undefined ? String(data.data.id) : undefined,
    });
  },
});

/** Convenience for crons: refund whatever succeeded payment a booking has. */
export const refundForBooking = internalAction({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, { bookingId }): Promise<void> => {
    const payment = await ctx.runQuery(
      internal.payments.getSucceededForBooking,
      { bookingId },
    );
    if (!payment) return;
    await ctx.runAction(internal.payments.refundPayment, {
      paymentId: payment._id,
    });
  },
});

export const markRefunded = internalMutation({
  args: {
    paymentId: v.id("payments"),
    refundReference: v.optional(v.string()),
  },
  handler: async (ctx, { paymentId, refundReference }): Promise<void> => {
    const payment = await ctx.db.get(paymentId);
    if (!payment || payment.status === "refunded") return;

    await ctx.db.patch(paymentId, { status: "refunded", refundReference });

    // Only touch the booking if it's still the one this payment paid for
    // (a late/duplicate payment refund must not flip a good booking).
    const booking = await ctx.db.get(payment.bookingId);
    if (booking && booking.paymentId === paymentId) {
      await ctx.db.patch(booking._id, { status: "refunded" });

      const session = await ctx.db
        .query("callSessions")
        .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
        .unique();
      if (session && session.status !== "ended") {
        await ctx.db.patch(session._id, {
          status: "ended",
          endedAt: Date.now(),
        });
      }
    }
  },
});

/** Cron: re-attempt refunds for no-shows whose first refund didn't go through. */
export const retryPendingRefunds = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const ids = await ctx.runQuery(internal.bookings.noShowsAwaitingRefund, {});
    for (const bookingId of ids) {
      try {
        // No-op if the booking has no succeeded payment left to refund.
        await ctx.runAction(internal.payments.refundForBooking, { bookingId });
      } catch (e) {
        console.error("[payments] refund retry failed", { bookingId, e });
      }
    }
  },
});
