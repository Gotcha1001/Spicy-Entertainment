// convex/notifications.ts
//
// One reactive query that powers the navbar/sidebar badges. Returns null
// (rather than throwing) when signed out or before the users row exists, so
// the navbar never crashes during sign-in.

import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getCurrentUser } from "./lib/auth";
import { LATE_GRACE_MS } from "./lib/showWindow";
import type { ShowRole } from "./callAccess";

export type NavShow = {
  callSessionId: Id<"callSessions">;
  role: ShowRole;
  /** The dancer's name for viewers, the party's name for performers. */
  otherName: string;
  startsAt: number;
  endsAt: number;
};

export interface NavCounts {
  /** Party: bookings created but not yet paid (a 15-minute hold is ticking). */
  awaitingPayment: number;
  /**
   * Shows I can still watch or perform, soonest first. The client decides
   * which one is "starting soon / live now" against its own clock, because
   * Convex queries don't re-run just because time has passed.
   */
  upcomingShows: NavShow[];
  /** Dancer: profile saved but image or payout account still missing, so she isn't listed yet. */
  hostSetupIncomplete: boolean;
}

const MAX_SHOWS = 10;
const SCAN_LIMIT = 50;

export const getNavCounts = query({
  args: {},
  handler: async (ctx): Promise<NavCounts | null> => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const now = Date.now();

    // ---- Party: unpaid holds ----
    const myBookings = await ctx.db
      .query("bookings")
      .withIndex("by_guest", (q) => q.eq("guestId", user._id))
      .order("desc")
      .take(SCAN_LIMIT);
    const awaitingPayment = myBookings.filter(
      (b) => b.status === "pending_payment",
    ).length;

    // ---- Shows I can still join (either side) ----
    const asViewer = await ctx.db
      .query("callSessions")
      .withIndex("by_requester", (q) => q.eq("requesterId", user._id))
      .order("desc")
      .take(SCAN_LIMIT);
    const asPerformer = await ctx.db
      .query("callSessions")
      .withIndex("by_recipient_status", (q) =>
        q.eq("recipientId", user._id).eq("status", "accepted"),
      )
      .order("desc")
      .take(SCAN_LIMIT);

    const open = (s: { status: string; endsAt: number }): boolean =>
      s.status === "accepted" && s.endsAt + LATE_GRACE_MS >= now;

    const viewerShows = await Promise.all(
      asViewer.filter(open).map(async (s): Promise<NavShow> => {
        const booking = await ctx.db.get(s.bookingId);
        const host = booking ? await ctx.db.get(booking.hostId) : null;
        return {
          callSessionId: s._id,
          role: "viewer",
          otherName: host?.displayName ?? "Dancer",
          startsAt: s.scheduledFor,
          endsAt: s.endsAt,
        };
      }),
    );
    const performerShows = await Promise.all(
      asPerformer.filter(open).map(async (s): Promise<NavShow> => {
        const guest = await ctx.db.get(s.requesterId);
        return {
          callSessionId: s._id,
          role: "performer",
          otherName: guest?.name ?? "Guest",
          startsAt: s.scheduledFor,
          endsAt: s.endsAt,
        };
      }),
    );
    const upcomingShows = [...viewerShows, ...performerShows]
      .sort((a, b) => a.startsAt - b.startsAt)
      .slice(0, MAX_SHOWS);

    // ---- Dancer: is she listed yet? ----
    let hostSetupIncomplete = false;
    if (user.role === "host") {
      const host = await ctx.db
        .query("hosts")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .unique();
      hostSetupIncomplete = host !== null && !host.isOnboarded;
    }

    return { awaitingPayment, upcomingShows, hostSetupIncomplete };
  },
});
