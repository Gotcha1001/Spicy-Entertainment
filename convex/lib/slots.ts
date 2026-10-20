// convex/lib/slots.ts
//
// Pure half-hour slot maths, shared by Convex AND the browser (no server
// imports). REPLACES the old hourly slots.ts.
//
// A day has 48 slots: 0 = 00:00, 1 = 00:30 … 47 = 23:30, always on the
// DANCER's local wall clock (`tz` = host.timezone). A booking is 1–4
// consecutive 30-minute blocks (30–120 min), stored as real UTC instants.
//
// Needs from ./schedule.ts (unchanged): DAY_MS, MIN_MS, dayIndexOf,
// tzOffsetMs, wallToUtc, SlotState.
//
// DST: South Africa has none, so this stays simple. On a DST night the
// repeated hour is only offered once (first occurrence) and the skipped hour
// is "off" — nothing breaks, it just isn't bookable.

import {
  DAY_MS,
  MIN_MS,
  dayIndexOf,
  tzOffsetMs,
  wallToUtc,
  type SlotState,
} from "./schedule";
import { SLOT_MINUTES, SLOTS_PER_DAY } from "./validators";

export const SLOT_MS = SLOT_MINUTES * MIN_MS;
export const MIN_BLOCKS = 1;
export const MAX_BLOCKS = 4; // 2 hours, matches MAX_CALL_MINUTES in schedule.ts

/** Every slot index in a day: 0–47. Used by the weekly-hours grid. */
export const ALL_SLOTS: readonly number[] = Array.from(
  { length: SLOTS_PER_DAY },
  (_, i) => i,
);

/** Used when a dancer has never saved weekly hours: 16:00–23:00 (slots 32–45). */
export const DEFAULT_OPEN_SLOTS: readonly number[] = Array.from(
  { length: 14 },
  (_, i) => 32 + i,
);

/** A booked block of real time. */
export type Busy = { startsAt: number; endsAt: number };
/** A booking drawn on the calendar. `mine` = the viewer's own booking. */
export type Segment = Busy & { mine: boolean };

export function blocksToMinutes(blocks: number): number {
  return blocks * SLOT_MINUTES;
}

export function isValidBlocks(blocks: number): boolean {
  return (
    Number.isInteger(blocks) && blocks >= MIN_BLOCKS && blocks <= MAX_BLOCKS
  );
}

/** Validates + sorts a list of slot indexes (0–47). Throws a readable error. */
export function cleanSlots(input: readonly number[]): number[] {
  const set = new Set<number>();
  for (const s of input) {
    if (!Number.isInteger(s) || s < 0 || s >= SLOTS_PER_DAY) {
      throw new Error(
        `Slots must be whole numbers from 0 to ${SLOTS_PER_DAY - 1}`,
      );
    }
    set.add(s);
  }
  return [...set].sort((a, b) => a - b);
}

/** Epoch ms of slot `slot` on local day `dayIndex`. `slot` may be 48 (= next day's start). */
export function slotStartMs(
  dayIndex: number,
  slot: number,
  tz: string,
): number {
  return wallToUtc(dayIndex * DAY_MS + slot * SLOT_MS, tz);
}

/** Local slot index (0–47) at instant `ts` in `tz`. */
export function slotIndexOf(ts: number, tz: string): number {
  const local = ts + tzOffsetMs(ts, tz);
  return Math.floor((((local % DAY_MS) + DAY_MS) % DAY_MS) / SLOT_MS);
}

/** False when that local slot doesn't exist (clocks jumped forward). */
export function slotExists(
  dayIndex: number,
  slot: number,
  tz: string,
): boolean {
  const ts = slotStartMs(dayIndex, slot, tz);
  return dayIndexOf(ts, tz) === dayIndex && slotIndexOf(ts, tz) === slot;
}

