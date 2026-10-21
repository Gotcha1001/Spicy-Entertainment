// convex/bookings.ts
//
// Book a dancer for 1–4 half-hour blocks. The server decides everything that
// matters (price, availability, clashes); the browser only picks a start time
// and a number of blocks.

import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { split } from "./lib/fees";
import {
  getCurrentUser,
  requireAdult,
  requireCurrentUser,
  requireHost,
} from "./lib/auth";
import {
  MIN_MS,
  dayIndexOf,
  isSlotBookable,
  isValidTimeZone,
  lastBookableDay,
} from "./lib/schedule";
import {
  SLOT_MS,
  MAX_BLOCKS,
  blocksToMinutes,
  fitsInRuns,
  isOnSlotGrid,
  isValidBlocks,
  openRuns,
  overlaps,
} from "./lib/slots";
import {
  bookingsTouching,
  holdsSlot,
  loadWeekly,
  requireHostTz,
  workingSlotsOn,
} from "./lib/availability";
import { isBookable } from "./lib/hostRules";
import {
  eventTypeValidator,
  type BookingStatus,
  type EventType,
} from "./lib/validators";
import type { CheckoutInfo } from "./payments";
import { CHARGE_CURRENCY, convertMinor } from "./lib/currency";
import { loadRates } from "./lib/locale";

const PENDING_EXPIRY_MS = 15 * MIN_MS; // unpaid holds are released after this
const CANCEL_CUTOFF_MS = 24 * 60 * MIN_MS; // parties can cancel (and be refunded) up to 24h before
const NO_SHOW_GRACE_MS = 10 * MIN_MS; // dancer must join within 10 min of the start
const EARLY_JOIN_MS = 10 * MIN_MS; // dancer may join up to 10 min early
const MAX_DANCERS_PER_PARTY = 3;
const LIST_LIMIT = 100;

// ───────────── Parties (group up to 3 dancers for one event) ─────────────

export const createParty = mutation({
  args: {
    name: v.string(),
    eventType: eventTypeValidator,
    note: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"parties">> => {
    const user = await requireAdult(ctx);
    const name = args.name.trim();
    const note = args.note?.trim() || undefined;
    if (name.length < 2 || name.length > 60)
      throw new Error("Party name must be 2 to 60 characters");
    if (note !== undefined && note.length > 300)
      throw new Error("Note must be 300 characters or fewer");
    return await ctx.db.insert("parties", {
      ownerId: user._id,
      name,
      eventType: args.eventType,
      note,
      createdAt: Date.now(),
    });
  },
});

export const listMyParties = query({
  args: {},
  handler: async (ctx): Promise<Doc<"parties">[]> => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    return await ctx.db
      .query("parties")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .take(50);
  },
});

// ───────────── Create ─────────────

