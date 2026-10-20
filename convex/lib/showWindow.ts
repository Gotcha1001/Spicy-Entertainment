// convex/lib/showWindow.ts
//
// When a paid show's room is open. No imports, so the browser (countdowns)
// and Convex share the same numbers.

/** Dancer and party may enter the room this long before the start. */
export const EARLY_JOIN_MS = 10 * 60_000;

/** The dancer must join within this long after the start, or it's a no-show (auto-refund). */
export const NO_SHOW_GRACE_MS = 10 * 60_000;

/** The room stays joinable this long after the booked end (dropped connections, wrap-up). */
export const LATE_GRACE_MS = 5 * 60_000;
