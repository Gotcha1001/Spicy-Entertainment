// convex/lib/availability.ts
//
// SERVER-ONLY. Turns "weekly slots + one-day overrides + bookings" into the
// half-hour calendar. Used by calendar.ts (what the calendar shows) AND by
// bookings.ts (what createBooking allows), so what a party sees and what the
// server accepts can never disagree. REPLACES the old hourly availability.ts.
//
// A "day" and a "slot" are always in the DANCER's time zone. Bookings are UTC
// instants, so only the mapping onto her local calendar needs the zone.

import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { isValidTimeZone, weekdayOf } from "./schedule";
import { DEFAULT_OPEN_SLOTS, MAX_BLOCKS, SLOT_MS, type Segment } from "./slots";
import { getCurrentUser } from "./auth";

type Ctx = QueryCtx | MutationCtx;
type BookingDoc = Doc<"bookings">;

/** weekday (0 = Mon) -> open slots. `null` means she never saved her hours. */
export type WeeklySlots = Map<number, number[]> | null;

/** A booking starting this long before a window can still reach into it. */
const LOOKBACK_MS = MAX_BLOCKS * SLOT_MS;

// ───────────── host zone ─────────────

/** Her IANA zone, or throws. There is deliberately no silent default zone. */
export function requireHostTz(host: Doc<"hosts">): string {
  if (!isValidTimeZone(host.timezone))
    throw new Error("Dancer has no valid time zone");
  return host.timezone;
}

// ───────────── bookings ─────────────

/** Cancelled / expired / no-show / refunded bookings give the slot back. */
export function holdsSlot(status: BookingDoc["status"]): boolean {
  return (
    status === "pending_payment" || status === "paid" || status === "completed"
  );
}

/**
 * Bookings of one dancer that overlap [fromMs, toMs) and still hold their
 * slot. Uses the by_host_time index, so it never scans her whole history.
 */
export async function bookingsTouching(
  ctx: Ctx,
  hostId: Id<"hosts">,
  fromMs: number,
  toMs: number,
): Promise<BookingDoc[]> {
  const rows = await ctx.db
    .query("bookings")
    .withIndex("by_host_time", (q) =>
      q
        .eq("hostId", hostId)
        .gte("startsAt", fromMs - LOOKBACK_MS)
        .lt("startsAt", toMs),
    )
    .collect();
  return rows.filter((b) => holdsSlot(b.status) && b.endsAt > fromMs);
}

export function toSegments(
  bookings: readonly BookingDoc[],
  viewerId: Id<"users"> | null,
): Segment[] {
  return bookings.map((b) => ({
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    mine: viewerId !== null && b.guestId === viewerId,
  }));
}

// ───────────── working slots ─────────────

export async function loadWeekly(
  ctx: Ctx,
  hostId: Id<"hosts">,
): Promise<WeeklySlots> {
  const rows = await ctx.db
    .query("hostWeeklyHours")
    .withIndex("by_host", (q) => q.eq("hostId", hostId))
    .collect();
  if (rows.length === 0) return null;
  return new Map(rows.map((r) => [r.weekday, r.slots]));
}

/** Her usual slots for a weekday, before any one-day change. */
export function usualSlotsFor(
  weekly: WeeklySlots,
  weekday: number,
): readonly number[] {
  if (weekly === null) return DEFAULT_OPEN_SLOTS;
  return weekly.get(weekday) ?? [];
}

/** One-day overrides in an inclusive range of day indexes (in HER zone). */
export async function loadOverrides(
  ctx: Ctx,
  hostId: Id<"hosts">,
  firstDay: number,
  lastDay: number,
): Promise<Map<number, number[]>> {
  const rows = await ctx.db
    .query("hostDayOverrides")
    .withIndex("by_host_day", (q) =>
      q.eq("hostId", hostId).gte("dayIndex", firstDay).lte("dayIndex", lastDay),
    )
    .collect();
  return new Map(rows.map((r) => [r.dayIndex, r.slots]));
}

/** The slots she works on one date: the override if there is one, else her usual slots. */
export function effectiveSlots(
  weekly: WeeklySlots,
  overrides: Map<number, number[]>,
  dayIndex: number,
): { slots: number[]; isOverride: boolean } {
  const override = overrides.get(dayIndex);
  if (override) return { slots: override, isOverride: true };
  return {
    slots: [...usualSlotsFor(weekly, weekdayOf(dayIndex))],
    isOverride: false,
  };
}

/** Same, for a single day (used inside createBooking). */
export async function workingSlotsOn(
  ctx: Ctx,
  hostId: Id<"hosts">,
  weekly: WeeklySlots,
  dayIndex: number,
): Promise<number[]> {
  const overrides = await loadOverrides(ctx, hostId, dayIndex, dayIndex);
  return effectiveSlots(weekly, overrides, dayIndex).slots;
}

// ───────────── who is this dancer? ─────────────

export async function findMyHost(
  ctx: Ctx,
): Promise<{ user: Doc<"users">; host: Doc<"hosts"> } | null> {
  const user = await getCurrentUser(ctx);
  if (!user || user.role !== "host") return null;
  const host = await ctx.db
    .query("hosts")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .unique();
  return host ? { user, host } : null;
}