export const createBooking = mutation({
  args: {
    hostId: v.id("hosts"),
    startsAt: v.number(),
    blocks: v.number(), // number of 30-minute blocks, 1–4
    eventType: eventTypeValidator,
    eventNote: v.optional(v.string()),
    partyId: v.optional(v.id("parties")),
  },
  handler: async (ctx, args): Promise<Id<"bookings">> => {
    const { hostId, startsAt, blocks, eventType, partyId } = args;

    // Parties only, 18+ and rules accepted — all enforced server-side.
    const guest = await requireAdult(ctx);
    if (guest.role !== "user" || guest.onboardingChoice !== "party") {
      throw new Error("Only party accounts can book a dancer");
    }
    if (!guest.timezone || !isValidTimeZone(guest.timezone)) {
      throw new Error("Please set your time zone before booking");
    }
    if (!isValidBlocks(blocks)) {
      throw new Error(`Choose 1 to ${MAX_BLOCKS} half-hour blocks`);
    }
    const eventNote = args.eventNote?.trim() || undefined;
    if (eventNote !== undefined && eventNote.length > 300) {
      throw new Error("Note must be 300 characters or fewer");
    }

    // Dancer first: every "day" and "slot" below is in HER zone.
    const host = await ctx.db.get(hostId);
    if (!host || !isBookable(host)) throw new Error("Dancer unavailable");
    const tz = requireHostTz(host);
    if (host.userId === guest._id) throw new Error("You can’t book yourself");

    const blocked = await ctx.db
      .query("blocks")
      .withIndex("by_host_user", (q) =>
        q.eq("hostId", hostId).eq("blockedUserId", guest._id),
      )
      .first();
    if (blocked) throw new Error("Dancer unavailable");

    // Time rules
    const now = Date.now();
    if (!Number.isFinite(startsAt) || !isOnSlotGrid(startsAt, tz)) {
      throw new Error("Start time must be on the hour or half hour");
    }
    if (!isSlotBookable(startsAt, now)) {
      throw new Error("Bookings close 1 hour before the start time");
    }
    if (dayIndexOf(startsAt, tz) > lastBookableDay(now, tz)) {
      throw new Error("That date is too far ahead");
    }
    const endsAt = startsAt + blocks * SLOT_MS;

    // Must sit inside her working slots (one unbroken run, her local day).
    const dayIndex = dayIndexOf(startsAt, tz);
    const weekly = await loadWeekly(ctx, hostId);
    const open = await workingSlotsOn(ctx, hostId, weekly, dayIndex);
    if (!fitsInRuns(startsAt, endsAt, openRuns(dayIndex, open, tz))) {
      throw new Error("That show doesn’t fit inside her available hours");
    }

    // No overlap with anyone else's held slot.
    const nearby = await bookingsTouching(ctx, hostId, startsAt, endsAt);
    let clash = false;
    for (const b of nearby) {
      if (!overlaps(startsAt, endsAt, b.startsAt, b.endsAt)) continue;
      // The guest's own unpaid attempt (closed the payment tab) must not block a retry.
      if (b.status === "pending_payment" && b.guestId === guest._id) {
        await ctx.db.patch(b._id, { status: "cancelled" });
        continue;
      }
      clash = true;
    }
    if (clash) throw new Error("That time slot was just taken");

    // Optional party grouping: max 3 different dancers per party.
    if (partyId) {
      const party = await ctx.db.get(partyId);
      if (!party || party.ownerId !== guest._id)
        throw new Error("Party not found");
      const inParty = await ctx.db
        .query("bookings")
        .withIndex("by_party", (q) => q.eq("partyId", partyId))
        .collect();
      const dancers = new Set(
        inParty.filter((b) => holdsSlot(b.status)).map((b) => b.hostId),
      );
      if (!dancers.has(hostId) && dancers.size >= MAX_DANCERS_PER_PARTY) {
        throw new Error(
          `A party can have at most ${MAX_DANCERS_PER_PARTY} dancers`,
        );
      }
    }

    // Price is ALWAYS computed here from her rate, never from the browser.
    // The rate is in her currency; the payment gateway still charges CHARGE_CURRENCY.
    const rates = await loadRates(ctx);
    const amountCents = convertMinor(
      host.ratePerHalfHourCents * blocks,
      host.currency ?? "ZAR",
      CHARGE_CURRENCY,
      rates,
    );
    const fees = split(amountCents);

    const bookingId = await ctx.db.insert("bookings", {
      hostId,
      guestId: guest._id,
      partyId,
      eventType,
      eventNote,
      startsAt,
      endsAt,
      minutes: blocksToMinutes(blocks),
      amountCents,
      platformFeeCents: fees.platformFeeCents,
      hostShareCents: fees.hostShareCents,
      status: "pending_payment",
      hostTimezone: tz, // snapshots stay right even if either person changes zone later
      guestTimezone: guest.timezone,
      createdAt: now,
    });

    await ctx.scheduler.runAfter(
      PENDING_EXPIRY_MS,
      internal.bookings.expireIfUnpaid,
      { bookingId },
    );
    return bookingId;
  },
});

export const expireIfUnpaid = internalMutation({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, { bookingId }): Promise<void> => {
    const booking = await ctx.db.get(bookingId);
    if (booking && booking.status === "pending_payment") {
      await ctx.db.patch(bookingId, { status: "expired" });
    }
  },
});

// ───────────── Checkout (called only by payments.initCheckout) ─────────────

export const getForCheckout = internalQuery({
  args: { bookingId: v.id("bookings"), clerkId: v.string() },
  handler: async (ctx, { bookingId, clerkId }): Promise<CheckoutInfo> => {
    const booking = await ctx.db.get(bookingId);
    if (!booking) throw new Error("Booking not found");
    if (booking.status !== "pending_payment")
      throw new Error("Booking is not awaiting payment");

    const guest = await ctx.db.get(booking.guestId);
    if (!guest) throw new Error("Guest not found");
    if (guest.clerkId !== clerkId) throw new Error("Not your booking");

    const host = await ctx.db.get(booking.hostId);
    if (!host) throw new Error("Dancer not found");
    // She may have paused herself since the hold was made; only suspension blocks payment.
    if (host.status === "suspended") throw new Error("Dancer unavailable");
    if (!host.payoutAccountRef) throw new Error("Dancer has no payout account");

    return {
      hostId: host._id,
      payerId: guest._id,
      guestEmail: guest.email,
      hostSubaccountCode: host.payoutAccountRef,
      amountCents: booking.amountCents,
      platformFeeCents: booking.platformFeeCents,
    };
  },
});

