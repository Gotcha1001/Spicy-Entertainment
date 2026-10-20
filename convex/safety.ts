// convex/safety.ts
//
// Safety without an admin team.
//
//  * Reports must reference a booking the reporter really took part in, so
//    only real customers/dancers can report (no drive-by brigading).
//  * When 3 DIFFERENT people report the same dancer, she is auto-suspended:
//    hidden from the dashboard, can't be booked or paid, and her upcoming
//    paid shows can't start, so the sweep cron refunds those parties.
//  * Dancers can block parties from booking them.
//  * You (the owner) resolve cases from the Convex dashboard by running
//    safety:reinstateHost — no admin UI to build.

import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireCurrentUser, requireHost } from "./lib/auth";

const AUTO_SUSPEND_AFTER = 3; // distinct reporters
const MIN_REASON = 5;
const MAX_REASON = 500;

export type BlockedUser = {
  userId: Id<"users">;
  name: string;
  createdAt: number;
};

// ───────────── Reports ─────────────

export const reportUser = mutation({
  args: {
    bookingId: v.id("bookings"),
    reason: v.string(),
  },
  handler: async (ctx, { bookingId, reason }): Promise<null> => {
    const user = await requireCurrentUser(ctx);
    const text = reason.trim();
    if (text.length < MIN_REASON || text.length > MAX_REASON) {
      throw new Error(
        `Please describe the problem in ${MIN_REASON}–${MAX_REASON} characters`,
      );
    }

    const booking = await ctx.db.get(bookingId);
    if (!booking) throw new Error("Booking not found");
    const host = await ctx.db.get(booking.hostId);
    if (!host) throw new Error("Dancer not found");

    // I must have been part of it, and a real (paid) show must have been set up.
    const isGuest = booking.guestId === user._id;
    const isHost = host.userId === user._id;
    if (!isGuest && !isHost)
      throw new Error(
        "You can only report someone you booked or performed for",
      );
    if (
      booking.status === "pending_payment" ||
      booking.status === "expired" ||
      booking.status === "cancelled"
    ) {
      throw new Error("You can only report after a booking has been paid");
    }

    const targetUserId = isGuest ? host.userId : booking.guestId;

    // One report per person per booking.
    const mine = await ctx.db
      .query("reports")
      .withIndex("by_target_resolved", (q) =>
        q.eq("targetUserId", targetUserId).eq("resolved", false),
      )
      .collect();
    if (
      mine.some((r) => r.reporterId === user._id && r.bookingId === bookingId)
    ) {
      throw new Error("You already reported this booking");
    }

    await ctx.db.insert("reports", {
      reporterId: user._id,
      targetUserId,
      bookingId,
      reason: text,
      resolved: false,
      createdAt: Date.now(),
    });

    // Auto-suspend a dancer once enough DIFFERENT people have reported her.
    if (isGuest) {
      const distinct = new Set([...mine.map((r) => r.reporterId), user._id]);
      if (distinct.size >= AUTO_SUSPEND_AFTER && host.status !== "suspended") {
        await ctx.db.patch(host._id, { status: "suspended", isOnline: false });
      }
    }
    return null;
  },
});

/**
 * Run from the Convex dashboard (Functions → safety:reinstateHost) after you
 * have looked at the reports: lifts the suspension and closes her open reports.
 */
export const reinstateHost = internalMutation({
  args: { hostId: v.id("hosts") },
  handler: async (ctx, { hostId }): Promise<number> => {
    const host = await ctx.db.get(hostId);
    if (!host) throw new Error("Dancer not found");
    await ctx.db.patch(hostId, { status: "active" });

    const open = await ctx.db
      .query("reports")
      .withIndex("by_target_resolved", (q) =>
        q.eq("targetUserId", host.userId).eq("resolved", false),
      )
      .collect();
    for (const r of open) await ctx.db.patch(r._id, { resolved: true });
    return open.length;
  },
});

// ───────────── Blocks (dancer blocks a party) ─────────────

export const blockUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<null> => {
    const { user, host } = await requireHost(ctx);
    if (userId === user._id) throw new Error("You can’t block yourself");
    const target = await ctx.db.get(userId);
    if (!target) throw new Error("User not found");

    const existing = await ctx.db
      .query("blocks")
      .withIndex("by_host_user", (q) =>
        q.eq("hostId", host._id).eq("blockedUserId", userId),
      )
      .first();
    if (!existing) {
      await ctx.db.insert("blocks", {
        hostId: host._id,
        blockedUserId: userId,
        createdAt: Date.now(),
      });
    }
    return null;
  },
});

export const unblockUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<null> => {
    const { host } = await requireHost(ctx);
    const existing = await ctx.db
      .query("blocks")
      .withIndex("by_host_user", (q) =>
        q.eq("hostId", host._id).eq("blockedUserId", userId),
      )
      .first();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

export const listMyBlocks = query({
  args: {},
  handler: async (ctx): Promise<BlockedUser[]> => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) return [];
    const me = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", user.subject))
      .first();
    if (!me || me.role !== "host") return [];
    const host = await ctx.db
      .query("hosts")
      .withIndex("by_user", (q) => q.eq("userId", me._id))
      .unique();
    if (!host) return [];

    const rows = await ctx.db
      .query("blocks")
      .withIndex("by_host_user", (q) => q.eq("hostId", host._id))
      .collect();
    return await Promise.all(
      rows.map(async (b): Promise<BlockedUser> => {
        const u = await ctx.db.get(b.blockedUserId);
        return {
          userId: b.blockedUserId,
          name: u?.name ?? "Unknown",
          createdAt: b.createdAt,
        };
      }),
    );
  },
});
