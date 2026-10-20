// convex/callAccess.ts
//
// THE single place that decides "may this person enter this show's room, and
// as what?". Called by the LiveKit token route (with the user's Convex token)
// BEFORE a token is issued, and by the call page to decide what to render.
//
// One-way video: the dancer is the "performer" (publishes camera + mic), the
// party is a "viewer" (watches only).

import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getCurrentUser } from "./lib/auth";
import { EARLY_JOIN_MS, LATE_GRACE_MS } from "./lib/showWindow";

export type ShowRole = "viewer" | "performer";

export type JoinInfo =
  | {
      ok: true;
      roomName: string;
      role: ShowRole;
      bookingId: Id<"bookings">;
      startsAt: number;
      endsAt: number;
      /** ms timestamp; LiveKit tokens must not outlive this. */
      validUntil: number;
    }
  | { ok: false; reason: string; retryable?: boolean };

export const getJoinInfo = query({
  // `tick` is ignored by the server. The client bumps it to force a re-run,
  // because Convex queries don't re-run just because time has passed.
  args: { callSessionId: v.id("callSessions"), tick: v.optional(v.number()) },
  handler: async (ctx, { callSessionId }): Promise<JoinInfo> => {
    const user = await getCurrentUser(ctx);
    if (!user) return { ok: false, reason: "Not signed in" };

    const session = await ctx.db.get(callSessionId);
    if (!session) return { ok: false, reason: "Show not found" };

    const isViewer = session.requesterId === user._id;
    const isPerformer = session.recipientId === user._id;
    if (!isViewer && !isPerformer)
      return { ok: false, reason: "Not your show" };

    if (session.status !== "accepted") {
      return { ok: false, reason: "This show has ended" };
    }

    const booking = await ctx.db.get(session.bookingId);
    if (!booking) return { ok: false, reason: "Booking not found" };
    if (booking.status !== "paid") {
      return { ok: false, reason: "This booking is not active" };
    }

    const host = await ctx.db.get(booking.hostId);
    if (!host || host.status === "suspended") {
      return { ok: false, reason: "Dancer unavailable" };
    }

    const now = Date.now();
    if (now < booking.startsAt - EARLY_JOIN_MS) {
      return {
        ok: false,
        reason: "Too early. The room opens 10 minutes before the start time.",
        retryable: true,
      };
    }
    if (now > booking.endsAt + LATE_GRACE_MS) {
      return { ok: false, reason: "This show’s time has passed" };
    }

    return {
      ok: true,
      roomName: session.roomName,
      role: isPerformer ? "performer" : "viewer",
      bookingId: booking._id,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      validUntil: booking.endsAt + LATE_GRACE_MS,
    };
  },
});