// ───────────── Cancel ─────────────

/**
 * Party: cancels an unpaid hold any time, or a paid booking up to 24h before.
 * Dancer: can cancel a paid booking any time before it starts (full refund).
 */
export const cancelBooking = mutation({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, { bookingId }): Promise<null> => {
    const user = await requireCurrentUser(ctx);
    const booking = await ctx.db.get(bookingId);
    if (!booking) throw new Error("Booking not found");
    const host = await ctx.db.get(booking.hostId);
    if (!host) throw new Error("Dancer not found");

    const isGuest = booking.guestId === user._id;
    const isHost = host.userId === user._id;
    if (!isGuest && !isHost) throw new Error("Not your booking");

    const now = Date.now();
    if (booking.status === "pending_payment") {
      if (!isGuest)
        throw new Error("Only the party can cancel an unpaid booking");
      await ctx.db.patch(bookingId, { status: "cancelled" });
      return null;
    }
    if (booking.status !== "paid")
      throw new Error("This booking can’t be cancelled");
    if (now >= booking.startsAt)
      throw new Error("This show has already started");
    if (isGuest && booking.startsAt - now < CANCEL_CUTOFF_MS) {
      throw new Error(
        "Paid bookings can only be cancelled up to 24 hours before the show",
      );
    }

    await ctx.db.patch(bookingId, { status: "cancelled" });
    const session = await ctx.db
      .query("callSessions")
      .withIndex("by_booking", (q) => q.eq("bookingId", bookingId))
      .unique();
    if (session && session.status !== "ended") {
      await ctx.db.patch(session._id, { status: "ended", endedAt: now });
    }
    await ctx.scheduler.runAfter(0, internal.payments.refundForBooking, {
      bookingId,
    });
    return null;
  },
});

// ───────────── Dancer joined / no-show sweep ─────────────

/**
 * The dancer's call page calls this once she connects. It's what proves she
 * showed up (no-show refunds depend on it).
 */
export const markHostJoined = mutation({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, { bookingId }): Promise<null> => {
    const { host } = await requireHost(ctx);
    const booking = await ctx.db.get(bookingId);
    if (!booking || booking.hostId !== host._id)
      throw new Error("Not your booking");
    if (booking.status !== "paid") throw new Error("Booking is not active");
    const now = Date.now();
    if (now < booking.startsAt - EARLY_JOIN_MS || now > booking.endsAt) {
      throw new Error("Outside the booking window");
    }
    if (booking.hostJoinedAt === undefined) {
      await ctx.db.patch(bookingId, { hostJoinedAt: now });
    }
    return null;
  },
});

/**
 * Cron (every 2 min). For paid bookings that have started:
 *   dancer never joined within the grace period -> no_show + automatic refund
 *   dancer joined and the time is up           -> completed
 */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ noShows: number; completed: number }> => {
    const now = Date.now();
    const started = await ctx.db
      .query("bookings")
      .withIndex("by_status_start", (q) =>
        q.eq("status", "paid").lt("startsAt", now),
      )
      .collect();

    let noShows = 0;
    let completed = 0;
    for (const b of started) {
      const endSession = async (): Promise<void> => {
        const session = await ctx.db
          .query("callSessions")
          .withIndex("by_booking", (q) => q.eq("bookingId", b._id))
          .unique();
        if (session && session.status !== "ended") {
          await ctx.db.patch(session._id, { status: "ended", endedAt: now });
        }
      };

      if (b.hostJoinedAt === undefined) {
        if (now >= b.startsAt + NO_SHOW_GRACE_MS) {
          await ctx.db.patch(b._id, { status: "no_show" });
          await endSession();
          await ctx.scheduler.runAfter(0, internal.payments.refundForBooking, {
            bookingId: b._id,
          });
          noShows += 1;
        }
      } else if (now >= b.endsAt) {
        await ctx.db.patch(b._id, { status: "completed" });
        await endSession();
        completed += 1;
      }
    }
    return { noShows, completed };
  },
});

// ───────────── Read ─────────────

