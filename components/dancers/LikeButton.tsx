"use client";

import { useMutation, useQuery } from "convex/react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export function LikeButton({
  hostId,
  count,
  className = "",
}: {
  hostId: Id<"hosts">;
  count: number;
  className?: string;
}): React.JSX.Element {
  // Convex dedupes identical queries, so one subscription serves every card.
  const likedIds = useQuery(api.likes.myLikedHostIds);
  const toggle = useMutation(api.likes.toggle);
  const liked = likedIds?.includes(hostId) ?? false;

  return (
    <button
      type="button"
      aria-pressed={liked}
      aria-label={liked ? "Unlike" : "Like"}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          await toggle({ hostId });
        } catch (err) {
          toast.error(
            err instanceof Error ? err.message : "Couldn’t save like",
          );
        }
      }}
      className={`inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-xs text-white backdrop-blur transition hover:bg-black/70 ${className}`}
    >
      <Heart
        className={`h-4 w-4 ${liked ? "fill-rose-500 text-rose-500" : ""}`}
      />
      <span>{count}</span>
    </button>
  );
}
