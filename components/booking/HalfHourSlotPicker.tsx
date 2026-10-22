// "use client";
// // The booking panel on /dancers/[id]: pick a day, how many 30-min blocks (1-4),
// // a start time, event type -> creates the booking -> Paystack checkout.
// import { useState } from "react";
// import { useAction, useMutation } from "convex/react";
// import { toast } from "sonner";
// import { Loader2 } from "lucide-react";
// import { api } from "@/convex/_generated/api";
// import type { Id } from "@/convex/_generated/dataModel";
// import {
//   MIN_MS,
//   dayShiftLabel,
//   formatDayShort,
//   formatTime,
//   relativeDayLabel,
//   tzLabel,
// } from "@/convex/lib/schedule";
// import type { EventType } from "@/convex/lib/validators";
// import { useSlotPicker } from "@/hooks/useSlotPicker";
// import { useViewerTz } from "@/hooks/useViewerTz";
// import { useMoney } from "@/hooks/useMoney";
// import { cn } from "@/lib/utils";
// import { DualClock } from "@/app/components/DualClock";
// import { DualTime } from "@/app/components/DualTime";
// const EVENT_TYPES: EventType[] = [
//   "party",
//   "braai",
//   "birthday",
//   "corporate",
//   "other",
// ];
// const EVENT_LABELS: Record<EventType, string> = {
//   party: "Party",
//   braai: "Braai",
//   birthday: "Birthday",
//   corporate: "Corporate",
//   other: "Other",
// };
// export function HalfHourSlotPicker({
//   hostId,
//   hostTz,
//   hostName,
//   hostCurrency = "ZAR",
//   canBook,
//   partyId,
// }: {
//   hostId: Id<"hosts">;
//   hostTz: string;
//   hostName: string;
//   /**
//    * Currency the dancer's rate is stored in (hosts.currency).
//    * totalCents from useSlotPicker is in this currency; we convert for display.
//    */
//   hostCurrency?: string;
//   /** True for party accounts only (server enforces it as well). */
//   canBook: boolean;
//   /** Optional: attach to a party so up to 3 dancers show on one stage. */
//   partyId?: Id<"parties">;
// }): React.JSX.Element {

