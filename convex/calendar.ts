// convex/calendar.ts
//
// Half-hour calendar. Every handler works in the DANCER's time zone
// (host.timezone). Day indexes that come in and go out are days in HER zone,
// not the caller's.

import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  MAX_RANGE_DAYS,
  MIN_LEAD_MS,
  dayEndMs,
  dayIndexOf,
  dayStartMs,
  lastBookableDay,
  type SlotState,
} from "./lib/schedule";
import {
  daySlotStates,
  cleanSlots,
  isValidBlocks,
  openStarts,
  slotStartMs,
  type Segment,
} from "./lib/slots";
import {
  bookingsTouching,
  effectiveSlots,
  findMyHost,
  loadOverrides,
  loadWeekly,
  requireHostTz,
  toSegments,
} from "./lib/availability";
import { getCurrentUser, requireHost } from "./lib/auth";
import { isBookable } from "./lib/hostRules";
import type { EventType, BookingStatus } from "./lib/validators";

// ───────────── Types ─────────────

export type DayAvailability = {
  dayIndex: number;
  timezone: string;
  isOverride: boolean;
  openSlots: number[];
  /** Start times (UTC ms) where a show of the requested length fits. Client applies the lead time. */
  starts: number[];
  segments: Segment[];
  hostName: string;
  ratePerHalfHourCents: number;
};

export type RangeDay = {
  dayIndex: number;
  timezone: string;
  isOverride: boolean;
  openSlots: number[];
  states: SlotState[];
};

export type HostBookingRow = {
  _id: Id<"bookings">;
  startsAt: number;
  endsAt: number;
  minutes: number;
  status: BookingStatus;
  eventType: EventType;
  guestName: string;
  guestTimezone: string | null;
  hostShareCents: number;
};

async function hostBookingRows(
  ctx: Parameters<typeof findMyHost>[0],
  bookings: readonly Doc<"bookings">[],
): Promise<HostBookingRow[]> {
  return await Promise.all(
    bookings.map(async (b): Promise<HostBookingRow> => {
      const guest = await ctx.db.get(b.guestId);
      return {
        _id: b._id,
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        minutes: b.minutes,
        status: b.status,
        eventType: b.eventType,
        guestName: guest?.name ?? "Guest",
        guestTimezone: b.guestTimezone ?? guest?.timezone ?? null,
        hostShareCents: b.hostShareCents,
      };
    }),
  );
}

// ───────────── PUBLIC (party booking calendar) ─────────────

/** One day's availability for a dancer, in HER zone. `blocks` = how many 30-min blocks the party wants (1–4). */
export const getDay = query({
  args: {
    hostId: v.id("hosts"),
    dayIndex: v.number(), // day index in the DANCER's zone
    blocks: v.number(),
  },
  handler: async (
    ctx,
    { hostId, dayIndex, blocks },
  ): Promise<DayAvailability | null> => {
    if (!isValidBlocks(blocks)) return null;
    const host = await ctx.db.get(hostId);
    if (!host || !isBookable(host)) return null;
    const tz = requireHostTz(host);

    const now = Date.now();
    if (dayIndex < dayIndexOf(now, tz) || dayIndex > lastBookableDay(now, tz))
      return null;

    const weekly = await loadWeekly(ctx, hostId);
    const overrides = await loadOverrides(ctx, hostId, dayIndex, dayIndex);
    const { slots, isOverride } = effectiveSlots(weekly, overrides, dayIndex);

    const bookings = await bookingsTouching(
      ctx,
      hostId,
      dayStartMs(dayIndex, tz),
      dayEndMs(dayIndex, tz),
    );
    const viewer = await getCurrentUser(ctx);
    const segments = toSegments(bookings, viewer?._id ?? null);

    return {
      dayIndex,
      timezone: tz,
      isOverride,
      openSlots: slots,
      starts: openStarts({
        dayIndex,
        openSlots: slots,
        busy: segments,
        blocks,
        tz,
      }),
      segments,
      hostName: host.displayName,
      ratePerHalfHourCents: host.ratePerHalfHourCents,
    };
  },
});

/** Multi-day range (week view), days in HER zone. Max MAX_RANGE_DAYS. Applies the lead time. */
export const getRange = query({
  args: { hostId: v.id("hosts"), fromDay: v.number(), toDay: v.number() }, // toDay inclusive
  handler: async (ctx, { hostId, fromDay, toDay }): Promise<RangeDay[]> => {
    if (toDay < fromDay || toDay - fromDay + 1 > MAX_RANGE_DAYS) {
      throw new Error(`Range must be 1–${MAX_RANGE_DAYS} days`);
    }
    const host = await ctx.db.get(hostId);
    if (!host || !isBookable(host)) return [];
    const tz = requireHostTz(host);

    const now = Date.now();
    const today = dayIndexOf(now, tz);
    const last = lastBookableDay(now, tz);

    const weekly = await loadWeekly(ctx, hostId);
    const overrides = await loadOverrides(ctx, hostId, fromDay, toDay);
    const bookings = await bookingsTouching(
      ctx,
      hostId,
      dayStartMs(fromDay, tz),
      dayStartMs(toDay + 1, tz),
    );
    const viewer = await getCurrentUser(ctx);
    const segments = toSegments(bookings, viewer?._id ?? null);
    const leadCutoff = now + MIN_LEAD_MS;

    const days: RangeDay[] = [];
    for (let d = fromDay; d <= toDay; d++) {
      if (d < today || d > last) continue;
      const { slots, isOverride } = effectiveSlots(weekly, overrides, d);
      const states = daySlotStates(d, slots, segments, tz).map(
        (s, slot): SlotState =>
          s === "open" && slotStartMs(d, slot, tz) < leadCutoff ? "off" : s,
      );
      days.push({
        dayIndex: d,
        timezone: tz,
        isOverride,
        openSlots: slots,
        states,
      });
    }
    return days;
  },
});

