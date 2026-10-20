// convex/calls.ts
//
// Live shows. Sessions are created ONLY by payments.markSucceeded after a
// booking is paid, so there is no "request a call" / "accept or decline" flow
// any more: pay first, the dancer performs.
//
// Renamed from the old kit: getCallSession -> getShow, listMyCallSessions ->
// listMyShows. Removed: requestCall, respondToCall, endCall (the bookings.sweep
// cron ends sessions; a dancer who wants to stop early uses endShowEarly).

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { getCurrentUser, requireHost } from "./lib/auth";
import { LATE_GRACE_MS } from "./lib/showWindow";
import type { Act, CallStatus, EventType } from "./lib/validators";
import type { ShowRole } from "./callAccess";

const LIST_LIMIT = 50;

// ───────────── Types ─────────────

export type ShowView = {
  callSessionId: Id<"callSessions">;
  bookingId: Id<"bookings">;
  role: ShowRole;
  status: CallStatus;
  hostName: string;
  hostTagline: string;
  hostImageUrl: string | null;
  acts: Act[];
  guestName: string;
  eventType: EventType;
  eventNote: string | null;
  startsAt: number;
  endsAt: number;
  minutes: number;
  hostTimezone: string;
  /** Has the dancer connected yet? Lets viewers see "waiting for her to arrive". */
  hostJoined: boolean;
};

export type ShowListItem = {
  callSessionId: Id<"callSessions">;
  bookingId: Id<"bookings">;
  role: ShowRole;
  /** The dancer's name for viewers, the party's name for performers. */
  otherName: string;
  hostImageUrl: string | null;
  startsAt: number;
  endsAt: number;
};

export type PartyShow = {
  bookingId: Id<"bookings">;
  callSessionId: Id<"callSessions"> | null;
  hostName: string;
  hostImageUrl: string | null;
  startsAt: number;
  endsAt: number;
};

// ───────────── One show (call page) ─────────────

/**
 * Everything the call page needs in one query. Returns null (not an error)
 * for missing shows and non-participants, so the page shows "not found".
 */
export const getShow = query({
  // string, not v.id: a malformed ID in the URL should show "not found", not crash
  args: { callSessionId: v.string() },
  handler: async (ctx, { callSessionId: rawId }): Promise<ShowView | null> => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const id = ctx.db.normalizeId("callSessions", rawId);
    if (!id) return null;
    const session = await ctx.db.get(id);
    if (!session) return null;

    const isViewer = session.requesterId === user._id;
    const isPerformer = session.recipientId === user._id;
    if (!isViewer && !isPerformer) return null;

    const booking = await ctx.db.get(session.bookingId);
    if (!booking) return null;
    const host = await ctx.db.get(booking.hostId);
    const guest = await ctx.db.get(booking.guestId);
    if (!host || !guest) return null;

    return {
      callSessionId: session._id,
      bookingId: booking._id,
      role: isPerformer ? "performer" : "viewer",
      status: session.status,
      hostName: host.displayName,
      hostTagline: host.tagline,
      hostImageUrl: host.imageUrl ?? null,
      acts: host.acts,
      guestName: guest.name,
      eventType: booking.eventType,
      eventNote: booking.eventNote ?? null,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      minutes: booking.minutes,
      hostTimezone: booking.hostTimezone,
      hostJoined: booking.hostJoinedAt !== undefined,
    };
  },
});

// ───────────── My upcoming / live shows ─────────────

/** Shows I can still watch or perform (not ended, not long past), soonest first. */
export const listMyShows = query({
  args: {},
  handler: async (ctx): Promise<ShowListItem[]> => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const now = Date.now();

    const asViewer = await ctx.db
      .query("callSessions")
      .withIndex("by_requester", (q) => q.eq("requesterId", user._id))
      .order("desc")
      .take(LIST_LIMIT);
    const asPerformer = await ctx.db
      .query("callSessions")
      .withIndex("by_recipient_status", (q) =>
        q.eq("recipientId", user._id).eq("status", "accepted"),
      )
      .order("desc")
      .take(LIST_LIMIT);

    const live = (s: Doc<"callSessions">): boolean =>
      s.status === "accepted" && s.endsAt + LATE_GRACE_MS >= now;

    const viewerItems = await Promise.all(
      asViewer.filter(live).map(async (s): Promise<ShowListItem> => {
        const booking = await ctx.db.get(s.bookingId);
        const host = booking ? await ctx.db.get(booking.hostId) : null;
        return {
          callSessionId: s._id,
          bookingId: s.bookingId,
          role: "viewer",
          otherName: host?.displayName ?? "Dancer",
          hostImageUrl: host?.imageUrl ?? null,
          startsAt: s.scheduledFor,
          endsAt: s.endsAt,
        };
      }),
    );
    const performerItems = await Promise.all(
      asPerformer.filter(live).map(async (s): Promise<ShowListItem> => {
        const guest = await ctx.db.get(s.requesterId);
        return {
          callSessionId: s._id,
          bookingId: s.bookingId,
          role: "performer",
          otherName: guest?.name ?? "Guest",
          hostImageUrl: null,
          startsAt: s.scheduledFor,
          endsAt: s.endsAt,
        };
      }),
    );

    return [...viewerItems, ...performerItems].sort(
      (a, b) => a.startsAt - b.startsAt,
    );
  },
});

// ───────────── Party stage (up to 3 dancers at once) ─────────────

/** The paid shows of one party, so the party page can open up to 3 streams side by side. */
export const listPartyShows = query({
  args: { partyId: v.id("parties") },
  handler: async (ctx, { partyId }): Promise<PartyShow[]> => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const party = await ctx.db.get(partyId);
    if (!party || party.ownerId !== user._id) return [];

    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_party", (q) => q.eq("partyId", partyId))
      .collect();

    const shows = await Promise.all(
      bookings
        .filter((b) => b.status === "paid")
        .map(async (b): Promise<PartyShow> => {
          const host = await ctx.db.get(b.hostId);
          const session = await ctx.db
            .query("callSessions")
            .withIndex("by_booking", (q) => q.eq("bookingId", b._id))
            .unique();
          return {
            bookingId: b._id,
            callSessionId:
              session && session.status === "accepted" ? session._id : null,
            hostName: host?.displayName ?? "Dancer",
            hostImageUrl: host?.imageUrl ?? null,
            startsAt: b.startsAt,
            endsAt: b.endsAt,
          };
        }),
    );
    return shows.sort((a, b) => a.startsAt - b.startsAt);
  },
});

// ───────────── Dancer ends early ─────────────

/**
 * The dancer finishes before the booked time is up (party over, wrapped up).
 * She's paid in full because she showed up; only possible after she has joined,
 * so it can't be used to dodge the no-show rule.
 */
export const endShowEarly = mutation({
  args: { callSessionId: v.id("callSessions") },
  handler: async (ctx, { callSessionId }): Promise<null> => {
    const { user } = await requireHost(ctx);
    const session = await ctx.db.get(callSessionId);
    if (!session || session.recipientId !== user._id)
      throw new Error("Not your show");
    if (session.status !== "accepted") return null; // already ended

    const booking = await ctx.db.get(session.bookingId);
    if (!booking || booking.status !== "paid") return null;
    if (booking.hostJoinedAt === undefined) {
      throw new Error("Join the show before ending it");
    }

    const now = Date.now();
    await ctx.db.patch(booking._id, { status: "completed" });
    await ctx.db.patch(session._id, { status: "ended", endedAt: now });
    return null;
  },
});