//   const p = useSlotPicker(hostId, hostTz);
//   const viewerTz = useViewerTz();
//   const { show, ready } = useMoney();
//   const createBooking = useMutation(api.bookings.createBooking);
//   const initCheckout = useAction(api.payments.initCheckout);
//   const [eventType, setEventType] = useState<EventType>("party");
//   const [note, setNote] = useState<string>("");
//   const [busy, setBusy] = useState<boolean>(false);
//   const sameZone = viewerTz === hostTz;
//   async function bookAndPay(): Promise<void> {
//     if (p.startsAt === null) return;
//     setBusy(true);
//     try {
//       const bookingId = await createBooking({
//         hostId,
//         startsAt: p.startsAt,
//         blocks: p.blocks,
//         eventType,
//         eventNote: note.trim() || undefined,
//         partyId,
//       });
//       const url = await initCheckout({ bookingId });
//       window.location.href = url; // Paystack hosted checkout
//     } catch (e) {
//       toast.error(e instanceof Error ? e.message : "Couldn’t start checkout");
//       setBusy(false);
//     }
//   }
//   return (
//     <div className="space-y-5 rounded-2xl border bg-white/5 p-5">
//       <header className="space-y-3">
//         <div>
//           <h2 className="text-lg font-semibold">Book {hostName}</h2>
//           <p className="text-sm text-amber-300">
//             Times shown in your zone ({tzLabel(viewerTz, p.now)})
//             {sameZone ? " · same as hers" : " · her time in brackets"}
//           </p>
//         </div>
//         {/* Live clocks: yours first, then hers with the hour difference. */}
//         <DualClock
//           primaryTz={viewerTz}
//           primaryLabel="Your time"
//           otherTz={hostTz}
//           otherLabel="Her time"
//         />
//       </header>
//       {/* Day strip */}
//       <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
//         {p.days.map((d) => (
//           <button
//             key={d}
//             type="button"
//             role="tab"
//             aria-selected={d === p.dayIndex}
//             onClick={() => p.setDayIndex(d)}
//             className={cn(
//               "shrink-0 rounded-xl border px-3 py-2 text-center text-sm",
//               d === p.dayIndex
//                 ? "border-amber-400 bg-amber-400/15"
//                 : "border-white/15 hover:bg-white/10",
//             )}
//           >
//             <div className="font-medium">{relativeDayLabel(d, p.today)}</div>
//             <div className="text-xs text-neutral-400">{formatDayShort(d)}</div>
//           </button>
//         ))}
//       </div>
//       {!sameZone && (
//         <p className="-mt-2 text-xs text-neutral-400">
//           Days follow {hostName}&apos;s calendar. A time with a date tag falls
//           on a different day for you.
//         </p>
//       )}
//       {/* Length */}
//       <div>
//         <p className="mb-2 text-sm font-medium">How long?</p>
//         <div className="flex gap-2">
//           {Array.from(
//             { length: p.maxBlocks - p.minBlocks + 1 },
//             (_, i) => p.minBlocks + i,
//           ).map((b) => (
//             <button
//               key={b}
//               type="button"
//               aria-pressed={p.blocks === b}
//               onClick={() => p.setBlocks(b)}
//               className={cn(
//                 "rounded-full border px-3 py-1 text-sm",
//                 p.blocks === b
//                   ? "border-amber-400 bg-amber-400/15"
//                   : "border-white/15 hover:bg-white/10",
//               )}
//             >
//               {b * 30} min
//             </button>
//           ))}
//         </div>
//       </div>
//       {/* Start times */}
//       <div>
//         <p className="mb-2 text-sm font-medium">Start time</p>
//         {p.loading ? (
//           <p className="text-sm text-neutral-400">Loading times…</p>
//         ) : p.unavailable ? (
//           <p className="text-sm text-neutral-400">
//             {hostName} isn’t taking bookings for this day.
//           </p>
//         ) : p.starts.length === 0 ? (
//           <p className="text-sm text-neutral-400">
//             Nothing free for {p.minutes} minutes that day. Try another day or a
//             shorter show.
//           </p>
//         ) : (
//           <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
//             {p.starts.map((s) => {
//               // Slots are computed in HER zone; only the labels are flipped.
//               // shift = how many days HER date is ahead (+) / behind (-) yours.
//               const shift = sameZone ? "" : dayShiftLabel(s, viewerTz, hostTz);
//               return (
//                 <button
//                   key={s}
//                   type="button"
//                   aria-pressed={p.startsAt === s}
//                   onClick={() => p.setStartsAt(s)}
//                   className={cn(
//                     "rounded-lg border px-2 py-2 text-sm",
//                     p.startsAt === s
//                       ? "border-amber-400 bg-amber-400/20 font-semibold"
//                       : "border-white/15 hover:bg-white/10",
//                   )}
//                 >
//                   {formatTime(s, viewerTz)}
//                   {!sameZone && (
//                     <span className="block text-[11px] text-neutral-400">
//                       (her {formatTime(s, hostTz)})
//                     </span>
//                   )}
//                   {shift && (
//                     <span
//                       className="mt-0.5 inline-block rounded bg-amber-500/20 px-1 text-[10px] text-amber-300"
//                       title="Her date vs yours for this time"
//                     >
//                       her date {shift}
//                     </span>
//                   )}
//                 </button>
//               );
//             })}
//           </div>
//         )}
//       </div>
//       {/* Event */}
//       <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
//         <label className="text-sm">
//           <span className="mb-1 block font-medium">Event</span>
//           <select
//             value={eventType}
//             onChange={(e) => setEventType(e.target.value as EventType)}
//             className="w-full rounded-lg border border-white/15 bg-transparent px-3 py-2"
//           >
//             {EVENT_TYPES.map((t) => (
//               <option key={t} value={t} className="text-black">
//                 {EVENT_LABELS[t]}
//               </option>
//             ))}
//           </select>
//         </label>
//         <label className="text-sm">
//           <span className="mb-1 block font-medium">Note (optional)</span>
//           <input
//             value={note}
//             maxLength={200}
//             onChange={(e) => setNote(e.target.value)}
//             placeholder="e.g. 30th birthday, fancy dress theme"
//             className="w-full rounded-lg border border-white/15 bg-transparent px-3 py-2"
//           />
//         </label>
//       </div>
//       {p.startsAt !== null && (
//         <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3">
//           <p className="mb-1 text-xs text-neutral-400">Your booking</p>
//           <DualTime
//             ts={p.startsAt}
//             endTs={p.startsAt + p.minutes * MIN_MS}
//             hostTz={hostTz}
//             otherTz={viewerTz}
//             bigSide="other"
//             hostLabel="Her time"
//             otherLabel="Your time"
//             showDate
//           />
//         </div>
//       )}
//       <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
//         <div>
//           <p className="text-2xl font-bold">
//             {p.totalCents !== null && ready
//               ? show(p.totalCents, hostCurrency)
//               : "…"}
//           </p>
//           <p className="text-xs text-neutral-400">
//             {p.minutes} min live show · no nudity, no porn
//           </p>
//         </div>
//         {canBook ? (
//           <button
//             type="button"
//             disabled={p.startsAt === null || busy}
//             onClick={bookAndPay}
//             className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-6 py-2.5 font-semibold text-white hover:bg-rose-500 disabled:opacity-40"
//           >
//             {busy && <Loader2 className="h-4 w-4 animate-spin" />}
//             Book &amp; pay with Paystack
//           </button>
//         ) : (
//           <p className="text-sm text-neutral-400">
//             Sign in with a party account (18+) to book.
//           </p>
//         )}
//       </footer>
//     </div>
//   );
// }

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
  MIN_MS,
  dayShiftLabel,
  formatDayShort,
  formatTime,
  relativeDayLabel,
  tzLabel,
} from "@/convex/lib/schedule";
import type { EventType } from "@/convex/lib/validators";
import { useSlotPicker } from "@/hooks/useSlotPicker";
import { useViewerTz } from "@/hooks/useViewerTz";
import { useMoney } from "@/hooks/useMoney";
import { cn } from "@/lib/utils";
import { possessive, shortName } from "@/lib/names";
import { DualClock } from "@/app/components/DualClock";
import { DualTime } from "@/app/components/DualTime";

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
  hostCurrency = "ZAR",
  canBook,
  partyId,
}: {
  hostId: Id<"hosts">;
  hostTz: string;
  hostName: string;
  /**
   * Currency the dancer's rate is stored in (hosts.currency).
   * totalCents from useSlotPicker is in this currency; we convert for display.
   */
  hostCurrency?: string;
  /** True for party accounts only (server enforces it as well). */
  canBook: boolean;
  /** Optional: attach to a party so up to 3 dancers show on one stage. */
  partyId?: Id<"parties">;
}): React.JSX.Element {
  const p = useSlotPicker(hostId, hostTz);
  const viewerTz = useViewerTz();
  const { show, ready } = useMoney();
  const createBooking = useMutation(api.bookings.createBooking);
  const initCheckout = useAction(api.payments.initCheckout);
  const [eventType, setEventType] = useState<EventType>("party");
  const [note, setNote] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);

  const sameZone = viewerTz === hostTz;
  const nameShort = shortName(hostName);
  const namePossessive = possessive(nameShort);
  const entertainerTimeLabel = `${namePossessive} time`;

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
      <header className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Book {hostName}</h2>
          <p className="text-sm text-amber-300">
            Times shown in your zone ({tzLabel(viewerTz, p.now)})
            {sameZone
              ? ` · same as ${nameShort}`
              : ` · ${namePossessive} time in brackets`}
          </p>
        </div>

        {/* Live clocks: yours first, then the entertainer's with the hour difference. */}
        <DualClock
          primaryTz={viewerTz}
          primaryLabel="Your time"
          otherTz={hostTz}
          otherLabel={entertainerTimeLabel}
        />
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

      {!sameZone && (
        <p className="-mt-2 text-xs text-neutral-400">
          Days follow {namePossessive} calendar. A time with a date tag falls on
          a different day for you.
        </p>
      )}

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
            {p.starts.map((s) => {
              // Slots are computed in the entertainer's zone; only the labels are flipped.
              // shift = how many days their date is ahead (+) / behind (-) yours.
              const shift = sameZone ? "" : dayShiftLabel(s, viewerTz, hostTz);
              return (
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
                  {formatTime(s, viewerTz)}
                  {!sameZone && (
                    <span className="block text-[11px] text-neutral-400">
                      ({nameShort} {formatTime(s, hostTz)})
                    </span>
                  )}
                  {shift && (
                    <span
                      className="mt-0.5 inline-block rounded bg-amber-500/20 px-1 text-[10px] text-amber-300"
                      title={`${namePossessive} date vs yours for this time`}
                    >
                      {nameShort} date {shift}
                    </span>
                  )}
                </button>
              );
            })}
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

      {p.startsAt !== null && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3">
          <p className="mb-1 text-xs text-neutral-400">Your booking</p>
          <DualTime
            ts={p.startsAt}
            endTs={p.startsAt + p.minutes * MIN_MS}
            hostTz={hostTz}
            otherTz={viewerTz}
            bigSide="other"
            hostLabel={entertainerTimeLabel}
            otherLabel="Your time"
            showDate
          />
        </div>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
        <div>
          <p className="text-2xl font-bold">
            {p.totalCents !== null && ready
              ? show(p.totalCents, hostCurrency)
              : "…"}
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
