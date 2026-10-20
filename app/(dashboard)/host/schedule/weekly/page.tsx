"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { WEEKDAY_LONG } from "@/convex/lib/schedule";
import { ALL_SLOTS, DEFAULT_OPEN_SLOTS, formatSlot } from "@/convex/lib/slots";
import { useZonedClock } from "@/hooks/useZonedClock";
import { useViewerTz } from "@/hooks/useViewerTz";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function WeeklyHoursPage() {
  // Hooks stay above the early returns.
  const hostTz = useViewerTz();
  const { timeLabel, label } = useZonedClock(hostTz);
  const [error, setError] = useState<string | null>(null);

  const weekly = useQuery(api.calendar.getMyWeeklyHours);
  const setWeekly = useMutation(api.calendar.setWeeklyHours);

  if (weekly === undefined) {
    return <p className="p-4 text-zinc-400">Loading…</p>;
  }
  if (weekly === null) {
    return <p className="p-4 text-zinc-400">Host profile required.</p>;
  }

  // `slot` is a half-hour index, 0–47 (0 = 00:00, 1 = 00:30 … 47 = 23:30).
  // `current` is null until she has saved once; the grid then shows the
  // defaults, so toggling must start from the same defaults.
  async function toggle(
    weekday: number,
    slot: number,
    current: number[] | null,
  ) {
    setError(null);
    const set = new Set<number>(current ?? DEFAULT_OPEN_SLOTS);
    if (set.has(slot)) set.delete(slot);
    else set.add(slot);
    try {
      await setWeekly({
        weekday,
        slots: [...set].sort((a, b) => a - b),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4 pb-16">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Weekly hours</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/host/schedule">← Day calendar</Link>
        </Button>
      </div>

      <div className="space-y-1">
        <p className="text-sm text-zinc-300">
          All times in your time zone:{" "}
          <span className="font-semibold">{label}</span> · now{" "}
          <span className="font-mono font-semibold">{timeLabel}</span>
        </p>
        <p className="text-sm text-zinc-400">
          Each box is a 30-minute slot. These are your default open hours.
          One-day overrides on the day calendar take priority.
        </p>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      {weekly.map(({ weekday, slots }) => {
        const open = new Set<number>(slots ?? DEFAULT_OPEN_SLOTS);
        return (
          <section key={weekday} className="space-y-2">
            <h2 className="text-sm font-medium text-zinc-300">
              {WEEKDAY_LONG[weekday]}
              {slots === null && (
                <span className="ml-2 text-xs text-zinc-500">
                  (defaults 16:00–23:00 until you save)
                </span>
              )}
            </h2>
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8">
              {ALL_SLOTS.map((s) => {
                const on = open.has(s);
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(weekday, s, slots)}
                    className={cn(
                      "rounded-md border px-1 py-2 text-center font-mono text-xs transition",
                      on
                        ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-100"
                        : "border-zinc-800 bg-zinc-900/50 text-zinc-500",
                    )}
                  >
                    {formatSlot(s)}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
