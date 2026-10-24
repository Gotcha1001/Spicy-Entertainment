"use client";
// components/dancers/DancerGrid.tsx
//
// The /dancers dashboard body: text search, act, "free when", price, rating,
// sort. One Convex subscription loads the bookable dancers and everything else
// runs in the browser, so typing is instant. The only extra query is
// dancerAvailability.freeInWindow, and it only runs while a "free when" preset
// is selected. Filters (except price) are mirrored into the URL.

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { ACT_LABELS, type Act } from "@/convex/lib/validators";
import { dayIndexOf } from "@/convex/lib/schedule";
import { minorDigits } from "@/convex/lib/currency";
import { cn } from "@/lib/utils";
import { useMoney } from "@/hooks/useMoney";
import { useNow } from "@/hooks/useNow";
import { useViewerTz } from "@/hooks/useViewerTz";
import {
  DEFAULT_FILTERS,
  SORT_LABELS,
  WHEN_LABELS,
  hasActiveFilters,
  searchDancers,
  windowFor,
  type DancerFilters,
  type SortKey,
  type WhenKey,
} from "@/lib/dancerSearch";
import { DancerCard } from "./DancerCard";

const ACTS = Object.keys(ACT_LABELS) as Act[];
const SORTS = Object.keys(SORT_LABELS) as SortKey[];
const WHENS = Object.keys(WHEN_LABELS) as WhenKey[];
const RATING_STEPS = [0, 7, 8, 9];
const BUCKET_MS = 5 * 60_000; // keeps the availability query from resubscribing every second

function filtersFromUrl(p: URLSearchParams): DancerFilters {
  const act = p.get("act") as Act | null;
  const sort = p.get("sort") as SortKey | null;
  const when = p.get("when") as WhenKey | null;
  const rating = Number(p.get("rating"));
  return {
    query: p.get("q") ?? "",
    act: act && ACTS.includes(act) ? act : undefined,
    onlineOnly: p.get("online") === "1",
    minRating: RATING_STEPS.includes(rating) ? rating : 0,
    maxPrice: null, // viewer-currency amount, so never shared in a link
    when: when && WHENS.includes(when) ? when : "any",
    sort: sort && SORTS.includes(sort) ? sort : "recommended",
  };
}

function filtersToQuery(f: DancerFilters): string {
  const p = new URLSearchParams();
  if (f.query.trim()) p.set("q", f.query.trim());
  if (f.act) p.set("act", f.act);
  if (f.onlineOnly) p.set("online", "1");
  if (f.minRating > 0) p.set("rating", String(f.minRating));
  if (f.when !== "any") p.set("when", f.when);
  if (f.sort !== "recommended") p.set("sort", f.sort);
  return p.toString();
}

/** "Free from 20:30", "Free tomorrow from 18:00" (in the viewer's zone). */
function freeLabel(ts: number, now: number, tz: string): string {
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  }).format(ts);
  const days = dayIndexOf(ts, tz) - dayIndexOf(now, tz);
  if (days <= 0) return `Free from ${time}`;
  if (days === 1) return `Free tomorrow from ${time}`;
  const weekday = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    timeZone: tz,
  }).format(ts);
  return `Free ${weekday} from ${time}`;
}

