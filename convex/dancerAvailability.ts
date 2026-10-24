// convex/dancerAvailability.ts
//
// "Who is free in this window?" for the /dancers search.
//
// Uses the SAME helpers as calendar.getDay and bookings.createBooking
// (loadWeekly / loadOverrides / effectiveSlots / bookingsTouching / openStarts),
// so a dancer shown as free here always has a slot the booking page will
// actually let you book. The 1-hour lead time is applied here.
//
// Cost: ~3 small indexed reads per bookable dancer. Fine for a few hundred
// dancers. It only runs while the "Free" filter is on (the client passes "skip"
// otherwise), and re-runs automatically when a booking or her hours change.

import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  DAY_MS,
  MAX_DAYS_AHEAD,
  MIN_LEAD_MS,
  dayIndexOf,
  isValidTimeZone,
} from "./lib/schedule";
import { isValidBlocks, openStarts } from "./lib/slots";
import {
  bookingsTouching,
  effectiveSlots,
  loadOverrides,
  loadWeekly,
} from "./lib/availability";
import { isBookable } from "./lib/hostRules";

/** Longest window one call may cover (keeps the work bounded). */
const MAX_WINDOW_MS = 48 * 60 * 60 * 1000;

export type FreeDancer = {
  hostId: Id<"hosts">;
  /** First bookable start (UTC ms) inside the window. */
  nextStartsAt: number;
};

export const freeInWindow = query({
  args: {
    fromMs: v.number(),
    toMs: v.number(),
    /** Show length in 30-minute blocks (1-4). */
    blocks: v.number(),
  },
  handler: async (ctx, { fromMs, toMs, blocks }): Promise<FreeDancer[]> => {
    if (!isValidBlocks(blocks)) return [];

    const now = Date.now();
    const from = Math.max(fromMs, now + MIN_LEAD_MS);
    const to = Math.min(
      toMs,
      from + MAX_WINDOW_MS,
      now + MAX_DAYS_AHEAD * DAY_MS,
    );
    if (to <= from) return [];

    // Same candidate set as hosts.listActive.
    const online = await ctx.db
      .query("hosts")
      .withIndex("by_status_online", (q) =>
        q.eq("status", "active").eq("isOnline", true),
      )
      .take(100);
    const offline = await ctx.db
      .query("hosts")
      .withIndex("by_status_online", (q) =>
        q.eq("status", "active").eq("isOnline", false),
      )
      .take(100);

    const out: FreeDancer[] = [];

    for (const host of [...online, ...offline]) {
      if (!isBookable(host) || !isValidTimeZone(host.timezone)) continue;
      const tz = host.timezone;

      // Days are in HER zone; the window is a pair of real instants.
      const firstDay = dayIndexOf(from, tz);
      const lastDay = dayIndexOf(to - 1, tz);

      const weekly = await loadWeekly(ctx, host._id);
      const overrides = await loadOverrides(ctx, host._id, firstDay, lastDay);
      const busy = await bookingsTouching(ctx, host._id, from, to);

      let next: number | undefined;
      for (let day = firstDay; day <= lastDay && next === undefined; day++) {
        const { slots } = effectiveSlots(weekly, overrides, day);
        const starts = openStarts({
          dayIndex: day,
          openSlots: slots,
          busy,
          blocks,
          tz,
        });
        next = starts.find((s) => s >= from && s < to);
      }

      if (next !== undefined)
        out.push({ hostId: host._id, nextStartsAt: next });
    }

    return out;
  },
});
