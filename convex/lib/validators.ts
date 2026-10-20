// convex/lib/validators.ts
//
// Shared validators + derived TS types. Import these in schema.ts AND in every
// function's `args`, so the allowed values live in exactly one place.

import { v, type Infer } from "convex/values";

/** What a dancer can offer. Shown as chips on her profile + filterable. */
export const actValidator = v.union(
  v.literal("fire_blowing"),
  v.literal("fire_dancing"),
  v.literal("hula_hoop"),
  v.literal("funky_dance"),
  v.literal("fancy_dress"),
  v.literal("led_show"),
  v.literal("stilt_walking"),
  v.literal("acrobatics"),
  v.literal("belly_dance"),
  v.literal("party_host_mc"),
);
export type Act = Infer<typeof actValidator>;

/** Display labels for the UI (keeps labels out of the database). */
export const ACT_LABELS: Record<Act, string> = {
  fire_blowing: "Fire blowing",
  fire_dancing: "Fire dancing",
  hula_hoop: "Hula hoop",
  funky_dance: "Funky dance",
  fancy_dress: "Fancy dress show",
  led_show: "LED show",
  stilt_walking: "Stilt walking",
  acrobatics: "Acrobatics",
  belly_dance: "Belly dance",
  party_host_mc: "Party host / MC",
};

export const eventTypeValidator = v.union(
  v.literal("party"),
  v.literal("braai"),
  v.literal("birthday"),
  v.literal("corporate"),
  v.literal("other"),
);
export type EventType = Infer<typeof eventTypeValidator>;

export const userRoleValidator = v.union(v.literal("user"), v.literal("host"));
export type UserRole = Infer<typeof userRoleValidator>;

/** Chosen right after sign-up on /choose-role. */
export const onboardingChoiceValidator = v.union(
  v.literal("party"),
  v.literal("dancer"),
);
export type OnboardingChoice = Infer<typeof onboardingChoiceValidator>;

export const hostStatusValidator = v.union(
  v.literal("active"), // listed, can be booked
  v.literal("paused"), // she hid herself
  v.literal("suspended"), // auto-suspended after repeated reports
);
export type HostStatus = Infer<typeof hostStatusValidator>;

export const bookingStatusValidator = v.union(
  v.literal("pending_payment"),
  v.literal("paid"),
  v.literal("completed"),
  v.literal("cancelled"),
  v.literal("expired"), // never paid in time
  v.literal("no_show"), // dancer never joined -> triggers refund
  v.literal("refunded"),
);
export type BookingStatus = Infer<typeof bookingStatusValidator>;

export const paymentStatusValidator = v.union(
  v.literal("initiated"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("refunded"),
);
export type PaymentStatus = Infer<typeof paymentStatusValidator>;

export const callStatusValidator = v.union(
  v.literal("accepted"), // paid + ready, joinable inside its time window
  v.literal("ended"),
);
export type CallStatus = Infer<typeof callStatusValidator>;

/** Half-hour slot constants. A day has 48 slots: 0 = 00:00, 1 = 00:30 … 47 = 23:30. */
export const SLOT_MINUTES = 30;
export const SLOTS_PER_DAY = 48;
