import { HOUR_MS } from "@/convex/lib/schedule";
import { cn } from "@/lib/utils";

export type BarTone = "free" | "booked" | "mine" | "selected";

export type BarSegment = {
  startsAt: number;
  endsAt: number;
  tone: BarTone;
};

const TONE_CLASS: Record<BarTone, string> = {
  free: "bg-emerald-500",
  booked: "bg-zinc-500",
  mine: "bg-sky-500",
  selected: "bg-pink-500",
};

/** Paint order: free shows first, selected show on top. */
const LAYER: Record<BarTone, number> = {
  free: 0,
  booked: 2,
  mine: 2,
  selected: 3,
};

function span(from: number, to: number, hourStart: number) {
  const a = Math.max(from, hourStart);
  const b = Math.min(to, hourStart + HOUR_MS);
  if (b <= a) return null;
  return {
    left: `${((a - hourStart) / HOUR_MS) * 100}%`,
    width: `${((b - a) / HOUR_MS) * 100}%`,
  };
}

/**
 * A 60-minute bar for one hour (left edge = :00, middle = :30, right edge = :60).
 * Shows run in 30-minute steps, so everything snaps to the :00 / :30 marks.
 *   green = a show you can book starts here   grey = booked by someone else
 *   blue  = your booking                      pink = the show you selected
 * Pass every segment for the day; each bar clips to its own hour.
 */
export function HourBar({
  hourStart,
  segments,
  closed = false,
  showScale = true,
}: {
  hourStart: number;
  segments: readonly BarSegment[];
  closed?: boolean;
  showScale?: boolean;
}) {
  const layers = [...segments].sort((a, b) => LAYER[a.tone] - LAYER[b.tone]);
  return (
    <div className="mt-2" aria-hidden>
      <div
        className={cn(
          "relative h-3 overflow-hidden rounded-full",
          closed ? "bg-zinc-800" : "bg-zinc-700/40",
        )}
      >
        {layers.map((s, i) => {
          const style = span(s.startsAt, s.endsAt, hourStart);
          return style ? (
            <div
              key={`${s.tone}${i}`}
              className={cn(
                "absolute inset-y-0",
                TONE_CLASS[s.tone],
                s.tone === "selected" && "ring-1 ring-pink-200",
              )}
              style={style}
            />
          ) : null;
        })}
        {/* the :30 mark */}
        <div className="absolute inset-y-0 left-1/2 w-px bg-black/40" />
      </div>
      {showScale && (
        <div className="mt-0.5 grid grid-cols-2 font-mono text-[9px] text-zinc-600">
          <span>:00</span>
          <span>:30</span>
        </div>
      )}
    </div>
  );
}
