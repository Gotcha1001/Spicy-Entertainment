"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  MAX_DAYS_AHEAD,
  dayEndMs,
  dayShiftLabel,
  dayStartMs,
  formatDayLong,
  formatHour,
  formatTime,
  hourOf,
  isSlotBookable,
  relativeDayLabel,
} from "@/convex/lib/schedule";
import { SLOT_MS, slotExists, slotStartMs } from "@/convex/lib/slots";
import { useZonedClock } from "@/hooks/useZonedClock";
import { useViewerTz } from "@/hooks/useViewerTz";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HourBar, type BarSegment } from "../HourBar";

type Props = {
  hostId: Id<"hosts">;
  /** HER time zone. Needed up front so "today" is her today. */
  hostTz: string;
  /** Length of the show the client picked, in 30-minute blocks (1–4). */
  blocks: number;
  /** Currently chosen start time (ms), or null. */
  selected: number | null;
  onSelectSlot: (startsAt: number) => void;
};

export function GirlCalendar({
  hostId,
  hostTz,
  blocks,
  selected,
  onSelectSlot,
}: Props) {
  const { now, dayIndex: today } = useZonedClock(hostTz, 15_000);
  const viewerTz = useViewerTz();
  const sameZone = viewerTz === hostTz;
  const maxDay = today + MAX_DAYS_AHEAD;
  const showMs = blocks * SLOT_MS;

  // null = "follow today", so the view stays right if the page is left open
  // past HER midnight.
  const [picked, setPicked] = useState<number | null>(null);
  const dayIndex =
    picked === null ? today : Math.min(Math.max(picked, today), maxDay);

  const fresh = useQuery(api.calendar.getDay, { hostId, dayIndex, blocks });

  // Keep showing the previous day while the next one loads, so the page
  // height doesn't collapse. `day` is only undefined on the very first load.
  const [day, setDay] = useState(fresh);
  if (fresh !== undefined && fresh !== day) setDay(fresh);
  const loading = fresh === undefined;

  function jump(delta: number) {
    setPicked(Math.min(Math.max(dayIndex + delta, today), maxDay));
  }

  const view = useMemo(() => {
    if (!day) return null;
    const tz = day.timezone;
    const dayStart = dayStartMs(day.dayIndex, tz);
    const dayEnd = dayEndMs(day.dayIndex, tz);

    // Free start times grouped by the (her-zone) hour they begin in. The
    // 1-hour lead time is applied here, against the live clock.
    const startsByHour = new Map<number, number[]>();
    let total = 0;
    for (const s of day.starts) {
      if (!isSlotBookable(s, now)) continue;
      const h = hourOf(s, tz);
      const list = startsByHour.get(h) ?? [];
      list.push(s);
      startsByHour.set(h, list);
      total += 1;
    }

    // Hours she works (a slot 2h or 2h+1 inside the hour), minus slots that
    // don't exist today, plus any hour that holds a booking.
    const working = new Set<number>();
    for (const slot of day.openSlots) {
      if (slotExists(day.dayIndex, slot, tz)) working.add(Math.floor(slot / 2));
    }
    const shown = new Set<number>(working);
    const hasBooking = new Set<number>();
    for (const seg of day.segments) {
      for (let t = seg.startsAt; t < seg.endsAt; t += SLOT_MS) {
        if (t >= dayStart && t < dayEnd) {
          const h = hourOf(t, tz);
          shown.add(h);
          hasBooking.add(h);
        }
      }
    }

    const booked: BarSegment[] = day.segments.map((s) => ({
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      tone: s.mine ? "mine" : "booked",
    }));

    return {
      tz,
      startsByHour,
      total,
      working,
      hasBooking,
      booked,
      hours: [...shown].sort((a, b) => a - b),
    };
  }, [day, now]);

  const selectedSegment: BarSegment[] =
    selected === null
      ? []
      : [{ startsAt: selected, endsAt: selected + showMs, tone: "selected" }];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={dayIndex <= today}
          onClick={() => jump(-1)}
        >
          ←
        </Button>
        <Button
          size="sm"
          variant={dayIndex === today ? "default" : "outline"}
          onClick={() => setPicked(null)}
        >
          Today
        </Button>
        <Button
          size="sm"
          variant={dayIndex === today + 1 ? "default" : "outline"}
          onClick={() => setPicked(today + 1)}
        >
          Tomorrow
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={dayIndex >= maxDay}
          onClick={() => jump(1)}
        >
          →
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={dayIndex >= maxDay}
          onClick={() => jump(7)}
        >
          +7 days
        </Button>
        <span className="ml-auto text-sm text-zinc-300">
          {relativeDayLabel(dayIndex, today)} · {formatDayLong(dayIndex)}
        </span>
      </div>

      <p className="text-xs text-zinc-500">
        &ldquo;Today&rdquo; and &ldquo;Tomorrow&rdquo; are her days. Every start
        time for a {blocks * 30}-minute show.
        {view && ` ${view.total} time${view.total === 1 ? "" : "s"} available.`}
      </p>

      {/* min-height keeps the page from shrinking when a quieter day loads. */}
      <div className="lg:min-h-[32rem]">
        {day === undefined && (
          <p className="text-sm text-zinc-500">Loading availability…</p>
        )}
        {day === null && (
          <p className="text-sm text-zinc-500">No availability for this day.</p>
        )}
        {day && view && view.hours.length === 0 && (
          <p className="text-sm text-zinc-500">
            She isn&apos;t working this day.
          </p>
        )}
        {day && view && view.hours.length > 0 && (
          <div
            className={cn(
              "grid gap-3 transition-opacity sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
              loading && "pointer-events-none opacity-50",
            )}
            aria-busy={loading}
          >
            {view.hours.map((h) => {
              const tz = view.tz;
              const hourStart = slotStartMs(day.dayIndex, h * 2, tz);
              const starts = view.startsByHour.get(h) ?? [];
              const isWorking = view.working.has(h);
              const status =
                starts.length > 0
                  ? `${starts.length} available`
                  : view.hasBooking.has(h)
                    ? "Booked"
                    : isWorking
                      ? "No times left"
                      : "Closed";
              const free: BarSegment[] = starts.map((s) => ({
                startsAt: s,
                endsAt: s + showMs,
                tone: "free",
              }));
              return (
                <div
                  key={h}
                  className={cn(
                    "rounded-xl border p-3",
                    isWorking
                      ? "accent-card bg-zinc-900/60"
                      : "border-zinc-800 bg-zinc-950/60",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-semibold text-zinc-100">
                      {formatHour(h)}
                      {!sameZone && (
                        <span className="ml-2 font-sans text-[11px] font-normal text-zinc-500">
                          you: {formatTime(hourStart, viewerTz)}
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] text-zinc-500">{status}</span>
                  </div>
                  <HourBar
                    hourStart={hourStart}
                    segments={[...view.booked, ...free, ...selectedSegment]}
                    closed={!isWorking}
                  />
                  {starts.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {starts.map((s) => {
                        const isSelected = selected === s;
                        const shift = sameZone
                          ? ""
                          : dayShiftLabel(s, tz, viewerTz);
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => onSelectSlot(s)}
                            aria-pressed={isSelected}
                            className={cn(
                              "rounded-lg px-2.5 py-1.5 text-left text-sm font-medium leading-tight transition",
                              isSelected
                                ? "bg-rose-600 text-white ring-2 ring-white"
                                : "border border-rose-500/60 bg-rose-600/15 text-white hover:bg-rose-600/35",
                            )}
                          >
                            {formatTime(s, tz)}
                            <span className="block text-[10px] font-normal opacity-75">
                              to {formatTime(s + showMs, tz)}
                            </span>
                            {!sameZone && (
                              <span className="mt-0.5 block text-[10px] font-normal opacity-90">
                                you: {formatTime(s, viewerTz)}
                                {shift && ` (${shift})`}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          Free show time
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-zinc-500" />
          Booked
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-sky-500" />
          Your booking
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-pink-500" />
          Selected
        </span>
      </div>
    </div>
  );
}
