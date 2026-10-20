// app/dancers/[id]/page.tsx  (replaces hosts/[id]: no gifts, no secret photos)
"use client";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

import { OnlineBadge } from "@/components/dancers/OnlineBadge";
import { RatingBadge } from "@/components/dancers/RatingBadge";
import { HalfHourSlotPicker } from "@/components/booking/HalfHourSlotPicker";
import { zar } from "@/lib/zar";
import { ActChips } from "@/components/dancers/ArtChips";
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const d = useQuery(api.hosts.getPublic, { hostId: id });
  const me = useQuery(api.user.getMe);
  if (d === undefined) return <p className="p-8">Loading…</p>;
  if (d === null) return <p className="p-8">Dancer not found.</p>;
  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6">
      <section className="grid gap-6 md:grid-cols-[18rem_1fr]">
        {d.imageUrl && (
          <img
            src={d.imageUrl}
            alt={d.displayName}
            className="w-full rounded-2xl border"
          />
        )}
        <div className="space-y-3">
          <OnlineBadge isOnline={d.isOnline} className="bg-white/10" />
          <h1 className="text-3xl font-bold">{d.displayName}</h1>
          <p className="text-neutral-300">{d.tagline}</p>
          <RatingBadge rating={d.rating} count={d.ratingCount} />
          <ActChips acts={d.acts} />
          <p className="text-neutral-300">{d.bio}</p>
          <p className="font-semibold">
            {zar(d.ratePerHalfHourCents)} / 30 min
          </p>
        </div>
      </section>
      <HalfHourSlotPicker
        hostId={d._id}
        hostTz={d.timezone}
        hostName={d.displayName}
        canBook={me?.role === "user" && me.onboardingChoice === "party"}
      />
    </main>
  );
}