// ───────────── DANCER-ONLY ─────────────

/** Her own day: slot states + booking details (guest names + their zone). */
export const getMyDay = query({
  args: { dayIndex: v.number() },
  handler: async (
    ctx,
    { dayIndex },
  ): Promise<{
    dayIndex: number;
    timezone: string;
    isOverride: boolean;
    openSlots: number[];
    states: SlotState[];
    bookings: HostBookingRow[];
  } | null> => {
    const me = await findMyHost(ctx);
    if (!me) return null;
    const tz = requireHostTz(me.host);

    const weekly = await loadWeekly(ctx, me.host._id);
    const overrides = await loadOverrides(ctx, me.host._id, dayIndex, dayIndex);
    const { slots, isOverride } = effectiveSlots(weekly, overrides, dayIndex);

    const bookings = await bookingsTouching(
      ctx,
      me.host._id,
      dayStartMs(dayIndex, tz),
      dayEndMs(dayIndex, tz),
    );
    return {
      dayIndex,
      timezone: tz,
      isOverride,
      openSlots: slots,
      states: daySlotStates(dayIndex, slots, toSegments(bookings, null), tz),
      bookings: await hostBookingRows(ctx, bookings),
    };
  },
});

/** Her bookings across a day range in HER zone (list views). */
export const getMyBookingsAround = query({
  args: { fromDay: v.number(), toDay: v.number() },
  handler: async (ctx, { fromDay, toDay }): Promise<HostBookingRow[]> => {
    const me = await findMyHost(ctx);
    if (!me) return [];
    const tz = requireHostTz(me.host);
    const bookings = await bookingsTouching(
      ctx,
      me.host._id,
      dayStartMs(fromDay, tz),
      dayStartMs(toDay + 1, tz),
    );
    return await hostBookingRows(ctx, bookings);
  },
});

/** Her weekly map for the settings UI. `slots: null` = never saved (default hours apply). */
export const getMyWeeklyHours = query({
  args: {},
  handler: async (
    ctx,
  ): Promise<Array<{ weekday: number; slots: number[] | null }> | null> => {
    const me = await findMyHost(ctx);
    if (!me) return null;
    const weekly = await loadWeekly(ctx, me.host._id);
    return Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      slots: weekly === null ? null : (weekly.get(weekday) ?? []),
    }));
  },
});

/** Save her weekly slots for one weekday (0 = Mon … 6 = Sun). Wall-clock in her zone. */
export const setWeeklyHours = mutation({
  args: { weekday: v.number(), slots: v.array(v.number()) },
  handler: async (ctx, { weekday, slots }): Promise<null> => {
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      throw new Error("weekday must be 0–6");
    }
    const cleaned = cleanSlots(slots);
    const { host } = await requireHost(ctx);
    requireHostTz(host);

    const existing = await ctx.db
      .query("hostWeeklyHours")
      .withIndex("by_host_weekday", (q) =>
        q.eq("hostId", host._id).eq("weekday", weekday),
      )
      .unique();
    if (existing) await ctx.db.patch(existing._id, { slots: cleaned });
    else
      await ctx.db.insert("hostWeeklyHours", {
        hostId: host._id,
        weekday,
        slots: cleaned,
      });
    return null;
  },
});

/** Set / replace a one-day override (day in HER zone). Empty = day off. */
export const setDayOverride = mutation({
  args: { dayIndex: v.number(), slots: v.array(v.number()) },
  handler: async (ctx, { dayIndex, slots }): Promise<null> => {
    const cleaned = cleanSlots(slots);
    const { host } = await requireHost(ctx);
    const tz = requireHostTz(host);
    if (dayIndex < dayIndexOf(Date.now(), tz))
      throw new Error("Cannot change past days");

    const existing = await ctx.db
      .query("hostDayOverrides")
      .withIndex("by_host_day", (q) =>
        q.eq("hostId", host._id).eq("dayIndex", dayIndex),
      )
      .unique();
    if (existing) await ctx.db.patch(existing._id, { slots: cleaned });
    else
      await ctx.db.insert("hostDayOverrides", {
        hostId: host._id,
        dayIndex,
        slots: cleaned,
      });
    return null;
  },
});

/** Remove an override → fall back to her weekly slots. */
export const clearDayOverride = mutation({
  args: { dayIndex: v.number() },
  handler: async (ctx, { dayIndex }): Promise<null> => {
    const { host } = await requireHost(ctx);
    const existing = await ctx.db
      .query("hostDayOverrides")
      .withIndex("by_host_day", (q) =>
        q.eq("hostId", host._id).eq("dayIndex", dayIndex),
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});
