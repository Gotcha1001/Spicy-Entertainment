// lib/dancerSearch.ts
//
// Pure search / filter / sort for the /dancers dashboard. No React, no Convex
// calls, so it is easy to unit-test. Works on the DancerCard rows that
// hosts.listActive already returns.

import type { DancerCard } from "@/convex/hosts";
import { ACT_LABELS, type Act } from "@/convex/lib/validators";
import {
  DAY_MS,
  HOUR_MS,
  dayEndMs,
  dayIndexOf,
  dayStartMs,
  hourOf,
  wallToUtc,
} from "@/convex/lib/schedule";

export type SortKey =
  | "recommended" // online first, then rating, then likes
  | "rating"
  | "popular"
  | "price_asc"
  | "price_desc";

/** "Free when?" presets. Windows are worked out in the VIEWER's time zone. */
export type WhenKey = "any" | "soon" | "tonight" | "tomorrow";

export interface DancerFilters {
  query: string;
  act?: Act;
  onlineOnly: boolean;
  /** Minimum average rating out of 10. 0 = any. */
  minRating: number;
  /** Max price per 30 min, in the VIEWER's currency (minor units). null = no limit. */
  maxPrice: number | null;
  when: WhenKey;
  sort: SortKey;
}

export const DEFAULT_FILTERS: DancerFilters = {
  query: "",
  act: undefined,
  onlineOnly: false,
  minRating: 0,
  maxPrice: null,
  when: "any",
  sort: "recommended",
};

export const SORT_LABELS: Record<SortKey, string> = {
  recommended: "Recommended",
  rating: "Top rated",
  popular: "Most liked",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
};

export const WHEN_LABELS: Record<WhenKey, string> = {
  any: "Any time",
  soon: "Next 4 hours",
  tonight: "Tonight",
  tomorrow: "Tomorrow",
};

// ───────────── "free when" windows ─────────────

/** Evening starts at 17:00 and "tonight" runs until 05:00 the next morning. */
const EVENING_START_H = 17;
const NIGHT_END_H = 5;

/**
 * The window of real time a preset means for this viewer. The server then asks
 * "who has a bookable start inside it?", so a dancer in another time zone who
 * is free during YOUR evening is found correctly.
 */
export function windowFor(
  when: Exclude<WhenKey, "any">,
  now: number,
  viewerTz: string,
): { fromMs: number; toMs: number } {
  const day = dayIndexOf(now, viewerTz);

  if (when === "soon") return { fromMs: now, toMs: now + 4 * HOUR_MS };

  if (when === "tomorrow") {
    return {
      fromMs: dayStartMs(day + 1, viewerTz),
      toMs: dayEndMs(day + 1, viewerTz),
    };
  }

  // tonight
  if (hourOf(now, viewerTz) < NIGHT_END_H) {
    // It's the small hours: "tonight" is what's left of last night.
    return {
      fromMs: now,
      toMs: wallToUtc(day * DAY_MS + NIGHT_END_H * HOUR_MS, viewerTz),
    };
  }
  const evening = wallToUtc(day * DAY_MS + EVENING_START_H * HOUR_MS, viewerTz);
  return {
    fromMs: Math.max(now, evening),
    toMs: wallToUtc((day + 1) * DAY_MS + NIGHT_END_H * HOUR_MS, viewerTz),
  };
}

// ───────────── text search ─────────────

/** Lowercase + strip accents so "Zoë" matches "zoe". */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Every word the user typed must appear somewhere in the dancer's name,
 * tagline, city or act labels. Returns 0 for "no match", higher = better.
 */
function relevance(d: DancerCard, tokens: string[]): number {
  if (tokens.length === 0) return 1;

  const name = normalize(d.displayName);
  const city = normalize(d.city ?? "");
  const tagline = normalize(d.tagline);
  const acts = normalize(d.acts.map((a) => ACT_LABELS[a]).join(" "));

  let score = 0;
  for (const t of tokens) {
    let best = 0;
    if (name.startsWith(t)) best = 5;
    else if (name.includes(t)) best = 4;
    else if (acts.includes(t)) best = 3;
    else if (city.includes(t)) best = 2;
    else if (tagline.includes(t)) best = 1;
    if (best === 0) return 0; // a word matched nothing -> not a result
    score += best;
  }
  return score;
}

/** Online first, then rating, then likes. Also the tiebreaker for every sort. */
function recommended(a: DancerCard, b: DancerCard): number {
  if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
  const ra = a.rating ?? -1;
  const rb = b.rating ?? -1;
  if (ra !== rb) return rb - ra;
  return b.likeCount - a.likeCount;
}

export interface SearchOptions {
  /**
   * Price of one 30-min block in the VIEWER's currency (minor units). Pass
   * useMoney().toViewer so filtering and sorting compare like with like.
   * Without it, raw rates are compared (fine while everyone prices in ZAR).
   */
  price?: (d: DancerCard) => number;
  /**
   * Dancers free in the chosen window: hostId -> first bookable start.
   * null/undefined = don't filter by availability.
   */
  available?: ReadonlyMap<string, number> | null;
}

export function searchDancers(
  dancers: DancerCard[],
  f: DancerFilters,
  opts: SearchOptions = {},
): DancerCard[] {
  const tokens = normalize(f.query).split(/\s+/).filter(Boolean);
  const price = opts.price ?? ((d: DancerCard) => d.ratePerHalfHourCents);
  const available = opts.available ?? null;

  const scored = dancers
    .filter((d) => (f.act ? d.acts.includes(f.act) : true))
    .filter((d) => (f.onlineOnly ? d.isOnline : true))
    .filter((d) => (f.minRating > 0 ? (d.rating ?? 0) >= f.minRating : true))
    .filter((d) => (f.maxPrice !== null ? price(d) <= f.maxPrice : true))
    .filter((d) => (available ? available.has(d._id) : true))
    .map((d) => ({ d, score: relevance(d, tokens) }))
    .filter((x) => x.score > 0);

  scored.sort((a, b) => {
    // While searching, best text match wins unless a sort was chosen explicitly.
    if (tokens.length > 0 && f.sort === "recommended" && a.score !== b.score) {
      return b.score - a.score;
    }
    switch (f.sort) {
      case "rating": {
        const diff = (b.d.rating ?? -1) - (a.d.rating ?? -1);
        if (diff !== 0) return diff;
        break;
      }
      case "popular": {
        const diff = b.d.likeCount - a.d.likeCount;
        if (diff !== 0) return diff;
        break;
      }
      case "price_asc": {
        const diff = price(a.d) - price(b.d);
        if (diff !== 0) return diff;
        break;
      }
      case "price_desc": {
        const diff = price(b.d) - price(a.d);
        if (diff !== 0) return diff;
        break;
      }
    }
    return recommended(a.d, b.d);
  });

  return scored.map((x) => x.d);
}

export function hasActiveFilters(f: DancerFilters): boolean {
  return (
    f.query.trim() !== "" ||
    f.act !== undefined ||
    f.onlineOnly ||
    f.minRating > 0 ||
    f.maxPrice !== null ||
    f.when !== "any" ||
    f.sort !== "recommended"
  );
}