export function DancerGrid(): React.JSX.Element {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<DancerFilters>(() =>
    filtersFromUrl(new URLSearchParams(searchParams.toString())),
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const { viewerCurrency, ready: moneyReady, toViewer, own } = useMoney();
  const tz = useViewerTz();
  const now = useNow(60_000);

  // listActive already returns online dancers first; we re-sort locally.
  const all = useQuery(api.hosts.listActive, {});

  // ── "Free when": only asks the server while a preset is chosen ──
  const bucketNow = Math.floor(now / BUCKET_MS) * BUCKET_MS;
  const win = useMemo(
    () =>
      filters.when === "any" ? null : windowFor(filters.when, bucketNow, tz),
    [filters.when, bucketNow, tz],
  );
  const free = useQuery(
    api.dancerAvailability.freeInWindow,
    win ? { fromMs: win.fromMs, toMs: win.toMs, blocks: 1 } : "skip",
  );
  // Keep the last answer for THIS preset while the 5-minute refresh loads,
  // so the grid doesn't flash. (Set-state-during-render is React's documented pattern.)
  const [kept, setKept] = useState<{
    when: WhenKey;
    rows: NonNullable<typeof free>;
  } | null>(null);
  if (
    free !== undefined &&
    filters.when !== "any" &&
    (kept?.rows !== free || kept?.when !== filters.when)
  ) {
    setKept({ when: filters.when, rows: free });
  }
  const freeRows =
    free ?? (kept?.when === filters.when ? kept.rows : undefined);
  const available = useMemo(
    () =>
      filters.when === "any" || !freeRows
        ? null
        : new Map(freeRows.map((r) => [r.hostId as string, r.nextStartsAt])),
    [filters.when, freeRows],
  );
  const waitingForAvailability = filters.when !== "any" && available === null;

  // ── price range, in the viewer's currency ──
  const priceOf = useMemo(
    () => (d: { ratePerHalfHourCents: number; currency: string }) =>
      moneyReady
        ? toViewer(d.ratePerHalfHourCents, d.currency)
        : d.ratePerHalfHourCents,
    [moneyReady, toViewer],
  );
  const bounds = useMemo(() => {
    if (!all || !moneyReady || all.length === 0) return null;
    const prices = all.map(priceOf);
    const unit = 10 ** minorDigits(viewerCurrency);
    const lo = Math.floor(Math.min(...prices) / unit) * unit;
    const rawHi = Math.max(...prices);
    const step = Math.max(unit, Math.round((rawHi - lo) / 40 / unit) * unit);
    const hi = lo + Math.ceil((rawHi - lo) / step) * step;
    return hi > lo ? { lo, hi, step } : null;
  }, [all, moneyReady, priceOf, viewerCurrency]);

  const results = useMemo(
    () =>
      all && !waitingForAvailability
        ? searchDancers(all, filters, { price: priceOf, available })
        : undefined,
    [all, filters, priceOf, available, waitingForAvailability],
  );

  const set = (patch: Partial<DancerFilters>) =>
    setFilters((f) => ({ ...f, ...patch }));

  // Mirror filters into the URL (debounced, no history spam, no re-render).
  useEffect(() => {
    const id = setTimeout(() => {
      const qs = filtersToQuery(filters);
      window.history.replaceState(
        null,
        "",
        qs ? `?${qs}` : window.location.pathname,
      );
    }, 300);
    return () => clearTimeout(id);
  }, [filters]);

  // Press "/" anywhere to jump to the search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        el?.tagName === "INPUT" ||
        el?.tagName === "TEXTAREA" ||
        el?.tagName === "SELECT" ||
        el?.isContentEditable;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onlineCount = results?.filter((d) => d.isOnline).length ?? 0;
  const filtered = hasActiveFilters(filters);
  const sliderValue = filters.maxPrice ?? bounds?.hi ?? 0;
  // Rating + price live in a collapsible panel; the badge says how many are set.
  const extraCount =
    (filters.minRating > 0 ? 1 : 0) + (filters.maxPrice !== null ? 1 : 0);

  const selectClass =
    "rounded-full border border-white/15 bg-neutral-900 px-4 py-2.5 text-sm outline-none focus:border-amber-400";

  return (
    <div className="space-y-4">
      {/* Row 1: search, act, sort */}
      <div className="flex flex-col gap-3 md:flex-row">
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
          />
          <input
            ref={inputRef}
            type="search"
            value={filters.query}
            onChange={(e) => set({ query: e.target.value })}
            placeholder="Search by name, act or city"
            aria-label="Search entertainers"
            className="w-full rounded-full border border-white/15 bg-white/5 py-2.5 pl-10 pr-10 text-sm outline-none transition placeholder:text-neutral-500 focus:border-amber-400 focus-visible:ring-2 focus-visible:ring-amber-400/40 [&::-webkit-search-cancel-button]:hidden"
          />
          {filters.query && (
            <button
              type="button"
              onClick={() => {
                set({ query: "" });
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-neutral-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex gap-3">
          <select
            value={filters.act ?? ""}
            onChange={(e) =>
              set({ act: (e.target.value || undefined) as Act | undefined })
            }
            aria-label="Filter by act"
            className={cn(selectClass, "flex-1 md:flex-none")}
          >
            <option value="">All acts</option>
            {ACTS.map((a) => (
              <option key={a} value={a}>
                {ACT_LABELS[a]}
              </option>
            ))}
          </select>
          <select
            value={filters.sort}
            onChange={(e) => set({ sort: e.target.value as SortKey })}
            aria-label="Sort dancers"
            className={cn(selectClass, "flex-1 md:flex-none")}
          >
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 2: when she's free, active now, more filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label="Available when"
          className="inline-flex overflow-x-auto rounded-full border border-white/15 bg-white/5 p-1"
        >
          {WHENS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => set({ when: w })}
              aria-pressed={filters.when === w}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition",
                filters.when === w
                  ? "bg-amber-400/20 text-amber-200"
                  : "text-neutral-300 hover:text-white",
              )}
            >
              {WHEN_LABELS[w]}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => set({ onlineOnly: !filters.onlineOnly })}
          aria-pressed={filters.onlineOnly}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition",
            filters.onlineOnly
              ? "border-amber-400 bg-amber-400/15 text-amber-200"
              : "border-white/15 text-neutral-300 hover:bg-white/10",
          )}
        >
          <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
          Active now
        </button>

        <button
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
          className="ml-auto inline-flex items-center gap-2 rounded-full border border-white/15 px-3.5 py-2 text-sm text-neutral-300 transition hover:bg-white/10"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          More filters
          {extraCount > 0 && (
            <span className="rounded-full bg-amber-400 px-1.5 text-xs font-semibold text-black">
              {extraCount}
            </span>
          )}
        </button>
      </div>

      {/* Collapsible: rating + price */}
      {moreOpen && (
        <div className="grid gap-6 rounded-2xl border border-white/10 bg-white/5 p-4 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm text-neutral-300">Minimum rating</p>
            <div className="flex flex-wrap gap-2">
              {RATING_STEPS.map((r) => (
                <FilterPill
                  key={r}
                  active={filters.minRating === r}
                  onClick={() => set({ minRating: r })}
                >
                  {r === 0 ? "Any" : `${r}+ / 10`}
                </FilterPill>
              ))}
            </div>
          </div>

          {bounds && (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between text-sm">
                <label htmlFor="max-price" className="text-neutral-300">
                  Max price per 30 min
                </label>
                <span className="font-medium text-neutral-100">
                  {filters.maxPrice === null
                    ? "Any price"
                    : own(filters.maxPrice, viewerCurrency)}
                </span>
              </div>
              <input
                id="max-price"
                type="range"
                min={bounds.lo}
                max={bounds.hi}
                step={bounds.step}
                value={sliderValue}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  set({ maxPrice: v >= bounds.hi ? null : v });
                }}
                className="h-1 w-full cursor-pointer accent-amber-400"
              />
              <div className="flex justify-between text-xs text-neutral-500">
                <span>{own(bounds.lo, viewerCurrency)}</span>
                <span>{own(bounds.hi, viewerCurrency)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {results === undefined ? (
        <p className="py-10 text-center text-neutral-400">
          {waitingForAvailability ? "Checking who’s free…" : "Loading dancers…"}
        </p>
      ) : results.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-neutral-300">
            {filters.when !== "any"
              ? `Nobody has an open slot ${WHEN_LABELS[filters.when].toLowerCase()} with those filters.`
              : filters.query.trim()
                ? `No dancers match “${filters.query.trim()}”.`
                : "No dancers match those filters."}
          </p>
          <button
            type="button"
            onClick={() => setFilters(DEFAULT_FILTERS)}
            className="mt-3 rounded-full border border-amber-400 bg-amber-400/15 px-4 py-1.5 text-sm text-amber-200"
          >
            Show all dancers
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm text-neutral-400">
            <p aria-live="polite">
              {results.length} {results.length === 1 ? "dancer" : "dancers"}
              {filtered && all ? ` of ${all.length}` : ""} · {onlineCount}{" "}
              active now
            </p>
            {filtered && (
              <button
                type="button"
                onClick={() => setFilters(DEFAULT_FILTERS)}
                className="text-amber-300 underline-offset-4 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {results.map((d) => {
              const next = available?.get(d._id);
              return (
                <div key={d._id}>
                  <DancerCard dancer={d} />
                  {next !== undefined && (
                    <p className="mt-1.5 px-1 text-xs text-emerald-300">
                      {freeLabel(next, now, tz)}
                    </p>
                  )}
                </div>
              );
            })}
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
