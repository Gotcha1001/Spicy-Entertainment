"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { MAX_BLOCKS, MIN_BLOCKS, blocksToMinutes } from "@/convex/lib/slots";
import type { EventType } from "@/convex/lib/validators";
import { zar } from "@/lib/zar";

type Props = {
  hostId: Id<"hosts">;
  /** Her price per 30 minutes, in ZAR cents. */
  ratePerHalfHourCents: number;
};

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

const BLOCK_OPTIONS = Array.from(
  { length: MAX_BLOCKS - MIN_BLOCKS + 1 },
  (_, i) => MIN_BLOCKS + i,
);

// Value for <input type="datetime-local" min=...>, in local time
function localNowForInput(): string {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}

/**
 * Simple "type a date and time" booking form. The calendar picker
 * (HalfHourSlotPicker / BookCallPanel) is the better UI because it only offers
 * times that are really free; the server still rejects anything outside her
 * hours, off the :00/:30 grid, or already taken.
 */
export function BookingPicker({ hostId, ratePerHalfHourCents }: Props) {
  const router = useRouter();
  const ageStatus = useQuery(api.ageVerification.myAgeStatus);
  const createBooking = useMutation(api.bookings.createBooking);
  const initCheckout = useAction(api.payments.initCheckout);

  const [when, setWhen] = useState("");
  const [blocks, setBlocks] = useState<number>(MIN_BLOCKS);
  const [eventType, setEventType] = useState<EventType>("party");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalCents = ratePerHalfHourCents * blocks;

  async function onPay() {
    setError(null);
    if (ageStatus === null) return setError("Please sign in to book.");
    if (ageStatus && !ageStatus.ageVerified) {
      // Come back to this dancer after confirming age
      router.push(
        `/verify-age?next=${encodeURIComponent(`/dancers/${hostId}`)}`,
      );
      return;
    }
    if (!when) return setError("Pick a date and time");
    const startsAt = new Date(when).getTime();
    if (!Number.isFinite(startsAt) || startsAt < Date.now()) {
      return setError("Pick a time in the future");
    }
    setBusy(true);
    try {
      // The server works out the price. We only send who, when and how long.
      const bookingId = await createBooking({
        hostId,
        startsAt,
        blocks,
        eventType,
      });
      const url = await initCheckout({ bookingId });
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
      <label className="block text-sm">
        Date & time
        <input
          type="datetime-local"
          step={1800} // :00 and :30 only
          value={when}
          min={localNowForInput()}
          onChange={(e) => setWhen(e.target.value)}
          className="mt-1 w-full rounded-lg bg-neutral-900 p-2"
        />
      </label>
      <label className="block text-sm">
        Show length
        <select
          value={blocks}
          onChange={(e) => setBlocks(Number(e.target.value))}
          className="mt-1 w-full rounded-lg bg-neutral-900 p-2"
        >
          {BLOCK_OPTIONS.map((b) => (
            <option key={b} value={b}>
              {blocksToMinutes(b)} minutes
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Event
        <select
          value={eventType}
          onChange={(e) => setEventType(e.target.value as EventType)}
          className="mt-1 w-full rounded-lg bg-neutral-900 p-2"
        >
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {EVENT_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      <p className="text-lg font-semibold">Total: {zar(totalCents)}</p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        onClick={onPay}
        disabled={busy || ageStatus === undefined}
        className="w-full rounded-xl bg-pink-600 py-3 font-semibold disabled:opacity-50"
      >
        {busy ? "Redirecting to payment…" : "Book & pay"}
      </button>
    </div>
  );
}
