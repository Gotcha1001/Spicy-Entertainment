import { cn } from "@/lib/utils";

/** Green pulse = active now (heartbeat fresh), grey = offline but bookable. */
export function OnlineBadge({
  isOnline,
  className,
}: {
  isOnline: boolean;
  className?: string;
}): React.JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-0.5 text-xs backdrop-blur",
        className,
      )}
    >
      <span className="relative flex h-2 w-2">
        {isOnline && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
        )}
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            isOnline ? "bg-emerald-400" : "bg-neutral-500",
          )}
        />
      </span>
      {isOnline ? "Active now" : "Offline"}
    </span>
  );
}