export type BookingView = Doc<"bookings"> & {
  hostName: string;
  hostImageUrl: string | null;
  guestName: string;
  isGuest: boolean;
  isHost: boolean;
  callSessionId: Id<"callSessions"> | null;
};

/** One booking, visible only to its party or its dancer. */
export const getMine = query({
  // string, not v.id: a malformed ID in the URL should show "not found", not crash
  args: { bookingId: v.string() },
  handler: async (ctx, { bookingId: rawId }): Promise<BookingView | null> => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const bookingId = ctx.db.normalizeId("bookings", rawId);
    if (!bookingId) return null;
    const booking = await ctx.db.get(bookingId);
    if (!booking) return null;
    const host = await ctx.db.get(booking.hostId);
    const guest = await ctx.db.get(booking.guestId);
    if (!host || !guest) return null;

    const isGuest = guest._id === user._id;
    const isHost = host.userId === user._id;
    if (!isGuest && !isHost) return null;

    const session = await ctx.db
      .query("callSessions")
      .withIndex("by_booking", (q) => q.eq("bookingId", bookingId))
      .unique();

    return {
      ...booking,
      hostName: host.displayName,
      hostImageUrl: host.imageUrl ?? null,
      guestName: guest.name,
      isGuest,
      isHost,
      callSessionId:
        session && session.status === "accepted" ? session._id : null,
    };
  },
});

type ListItem = {
  _id: Id<"bookings">;
  startsAt: number;
  endsAt: number;
  minutes: number;
  status: BookingStatus;
  eventType: EventType;
  otherName: string;
  hostTimezone: string;
  guestTimezone: string | null;
  callSessionId: Id<"callSessions"> | null;
};
export type GuestBookingItem = ListItem & {
  amountCents: number;
  hostImageUrl: string | null;
};
export type HostBookingItem = ListItem & { hostShareCents: number };

const isVisible = (status: BookingStatus): boolean =>
  status !== "cancelled" && status !== "expired";

/** "My bookings": as a party, plus (if she is a dancer) bookings made with her. Never returns emails. */
export const listMine = query({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    asGuest: GuestBookingItem[];
    asHost: HostBookingItem[];
    isHost: boolean;
  } | null> => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const sessionFor = async (
      b: Doc<"bookings">,
    ): Promise<Id<"callSessions"> | null> => {
      if (b.status !== "paid") return null;
      const s = await ctx.db
        .query("callSessions")
        .withIndex("by_booking", (q) => q.eq("bookingId", b._id))
        .unique();
      return s && s.status === "accepted" ? s._id : null;
    };

    const guestRows = await ctx.db
      .query("bookings")
      .withIndex("by_guest", (q) => q.eq("guestId", user._id))
      .order("desc")
      .take(LIST_LIMIT);
    const asGuest = await Promise.all(
      guestRows
        .filter((b) => isVisible(b.status))
        .map(async (b): Promise<GuestBookingItem> => {
          const host = await ctx.db.get(b.hostId);
          return {
            _id: b._id,
            startsAt: b.startsAt,
            endsAt: b.endsAt,
            minutes: b.minutes,
            status: b.status,
            eventType: b.eventType,
            otherName: host?.displayName ?? "Dancer",
            hostTimezone: b.hostTimezone,
            guestTimezone: b.guestTimezone ?? user.timezone ?? null,
            callSessionId: await sessionFor(b),
            amountCents: b.amountCents,
            hostImageUrl: host?.imageUrl ?? null,
          };
        }),
    );

    const myHost = await ctx.db
      .query("hosts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    const asHost: HostBookingItem[] = myHost
      ? await Promise.all(
          (
            await ctx.db
              .query("bookings")
              .withIndex("by_host", (q) => q.eq("hostId", myHost._id))
              .order("desc")
              .take(LIST_LIMIT)
          )
            .filter((b) => isVisible(b.status))
            .map(async (b): Promise<HostBookingItem> => {
              const guest = await ctx.db.get(b.guestId);
              return {
                _id: b._id,
                startsAt: b.startsAt,
                endsAt: b.endsAt,
                minutes: b.minutes,
                status: b.status,
                eventType: b.eventType,
                otherName: guest?.name ?? "Guest",
                hostTimezone: b.hostTimezone,
                guestTimezone: b.guestTimezone ?? guest?.timezone ?? null,
                callSessionId: await sessionFor(b),
                hostShareCents: b.hostShareCents, // what she earns
              };
            }),
        )
      : [];

    return { asGuest, asHost, isHost: myHost !== null };
  },
});
