// convex/reviews.ts
//
// Ratings out of 10, left by the party after a completed show. One review per
// booking, no editing. The dancer's average is denormalised onto her hosts row
// (ratingSum / ratingCount) so the dashboard needs no joins.

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getCurrentUser, requireAdult } from "./lib/auth";

const MIN_SCORE = 1;
const MAX_SCORE = 10;
const MAX_COMMENT = 500;
const LIST_LIMIT = 30;

export type ReviewItem = {
  _id: Id<"reviews">;
  score: number;
  comment: string | null;
  /** First name only, for privacy. */
  guestFirstName: string;
  createdAt: number;
};

export type ReviewStatus = {
  /** True when I'm the party, the show completed, and I haven't rated it yet. */
  canReview: boolean;
  existing: { score: number; comment: string | null } | null;
};

/** Party rates a completed show (1–10). */
export const submitReview = mutation({
  args: {
    bookingId: v.id("bookings"),
    score: v.number(),
    comment: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { bookingId, score, comment },
  ): Promise<Id<"reviews">> => {
    const user = await requireAdult(ctx);

    if (!Number.isInteger(score) || score < MIN_SCORE || score > MAX_SCORE) {
      throw new Error(
        `Rating must be a whole number from ${MIN_SCORE} to ${MAX_SCORE}`,
      );
    }
    const text = comment?.trim() || undefined;
    if (text !== undefined && text.length > MAX_COMMENT) {
      throw new Error(`Comment must be ${MAX_COMMENT} characters or fewer`);
    }

    const booking = await ctx.db.get(bookingId);
    if (!booking || booking.guestId !== user._id)
      throw new Error("Booking not found");
    // Only shows that actually happened (the dancer joined) can be rated.
    if (booking.status !== "completed") {
      throw new Error("You can rate a show once it has finished");
    }

    const existing = await ctx.db
      .query("reviews")
      .withIndex("by_booking", (q) => q.eq("bookingId", bookingId))
      .first();
    if (existing) throw new Error("You already rated this show");

    const host = await ctx.db.get(booking.hostId);
    if (!host) throw new Error("Dancer not found");

    const reviewId = await ctx.db.insert("reviews", {
      bookingId,
      hostId: host._id,
      guestId: user._id,
      score,
      comment: text,
      createdAt: Date.now(),
    });
    await ctx.db.patch(host._id, {
      ratingSum: host.ratingSum + score,
      ratingCount: host.ratingCount + 1,
    });
    return reviewId;
  },
});

/** Drives the "Rate this show" card on the booking page. */
export const getForBooking = query({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, { bookingId }): Promise<ReviewStatus> => {
    const none: ReviewStatus = { canReview: false, existing: null };
    const user = await getCurrentUser(ctx);
    if (!user) return none;
    const booking = await ctx.db.get(bookingId);
    if (!booking || booking.guestId !== user._id) return none;

    const review = await ctx.db
      .query("reviews")
      .withIndex("by_booking", (q) => q.eq("bookingId", bookingId))
      .first();
    if (review) {
      return {
        canReview: false,
        existing: { score: review.score, comment: review.comment ?? null },
      };
    }
    return { canReview: booking.status === "completed", existing: null };
  },
});

/** Public: a dancer's latest reviews for her profile page. */
export const listForHost = query({
  args: { hostId: v.id("hosts") },
  handler: async (ctx, { hostId }): Promise<ReviewItem[]> => {
    const rows = await ctx.db
      .query("reviews")
      .withIndex("by_host", (q) => q.eq("hostId", hostId))
      .order("desc")
      .take(LIST_LIMIT);
    return await Promise.all(
      rows.map(async (r): Promise<ReviewItem> => {
        const guest = await ctx.db.get(r.guestId);
        return {
          _id: r._id,
          score: r.score,
          comment: r.comment ?? null,
          guestFirstName: guest?.name.split(" ")[0] ?? "Guest",
          createdAt: r.createdAt,
        };
      }),
    );
  },
});
