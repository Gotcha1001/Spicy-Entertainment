"use client";

// app/hosts/[id]/page.tsx
//
// Older route kept working on the half-hour model. /dancers/[id] is the main
// profile page; this one uses the hour-card calendar (BookCallPanel).
//
// Layout (desktop):
//   1. Photo (left) + name / bio (right)
//   2. Book a show: full width, so the hour cards fill the space under the photo
// On mobile everything simply stacks in the same order.
//
// Gifts and secret photos were removed from the app, so they are gone here too.

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { tzLabel } from "@/convex/lib/schedule";
import { useNow } from "@/hooks/useNow";
import { useViewerTz } from "@/hooks/useViewerTz";
import { zar } from "@/lib/zar";
import { DualClock } from "@/app/components/DualClock";
import { BookCallPanel } from "@/app/components/booking/BookCallPanel";

export default function HostProfilePage() {
  const { id } = useParams<{ id: string }>();
  const host = useQuery(api.hosts.getPublic, { hostId: id });
  const me = useQuery(api.user.getMe);
  // Hooks must stay above the early returns below.
  const viewerTz = useViewerTz();
  const now = useNow(60_000);

  if (host === undefined) return <p className="p-8">Loading…</p>;
  if (host === null) return <p className="p-8">Dancer not found.</p>;

  const canBook = me?.role === "user" && me.onboardingChoice === "party";

  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6">
      {/* 1. Profile: photo + name/bio side by side on desktop */}
      <section className="grid gap-6 md:grid-cols-[minmax(0,22rem)_1fr] md:items-start">
        {host.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={host.imageUrl}
            alt={host.displayName}
            className="accent-card w-full rounded-2xl border"
          />
        )}
        <div>
          <h1 className="text-3xl font-bold">{host.displayName}</h1>
          {host.bio && <p className="mt-2 text-neutral-300">{host.bio}</p>}
          <p className="mt-3 font-semibold">
            {zar(host.ratePerHalfHourCents)} / 30 min
          </p>
        </div>
      </section>

      {/* 2. Booking: full width under the photo */}
      <section>
        <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="mb-1 text-lg font-semibold">Book a show</h2>
            <p className="text-sm font-medium text-amber-300">
              These are {host.displayName}&apos;s times (
              {tzLabel(host.timezone, now)})
            </p>
          </div>
          <div className="md:w-80 md:shrink-0">
            <DualClock
              primaryTz={host.timezone}
              primaryLabel="Her time"
              otherTz={viewerTz}
              otherLabel="Your time"
            />
          </div>
        </div>
        <BookCallPanel
          hostId={host._id}
          hostTz={host.timezone}
          ratePerHalfHourCents={host.ratePerHalfHourCents}
          canBook={canBook}
        />
      </section>
    </main>
  );
}