/** True when `ts` sits exactly on a local :00 or :30. */
export function isOnSlotGrid(ts: number, tz: string): boolean {
  if (!Number.isInteger(ts)) return false;
  const local = ts + tzOffsetMs(ts, tz);
  return ((local % SLOT_MS) + SLOT_MS) % SLOT_MS === 0;
}

export function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Her open slots as unbroken runs of real UTC time. A show can't bridge two
 * runs (e.g. open 18:00–20:00 and 21:00–23:00 gives two runs).
 */
export function openRuns(
  dayIndex: number,
  openSlots: readonly number[],
  tz: string,
): Array<readonly [number, number]> {
  const slots = [...new Set(openSlots)]
    .filter((s) => Number.isInteger(s) && s >= 0 && s < SLOTS_PER_DAY)
    .sort((a, b) => a - b);
  const runs: Array<[number, number]> = [];
  for (const s of slots) {
    const from = slotStartMs(dayIndex, s, tz);
    const to = slotStartMs(dayIndex, s + 1, tz);
    if (to <= from) continue; // slot doesn't exist today
    const last = runs[runs.length - 1];
    if (last && last[1] === from) last[1] = to;
    else runs.push([from, to]);
  }
  return runs;
}

/** Does [startsAt, endsAt) sit fully inside one of her working runs? */
export function fitsInRuns(
  startsAt: number,
  endsAt: number,
  runs: ReadonlyArray<readonly [number, number]>,
): boolean {
  return runs.some(([from, to]) => startsAt >= from && endsAt <= to);
}

/**
 * Every start time where a show of `blocks` × 30 min fits that local day:
 * inside her working run and clear of every existing booking.
 * Does NOT apply the lead time — the client does that against its live clock.
 */
export function openStarts(opts: {
  dayIndex: number;
  openSlots: readonly number[];
  busy: readonly Busy[];
  blocks: number;
  tz: string;
}): number[] {
  const { dayIndex, openSlots, busy, blocks, tz } = opts;
  const duration = blocks * SLOT_MS;
  const runs = openRuns(dayIndex, openSlots, tz);
  const out: number[] = [];
  for (const s of [...new Set(openSlots)].sort((a, b) => a - b)) {
    if (!Number.isInteger(s) || s < 0 || s >= SLOTS_PER_DAY) continue;
    if (!slotExists(dayIndex, s, tz)) continue;
    const start = slotStartMs(dayIndex, s, tz);
    const end = start + duration;
    if (!fitsInRuns(start, end, runs)) continue;
    if (busy.some((b) => overlaps(start, end, b.startsAt, b.endsAt))) continue;
    out.push(start);
  }
  return out;
}

/**
 * 48 slot states for one LOCAL day.
 *   off    = she isn't working (or the slot doesn't exist today)
 *   open   = free (client still applies the lead time on top)
 *   booked = someone else has it (never says who)
 *   mine   = the viewer's own booking
 * A booking always wins over "off", so trimming her hours later never hides
 * a booking that already exists.
 */
export function daySlotStates(
  dayIndex: number,
  openSlots: readonly number[],
  segments: readonly Segment[],
  tz: string,
): SlotState[] {
  const open = new Set(openSlots);
  return Array.from({ length: SLOTS_PER_DAY }, (_, s): SlotState => {
    if (!slotExists(dayIndex, s, tz)) return "off";
    const start = slotStartMs(dayIndex, s, tz);
    const end = slotStartMs(dayIndex, s + 1, tz);
    const seg = segments.find((g) =>
      overlaps(start, end, g.startsAt, g.endsAt),
    );
    if (seg) return seg.mine ? "mine" : "booked";
    return open.has(s) ? "open" : "off";
  });
}

/** 33 -> "16:30" (display only). */
export function formatSlot(slot: number): string {
  const h = Math.floor(slot / 2);
  const m = slot % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
}

/** "2d 4h", "3h 05m", "12m 09s", "45s" (display only). */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "0s";
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3_600);
  const m = Math.floor((total % 3_600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}
