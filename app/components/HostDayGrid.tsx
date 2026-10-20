"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { FunctionReturnType } from "convex/server";

import type { api } from "@/convex/_generated/api";
import { dayShiftLabel, formatTimeRange, tzCity } from "@/convex/lib/schedule";
import { formatSlot, slotExists } from "@/convex/lib/slots";
import { SLOTS_PER_DAY } from "@/convex/lib/validators";
import { cn } from "@/lib/utils";

type Day = NonNullable<FunctionReturnType<typeof api.calendar.getMyDay>>;

// rose-* is remapped to the chosen accent in globals.css, so these follow the theme.
//   open   = dark card, accent border + glow (free to take bookings)
//   booked = filled with the accent, so it reads differently from "open"
//   mine   = sky blue
//   off    = flat grey, no glow
const SLOT_COLORS: Record<string, string> = {
  open: "accent-card bg-zinc-900/60 text-rose-50",
  booked: "accent-card bg-rose-600/40 text-white",
  mine: "border-sky-500/50 bg-sky-500/25 text-sky-100",
  off: "border-zinc-700 bg-zinc-800/50 text-zinc-500",
};

const STATE_LABEL: Record<string, string> = {
  open: "open",
  booked: "booked",
  mine: "booked",
  off: "off",
};

const BOOKING_LABEL: Record<string, string> = {
  paid: "Paid · open to start call",
  pending_payment: "Awaiting payment",
  completed: "Completed",
};

const SLOTS = Array.from({ length: SLOTS_PER_DAY }, (_, i) => i);

/**
 * The dancer's day in HER time zone (day.timezone): one cell per 30-minute
 * slot (48 per day). Tap an open or off slot to flip it for this day only.
 * Slots covered by a booking are locked. Every booking is listed underneath
 * with the client's local time.
 */
export function HostDayGrid({
  day,
  onToggleSlot,
}: {
  day: Day | null | undefined;
  onToggleSlot: (slot: number) => void;
}) {
  const bookings = useMemo(
    () => [...(day?.bookings ?? [])].sort((a, b) => a.startsAt - b.startsAt),
    [day],
  );

  const tz = day?.timezone ?? "UTC";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
        {SLOTS.map((s) => {
          // A slot that doesn't exist (clocks jumped forward): no cell.
          if (day && !slotExists(day.dayIndex, s, day.timezone)) return null;

          const state = day?.states[s] ?? "off";
          const locked = !day || state === "booked" || state === "mine";

          return (
            <button
              key={s}
              type="button"
              disabled={locked}
              onClick={() => onToggleSlot(s)}
              aria-label={`${formatSlot(s)}, ${STATE_LABEL[state]}`}
              className={cn(
                "rounded-lg border px-2 py-2 text-center transition-colors",
                "disabled:cursor-default",
                SLOT_COLORS[state],
                !locked && "hover:ring-1 hover:ring-rose-300/70",
              )}
            >
              <span className="block font-mono text-sm font-semibold">
                {formatSlot(s)}
              </span>
              <span className="block text-[10px] opacity-80">
                {STATE_LABEL[state]}
              </span>
            </button>
          );
        })}
      </div>

      {day && (
        <section className="accent-card space-y-2 rounded-xl border bg-zinc-900/60 p-3">
          <h2 className="text-sm font-semibold text-white">
            Bookings this day
          </h2>
          {bookings.length === 0 ? (
            <p className="text-xs text-zinc-400">No bookings yet.</p>
          ) : (
            <ul className="space-y-1">
              {bookings.map((b) => {
                const gTz = b.guestTimezone;
                const differs = !!gTz && gTz !== tz;
                const shift = differs ? dayShiftLabel(b.startsAt, tz, gTz) : "";
                return (
                  <li key={b._id}>
                    <Link
                      href={`/bookings/${b._id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-md bg-black/25 px-2 py-1.5 text-xs text-white transition hover:ring-1 hover:ring-rose-300/70"
                    >
                      <span className="font-mono font-semibold">
                        {formatTimeRange(b.startsAt, b.endsAt, tz)}
                      </span>
                      <span className="ml-1 opacity-90">
                        · {b.guestName} · {b.minutes}m
                      </span>
                      {differs && gTz && (
                        <span className="block opacity-80">
                          Client: {formatTimeRange(b.startsAt, b.endsAt, gTz)} ·{" "}
                          {tzCity(gTz)}
                          {shift && ` (${shift})`}
                        </span>
                      )}
                      <span className="block opacity-70">
                        {BOOKING_LABEL[b.status] ?? b.status}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
