"use client";
// The /dancers dashboard body. hosts.listActive already sorts online-first.
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ACT_LABELS, type Act } from "@/convex/lib/validators";
import { cn } from "@/lib/utils";
import { DancerCard } from "./DancerCard";

const ACTS = Object.keys(ACT_LABELS) as Act[];

export function DancerGrid(): React.JSX.Element {
  const [act, setAct] = useState<Act | undefined>(undefined);
  const dancers = useQuery(api.hosts.listActive, { act });
  const onlineCount = dancers?.filter((d) => d.isOnline).length ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <FilterPill
          active={act === undefined}
          onClick={() => setAct(undefined)}
        >
          All
        </FilterPill>
        {ACTS.map((a) => (
          <FilterPill key={a} active={act === a} onClick={() => setAct(a)}>
            {ACT_LABELS[a]}
          </FilterPill>
        ))}
      </div>

      {dancers === undefined ? (
        <p className="py-10 text-center text-neutral-400">Loading dancers…</p>
      ) : dancers.length === 0 ? (
        <p className="py-10 text-center text-neutral-400">
          No dancers match that act yet. Try “All”.
        </p>
      ) : (
        <>
          <p className="text-sm text-neutral-400">
            {onlineCount} active now · {dancers.length} bookable
          </p>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {dancers.map((d) => (
              <DancerCard key={d._id} dancer={d} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition",
        active
          ? "border-amber-400 bg-amber-400/15 text-amber-200"
          : "border-white/15 hover:bg-white/10",
      )}
    >
      {children}
    </button>
  );
}
