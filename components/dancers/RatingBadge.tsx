import { Star } from "lucide-react";

/** Average out of 10, or "New" until the first rating. */
export function RatingBadge({
  rating,
  count,
}: {
  rating: number | null;
  count: number;
}): React.JSX.Element {
  if (rating === null) {
    return <span className="text-xs text-neutral-400">New</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      <strong>{rating.toFixed(1)}</strong>
      <span className="text-neutral-400">/10 ({count})</span>
    </span>
  );
}
