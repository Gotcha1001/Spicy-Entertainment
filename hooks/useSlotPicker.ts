"use client";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  dayIndexOf,
  isSlotBookable,
  lastBookableDay,
} from "@/convex/lib/schedule";
import { MAX_BLOCKS, MIN_BLOCKS } from "@/convex/lib/slots";
import { useNow } from "@/hooks/useNow";

/**
 * State + data behind the half-hour slot picker. Days are in the DANCER's time
 * zone (that's what calendar.getDay expects).
 */
export function useSlotPicker(hostId: Id<"hosts">, hostTz: string) {
  const now = useNow(60_000);
  const today = dayIndexOf(now, hostTz);
  const lastDay = lastBookableDay(now, hostTz);

  const [dayIndex, setDayIndexRaw] = useState<number>(today);
  const [blocks, setBlocksRaw] = useState<number>(MIN_BLOCKS);
  const [pickedStart, setPickedStart] = useState<number | null>(null);

  const day = useQuery(api.calendar.getDay, { hostId, dayIndex, blocks });

  // The server doesn't apply the lead time (client does, per the DayAvailability doc).
  const starts = useMemo(
    () => (day?.starts ?? []).filter((s) => isSlotBookable(s, now)),
    [day, now],
  );

  // Derived, not synced: a pick that is no longer offered (someone booked it,
  // the lead time passed, the length changed) simply reads as "nothing picked".
  const startsAt =
    pickedStart !== null && starts.includes(pickedStart) ? pickedStart : null;

  const days = useMemo(() => {
    const out: number[] = [];
    for (let d = today; d <= Math.min(lastDay, today + 13); d++) out.push(d);
    return out;
  }, [today, lastDay]);

  return {
    now,
    today,
    days,
    dayIndex,
    setDayIndex: (d: number) => {
      setDayIndexRaw(d);
      setPickedStart(null);
    },
    blocks,
    setBlocks: (b: number) => {
      setBlocksRaw(Math.min(MAX_BLOCKS, Math.max(MIN_BLOCKS, b)));
      setPickedStart(null);
    },
    startsAt,
    setStartsAt: setPickedStart,
    loading: day === undefined,
    unavailable: day === null, // dancer paused, or day out of range
    starts,
    ratePerHalfHourCents: day?.ratePerHalfHourCents ?? null,
    minutes: blocks * 30,
    totalCents:
      day?.ratePerHalfHourCents != null
        ? day.ratePerHalfHourCents * blocks
        : null,
    maxBlocks: MAX_BLOCKS,
    minBlocks: MIN_BLOCKS,
  };
}
