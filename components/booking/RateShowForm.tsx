"use client";
// Shown on /bookings/[id] after a show: the party rates the dancer 1-10.
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export function RateShowForm({
  bookingId,
}: {
  bookingId: Id<"bookings">;
}): React.JSX.Element | null {
  const status = useQuery(api.reviews.getForBooking, { bookingId });
  const submit = useMutation(api.reviews.submitReview);
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);

  if (!status) return null;
  if (status.existing) {
    return (
      <p className="rounded-xl border bg-white/5 p-4 text-sm">
        You rated this show <strong>{status.existing.score}/10</strong>. Thanks!
      </p>
    );
  }
  if (!status.canReview) return null;

  async function send(): Promise<void> {
    if (score === null) return;
    setBusy(true);
    try {
      await submit({ bookingId, score, comment: comment.trim() || undefined });
      toast.success("Thanks for rating!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn’t save rating");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border bg-white/5 p-4">
      <h3 className="font-semibold">How was the show?</h3>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={score === n}
            onClick={() => setScore(n)}
            className={cn(
              "h-9 w-9 rounded-full border text-sm",
              score === n
                ? "border-amber-400 bg-amber-400 text-black"
                : "border-white/15 hover:bg-white/10",
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={300}
        rows={2}
        placeholder="Anything to add? (optional)"
        className="w-full rounded-lg border border-white/15 bg-transparent px-3 py-2 text-sm"
      />
      <button
        type="button"
        disabled={score === null || busy}
        onClick={send}
        className="rounded-full bg-rose-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        Submit rating
      </button>
    </div>
  );
}
