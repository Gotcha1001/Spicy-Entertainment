"use client";
import { cn } from "@/lib/utils";
import { ACT_LABELS, type Act } from "@/convex/lib/validators";

const ALL_ACTS = Object.keys(ACT_LABELS) as Act[];

/** Read-only chips, e.g. on a card or profile. */
export function ActChips({
  acts,
  max,
}: {
  acts: readonly Act[];
  max?: number;
}): React.JSX.Element {
  const shown = max ? acts.slice(0, max) : acts;
  const extra = max ? acts.length - shown.length : 0;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {shown.map((a) => (
        <li
          key={a}
          className="rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-xs"
        >
          {ACT_LABELS[a]}
        </li>
      ))}
      {extra > 0 && (
        <li className="rounded-full px-2 py-0.5 text-xs text-neutral-400">
          +{extra}
        </li>
      )}
    </ul>
  );
}

/** Multi-select "what I'm good at" list for onboarding / profile editing. */
export function ActPicker({
  value,
  onChange,
  maxActs = 5,
}: {
  value: Act[];
  onChange: (next: Act[]) => void;
  /** Keep in sync with MAX_ACTS in convex/lib/hostRules.ts; the server enforces it too. */
  maxActs?: number;
}): React.JSX.Element {
  const toggle = (a: Act): void => {
    if (value.includes(a)) onChange(value.filter((x) => x !== a));
    else if (value.length < maxActs) onChange([...value, a]);
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Your acts">
        {ALL_ACTS.map((a) => {
          const on = value.includes(a);
          return (
            <button
              key={a}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(a)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition",
                on
                  ? "border-amber-400 bg-amber-400/15 text-amber-200"
                  : "border-white/15 hover:bg-white/10",
              )}
            >
              {ACT_LABELS[a]}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-neutral-400">
        {value.length}/{maxActs} chosen
      </p>
    </div>
  );
}
