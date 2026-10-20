"use client";
// Up to 3 dancers streaming side by side for one party (parties.listPartyShows).
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ShowRoom } from "@/app/components/ShowRoom";

export function PartyWall({
  partyId,
}: {
  partyId: Id<"parties">;
}): React.JSX.Element {
  const shows = useQuery(api.calls.listPartyShows, { partyId });
  if (shows === undefined)
    return <p className="text-neutral-400">Loading stage…</p>;
  const live = shows.filter((s) => s.callSessionId !== null).slice(0, 3);
  if (live.length === 0) {
    return (
      <p className="text-neutral-400">No paid shows for this party yet.</p>
    );
  }
  return (
    <div
      className={`grid gap-3 ${
        live.length === 1
          ? "grid-cols-1"
          : live.length === 2
            ? "md:grid-cols-2"
            : "lg:grid-cols-3"
      }`}
    >
      {live.map((s) => (
        <figure key={s.bookingId} className="space-y-1">
          <div className="aspect-video">
            <ShowRoom
              callSessionId={s.callSessionId as Id<"callSessions">}
              compact
            />
          </div>
          <figcaption className="text-center text-sm text-neutral-300">
            {s.hostName}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
