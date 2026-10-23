// app/dancers/[id]/page.tsx
"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

import { OnlineBadge } from "@/components/dancers/OnlineBadge";
import { RatingBadge } from "@/components/dancers/RatingBadge";
import { LikeButton } from "@/components/dancers/LikeButton";
import { HalfHourSlotPicker } from "@/components/booking/HalfHourSlotPicker";
import { ActChips } from "@/components/dancers/ArtChips";
import { useMoney } from "@/hooks/useMoney";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const d = useQuery(api.hosts.getPublic, { hostId: id });
  const me = useQuery(api.user.getMe);
  const { show, ready } = useMoney();

  if (d === undefined) return <p className="p-8">Loading…</p>;
  if (d === null) return <p className="p-8">Dancer not found.</p>;

  const hostCurrency = d.currency ?? "ZAR";

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6">
      <section className="grid gap-6 md:grid-cols-[18rem_1fr]">
        {d.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
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
          {/* Rating + likes side by side */}
          <div className="flex flex-wrap items-center gap-3">
            <RatingBadge rating={d.rating} count={d.ratingCount} />
            <LikeButton
              hostId={d._id}
              count={d.likeCount}
              className="bg-white/10 hover:bg-white/20"
            />
          </div>
          <ActChips acts={d.acts} />
          <p className="text-neutral-300">{d.bio}</p>
          <p className="font-semibold">
            {ready
              ? `${show(d.ratePerHalfHourCents, hostCurrency)} / 30 min`
              : "…"}
          </p>
        </div>
      </section>
      <HalfHourSlotPicker
        hostId={d._id}
        hostTz={d.timezone}
        hostName={d.displayName}
        hostCurrency={hostCurrency}
        canBook={me?.role === "user" && me.onboardingChoice === "party"}
      />
    </main>
  );
}
