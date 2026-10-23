import {
  dayIndexOf,
  dayShiftLabel,
  formatDayLong,
  formatTime,
  formatTimeRange,
  tzCity,
} from "@/convex/lib/schedule";

type Props = {
  ts: number;
  endTs?: number;
  /** Entertainer's zone. */
  hostTz: string;
  /** The other zone: the client's zone (or yours, when you are the client). */
  otherTz: string;
  hostLabel?: string; // e.g. "Twiggy’s time" | "Your time"
  otherLabel?: string; // "Your time" | "Client's time"
  /**
   * Which zone gets the big line.
   *  - "host"  (default): entertainer's zone is big. Use when the viewer IS the entertainer.
   *  - "other": otherTz is big and the entertainer's zone goes small underneath.
   *    Use when the viewer is the client, so they read their own time first.
   */
  bigSide?: "host" | "other";
  /** Include the date (bookings lists/details). */
  showDate?: boolean;
  className?: string;
};

export function DualTime({
  ts,
  endTs,
  hostTz,
  otherTz,
  hostLabel,
  otherLabel = "Your time",
  bigSide = "host",
  showDate = false,
  className,
}: Props) {
  const fmt = (tz: string) => {
    const t = endTs ? formatTimeRange(ts, endTs, tz) : formatTime(ts, tz);
    return showDate ? `${formatDayLong(dayIndexOf(ts, tz))} · ${t}` : t;
  };

  const bigIsHost = bigSide === "host";
  const bigTz = bigIsHost ? hostTz : otherTz;
  const smallTz = bigIsHost ? otherTz : hostTz;
  const bigLabel = bigIsHost ? hostLabel : otherLabel;
  // Neutral fallback when a caller forgets to pass hostLabel
  const smallLabel = bigIsHost
    ? otherLabel
    : (hostLabel ?? "Entertainer’s time");

  const same = hostTz === otherTz;
  // How many calendar days the small line's date is ahead/behind the big line's.
  const shift = same ? "" : dayShiftLabel(ts, bigTz, smallTz);

  return (
    <span className={`inline-flex flex-col leading-tight ${className ?? ""}`}>
      <span className="text-base font-semibold">
        {bigLabel && (
          <span className="mr-1.5 text-xs font-normal text-neutral-400">
            {bigLabel}
          </span>
        )}
        {fmt(bigTz)}
      </span>
      {!same && (
        <span className="mt-0.5 text-xs text-neutral-400">
          {smallLabel} {fmt(smallTz)} · {tzCity(smallTz)}
          {shift && (
            <span className="ml-1 rounded bg-amber-500/20 px-1 text-amber-300">
              {shift}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
