"use client";
// The booking panel on /dancers/[id]: pick a day, how many 30-min blocks (1-4),
// a start time, event type -> creates the booking -> Paystack checkout.
import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  formatDayShort,
  formatTime,
  relativeDayLabel,
  tzLabel,
} from "@/convex/lib/schedule";
import type { EventType } from "@/convex/lib/validators";
import { useSlotPicker } from "@/hooks/useSlotPicker";
import { useViewerTz } from "@/hooks/useViewerTz";
import { cn } from "@/lib/utils";
import { zar } from "@/lib/zar";

const EVENT_TYPES: EventType[] = [
  "party",
  "braai",
  "birthday",
  "corporate",
  "other",
];

const EVENT_LABELS: Record<EventType, string> = {
  party: "Party",
  braai: "Braai",
  birthday: "Birthday",
  corporate: "Corporate",
  other: "Other",
};

export function HalfHourSlotPicker({
  hostId,
  hostTz,
  hostName,
  canBook,
  partyId,
}: {
  hostId: Id<"hosts">;
  hostTz: string;
  hostName: string;
  /** True for party accounts only (server enforces it as well). */
  canBook: boolean;
  /** Optional: attach to a party so up to 3 dancers show on one stage. */
  partyId?: Id<"parties">;
}): React.JSX.Element {
  const p = useSlotPicker(hostId, hostTz);
  const viewerTz = useViewerTz();
  const createBooking = useMutation(api.bookings.createBooking);
  const initCheckout = useAction(api.payments.initCheckout);
  const [eventType, setEventType] = useState<EventType>("party");
  const [note, setNote] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const sameZone = viewerTz === hostTz;

  async function bookAndPay(): Promise<void> {
    if (p.startsAt === null) return;
    setBusy(true);
    try {
      const bookingId = await createBooking({
        hostId,
        startsAt: p.startsAt,
        blocks: p.blocks,
        eventType,
        eventNote: note.trim() || undefined,
        partyId,
      });
      const url = await initCheckout({ bookingId });
      window.location.href = url; // Paystack hosted checkout
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn’t start checkout");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 rounded-2xl border bg-white/5 p-5">
      <header>
        <h2 className="text-lg font-semibold">Book {hostName}</h2>
        <p className="text-sm text-amber-300">
          Times shown in her zone ({tzLabel(hostTz, p.now)})
          {!sameZone && " · your time in brackets"}
        </p>
      </header>

      {/* Day strip */}
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
        {p.days.map((d) => (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={d === p.dayIndex}
            onClick={() => p.setDayIndex(d)}
            className={cn(
              "shrink-0 rounded-xl border px-3 py-2 text-center text-sm",
              d === p.dayIndex
                ? "border-amber-400 bg-amber-400/15"
                : "border-white/15 hover:bg-white/10",
            )}
          >
            <div className="font-medium">{relativeDayLabel(d, p.today)}</div>
            <div className="text-xs text-neutral-400">{formatDayShort(d)}</div>
          </button>
        ))}
      </div>

      {/* Length */}
      <div>
        <p className="mb-2 text-sm font-medium">How long?</p>
        <div className="flex gap-2">
          {Array.from(
            { length: p.maxBlocks - p.minBlocks + 1 },
            (_, i) => p.minBlocks + i,
          ).map((b) => (
            <button
              key={b}
              type="button"
              aria-pressed={p.blocks === b}
              onClick={() => p.setBlocks(b)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                p.blocks === b
                  ? "border-amber-400 bg-amber-400/15"
                  : "border-white/15 hover:bg-white/10",
              )}
            >
              {b * 30} min
            </button>
          ))}
        </div>
      </div>

      {/* Start times */}
      <div>
        <p className="mb-2 text-sm font-medium">Start time</p>
        {p.loading ? (
          <p className="text-sm text-neutral-400">Loading times…</p>
        ) : p.unavailable ? (
          <p className="text-sm text-neutral-400">
            {hostName} isn’t taking bookings for this day.
          </p>
        ) : p.starts.length === 0 ? (
          <p className="text-sm text-neutral-400">
            Nothing free for {p.minutes} minutes that day. Try another day or a
            shorter show.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {p.starts.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={p.startsAt === s}
                onClick={() => p.setStartsAt(s)}
                className={cn(
                  "rounded-lg border px-2 py-2 text-sm",
                  p.startsAt === s
                    ? "border-amber-400 bg-amber-400/20 font-semibold"
                    : "border-white/15 hover:bg-white/10",
                )}
              >
                {formatTime(s, hostTz)}
                {!sameZone && (
                  <span className="block text-[11px] text-neutral-400">
                    ({formatTime(s, viewerTz)})
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Event */}
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Event</span>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value as EventType)}
            className="w-full rounded-lg border border-white/15 bg-transparent px-3 py-2"
          >
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t} className="text-black">
                {EVENT_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Note (optional)</span>
          <input
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. 30th birthday, fancy dress theme"
            className="w-full rounded-lg border border-white/15 bg-transparent px-3 py-2"
          />
        </label>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
        <div>
          <p className="text-2xl font-bold">
            {p.totalCents !== null ? zar(p.totalCents) : "…"}
          </p>
          <p className="text-xs text-neutral-400">
            {p.minutes} min live show · no nudity, no porn
          </p>
        </div>
        {canBook ? (
          <button
            type="button"
            disabled={p.startsAt === null || busy}
            onClick={bookAndPay}
            className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-6 py-2.5 font-semibold text-white hover:bg-rose-500 disabled:opacity-40"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Book &amp; pay with Paystack
          </button>
        ) : (
          <p className="text-sm text-neutral-400">
            Sign in with a party account (18+) to book.
          </p>
        )}
      </footer>
    </div>
  );
}
