// convex/lib/hostRules.ts
//
// Business rules for dancers, shared by hosts.ts, bookings.ts and the UI.

import type { Doc } from "../_generated/dataModel";

/** Price for ONE 30-minute block, in ZAR cents. Adjust to taste. */
export const MIN_RATE_CENTS = 10_000; // R100 per 30 min
export const MAX_RATE_CENTS = 200_000; // R2 000 per 30 min

export const MAX_ACTS = 6;

/** The dancer's client pings every 60s while she is "available". */
export const PRESENCE_STALE_MS = 210_000;
export const PRESENCE_THROTTLE_MS = 30_000; // don't write more often than this

/**
 * A dancer can be listed and booked only when she is active, her profile is
 * complete (image + payout account), and nobody suspended her.
 */
export function isBookable(host: Doc<"hosts">): boolean {
  return (
    host.status === "active" &&
    host.isOnboarded &&
    host.payoutAccountRef !== undefined
  );
}
