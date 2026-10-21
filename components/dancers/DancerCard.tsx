"use client";

import Link from "next/link";
import type { DancerCard as Dancer } from "@/convex/hosts";
import { useMoney } from "@/hooks/useMoney";
import { OnlineBadge } from "./OnlineBadge";
import { RatingBadge } from "./RatingBadge";
import { ActChips } from "./ArtChips";

export function DancerCard({ dancer }: { dancer: Dancer }): React.JSX.Element {
  const { show, ready } = useMoney();
  const hostCurrency = dancer.currency ?? "ZAR";

  return (
    <Link
      href={`/dancers/${dancer._id}`}
      className="accent-card group overflow-hidden rounded-2xl border bg-white/5"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-neutral-800">
        {dancer.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={dancer.imageUrl}
            alt={dancer.displayName}
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        )}
        <OnlineBadge
          isOnline={dancer.isOnline}
          className="absolute left-2 top-2"
        />
      </div>
      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate font-semibold">{dancer.displayName}</h3>
          <RatingBadge rating={dancer.rating} count={dancer.ratingCount} />
        </div>
        <p className="line-clamp-1 text-sm text-neutral-300">
          {dancer.tagline}
        </p>
        <ActChips acts={dancer.acts} max={3} />
        <p className="text-sm">
          <strong>
            {ready ? show(dancer.ratePerHalfHourCents, hostCurrency) : "…"}
          </strong>
          <span className="text-neutral-400"> / 30 min</span>
          {dancer.city && (
            <span className="text-neutral-500"> · {dancer.city}</span>
          )}
        </p>
      </div>
    </Link>
  );
}
