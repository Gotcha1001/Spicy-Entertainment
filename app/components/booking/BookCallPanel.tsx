"use client";

import { useState } from "react";
import { useMutation, useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  dayIndexOf,
  dayShiftLabel,
  formatDayLong,
  formatTimeRange,
  tzLabel,
} from "@/convex/lib/schedule";
import {
  MAX_BLOCKS,
  MIN_BLOCKS,
  SLOT_MS,
  blocksToMinutes,
} from "@/convex/lib/slots";
import type { EventType } from "@/convex/lib/validators";
import { useViewerTz } from "@/hooks/useViewerTz";
import { zar } from "@/lib/zar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { AgeGateDialog } from "../AgeGateDialog";
import { GirlCalendar } from "./GirlCalendar";

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

export function BookCallPanel({
  hostId,
  hostTz,
  ratePerHalfHourCents,
  canBook,
  partyId,
}: {
  hostId: Id<"hosts">;
  hostTz: string;
  /** Her price per 30 minutes, in ZAR cents. */
  ratePerHalfHourCents: number;
  /** True for party accounts only (the server enforces it as well). */
  canBook: boolean;
  /** Optional: attach to a party so up to 3 dancers show on one stage. */
  partyId?: Id<"parties">;
}) {
  const viewerTz = useViewerTz();
  const [blocks, setBlocks] = useState<number>(MIN_BLOCKS);
  const [startsAt, setStartsAt] = useState<number | null>(null);
  const [eventType, setEventType] = useState<EventType>("party");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ageOpen, setAgeOpen] = useState(false);

  const ageStatus = useQuery(api.ageVerification.myAgeStatus);
  const createBooking = useMutation(api.bookings.createBooking);
  const initCheckout = useAction(api.payments.initCheckout);

  function chooseBlocks(b: number) {
    setBlocks(b);
    setStartsAt(null); // start times change with the length, so drop the old pick
    setError(null);
  }

  // Creates the booking and sends the client to Paystack.
  async function book() {
    if (startsAt == null) return;
    setBusy(true);
    setError(null);
    try {
      const bookingId = await createBooking({
        hostId,
        startsAt,
        blocks,
        eventType,
        eventNote: note.trim() || undefined,
        partyId,
      });
      const url = await initCheckout({ bookingId });
      window.location.href = url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      // Safety net if the age query was still loading when they clicked.
      if (msg.includes("Age verification")) setAgeOpen(true);
      else setError(msg);
      setBusy(false);
    }
  }

  function confirm() {
    if (startsAt == null || busy) return;
    if (!ageStatus?.ageVerified) {
      setAgeOpen(true);
      return;
    }
    void book();
  }

  const endsAt = startsAt == null ? 0 : startsAt + blocks * SLOT_MS;
  const sameZone = viewerTz === hostTz;
  const shift =
    startsAt == null || sameZone
      ? ""
      : dayShiftLabel(startsAt, hostTz, viewerTz);

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-sm text-zinc-400">Show length</p>
        <div className="flex flex-wrap gap-2">
          {BLOCK_OPTIONS.map((b) => {
            const isSelected = blocks === b;
            return (
              // Plain <button>, not the shadcn Button: its outline variant sets
              // its own border colour and can fight the themed border.
              <button
                key={b}
                type="button"
                aria-pressed={isSelected}
                onClick={() => chooseBlocks(b)}
                className={cn(
                  "accent-card rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400",
                  isSelected
                    ? "bg-rose-600 text-white hover:bg-rose-500"
                    : "bg-zinc-900/60 text-zinc-100 hover:bg-rose-600/20",
                )}
              >
                {blocksToMinutes(b)} min · {zar(ratePerHalfHourCents * b)}
              </button>
            );
          })}
        </div>
      </div>

      <GirlCalendar
        hostId={hostId}
        hostTz={hostTz}
        blocks={blocks}
        selected={startsAt}
        onSelectSlot={setStartsAt}
      />

      {startsAt != null && (
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
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {startsAt != null && (
        <div className="accent-card space-y-3 rounded-xl border bg-white/5 p-4">
          <div className="space-y-1 text-sm text-zinc-300">
            <p>
              <span className="text-zinc-500">Her time: </span>
              {formatDayLong(dayIndexOf(startsAt, hostTz))} ·{" "}
              {formatTimeRange(startsAt, endsAt, hostTz)}{" "}
              <span className="text-xs text-zinc-500">
                ({tzLabel(hostTz, startsAt)})
              </span>
            </p>
            {!sameZone && (
              <p>
                <span className="text-zinc-500">Your time: </span>
                {formatDayLong(dayIndexOf(startsAt, viewerTz))} ·{" "}
                {formatTimeRange(startsAt, endsAt, viewerTz)}{" "}
                <span className="text-xs text-zinc-500">
                  ({tzLabel(viewerTz, startsAt)})
                </span>
                {shift && (
                  <span className="ml-1 rounded bg-amber-500/20 px-1 text-xs text-amber-300">
                    {shift}
                  </span>
                )}
              </p>
            )}
            <p className="font-semibold text-white">
              Total: {zar(ratePerHalfHourCents * blocks)}
            </p>
          </div>
          {canBook ? (
            <Button
              className="w-full bg-rose-600 text-white hover:bg-rose-500"
              onClick={confirm}
              disabled={busy}
            >
              {busy ? "Redirecting to payment…" : "Continue to payment"}
            </Button>
          ) : (
            <p className="text-sm text-neutral-400">
              Sign in with a party account (18+) to book.
            </p>
          )}
        </div>
      )}

      <AgeGateDialog
        open={ageOpen}
        onOpenChange={setAgeOpen}
        onVerified={() => {
          setAgeOpen(false);
          void book(); // go straight on to payment, no second click
        }}
      />
    </div>
  );
}
