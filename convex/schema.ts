import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  actValidator,
  bookingStatusValidator,
  callStatusValidator,
  eventTypeValidator,
  hostStatusValidator,
  onboardingChoiceValidator,
  paymentStatusValidator,
  userRoleValidator,
} from "./lib/validators";

export default defineSchema({
  // ───────────── USERS (extends the starter's users table) ─────────────
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    imageUrl: v.optional(v.string()),
    role: userRoleValidator, // "user" = party/guest, "host" = dancer
    createdAt: v.number(),
    onboardingChoice: v.optional(onboardingChoiceValidator),
    /** Set by the 18+ confirmation during onboarding. Required to book or perform. */
    ageConfirmedAt: v.optional(v.number()),
    /** Set when they accept the "no nudity / no porn" house rules. */
    rulesAcceptedAt: v.optional(v.number()),
    timezone: v.optional(v.string()), // IANA, e.g. "Africa/Johannesburg"
    appearance: v.optional(
      v.object({
        accent: v.string(),
        rainMode: v.string(),
        rainDensity: v.number(),
        rainSpeed: v.number(),
        rainOpacity: v.number(),
        glow: v.boolean(),
      }),
    ),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_role", ["role"]),

  // ───────────── DANCERS ─────────────
  hosts: defineTable({
    userId: v.id("users"),
    displayName: v.string(),
    tagline: v.string(), // one line, e.g. "Fire blower & hoop queen"
    bio: v.string(),
    acts: v.array(actValidator), // "what I'm good at" list
    /** Cloudinary profile image. */
    imageUrl: v.optional(v.string()),
    imagePublicId: v.optional(v.string()),
    /** Price for ONE 30-minute block, in ZAR cents. */
    ratePerHalfHourCents: v.number(),
    city: v.optional(v.string()), // service area label shown on the card
    timezone: v.string(),
    status: hostStatusValidator,
    isOnboarded: v.boolean(),
    wantsOnline: v.optional(v.boolean()),
    // Payout (Paystack subaccount). She enters her own bank details, so we
    // never pay her manually.
    payoutProvider: v.literal("paystack"),
    payoutAccountRef: v.optional(v.string()), // Paystack subaccount code
    bankName: v.optional(v.string()),
    bankLast4: v.optional(v.string()),
    // Presence ("active now" on the dashboard)
    isOnline: v.boolean(),
    lastSeenAt: v.number(),
    // Ratings out of 10 (denormalised so the dashboard needs no joins)
    ratingSum: v.number(),
    ratingCount: v.number(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_status_online", ["status", "isOnline"]),

  // ── Availability, in 30-minute slot indexes (0–47) in the DANCER's timezone ──
  hostWeeklyHours: defineTable({
    hostId: v.id("hosts"),
    weekday: v.number(), // 0 = Mon … 6 = Sun
    slots: v.array(v.number()), // unique, sorted, each 0–47
  })
    .index("by_host", ["hostId"])
    .index("by_host_weekday", ["hostId", "weekday"]),

  hostDayOverrides: defineTable({
    hostId: v.id("hosts"),
    dayIndex: v.number(), // days since 1970-01-01 in the dancer's timezone
    slots: v.array(v.number()), // empty = fully off that day
  })
    .index("by_host", ["hostId"])
    .index("by_host_day", ["hostId", "dayIndex"]),

  // ───────────── PARTIES (optional grouping: up to 3 dancers per event) ─────────────
  parties: defineTable({
    ownerId: v.id("users"),
    name: v.string(), // "Thandi's 30th"
    eventType: eventTypeValidator,
    note: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  // ───────────── BOOKINGS ─────────────
  bookings: defineTable({
    hostId: v.id("hosts"),
    guestId: v.id("users"),
    partyId: v.optional(v.id("parties")),
    eventType: eventTypeValidator,
    eventNote: v.optional(v.string()),
    startsAt: v.number(),
    endsAt: v.number(),
    minutes: v.number(), // always a multiple of 30
    amountCents: v.number(),
    platformFeeCents: v.number(),
    hostShareCents: v.number(),
    status: bookingStatusValidator,
    paymentId: v.optional(v.id("payments")),
    roomName: v.optional(v.string()),
    /** Stamped by the livekit-token route when the dancer first joins. Drives no-show refunds. */
    hostJoinedAt: v.optional(v.number()),
    hostTimezone: v.string(), // snapshots for receipts / disputes
    guestTimezone: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_host", ["hostId"])
    .index("by_host_time", ["hostId", "startsAt"])
    .index("by_guest", ["guestId"])
    .index("by_party", ["partyId"])
    .index("by_status_start", ["status", "startsAt"]), // cron: expire unpaid, detect no-shows

  // ───────────── PAYMENTS (Paystack) ─────────────
  payments: defineTable({
    bookingId: v.id("bookings"),
    payerId: v.id("users"),
    hostId: v.id("hosts"),
    amountCents: v.number(),
    platformFeeCents: v.number(),
    hostShareCents: v.number(),
    currency: v.literal("ZAR"),
    providerReference: v.string(), // Paystack reference
    status: paymentStatusValidator,
    refundReference: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_reference", ["providerReference"])
    .index("by_booking", ["bookingId"])
    .index("by_payer", ["payerId"]),

  // ───────────── LIVE SESSIONS (one-way LiveKit room per paid booking) ─────────────
  callSessions: defineTable({
    requesterId: v.id("users"), // the party (viewer)
    recipientId: v.id("users"), // the dancer's user (publisher)
    bookingId: v.id("bookings"),
    roomName: v.string(),
    status: callStatusValidator,
    scheduledFor: v.number(),
    endsAt: v.number(),
    createdAt: v.number(),
    endedAt: v.optional(v.number()),
  })
    .index("by_booking", ["bookingId"])
    .index("by_recipient", ["recipientId"])
    .index("by_requester", ["requesterId"])
    .index("by_recipient_status", ["recipientId", "status"]),

  // ───────────── RATINGS (1–10, left by the party after the show) ─────────────
  reviews: defineTable({
    bookingId: v.id("bookings"),
    hostId: v.id("hosts"),
    guestId: v.id("users"),
    score: v.number(), // 1–10, validated in the mutation
    comment: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_booking", ["bookingId"])
    .index("by_host", ["hostId"]),

  // ───────────── SAFETY (no admin: dancers block, anyone reports) ─────────────
  blocks: defineTable({
    hostId: v.id("hosts"),
    blockedUserId: v.id("users"),
    createdAt: v.number(),
  }).index("by_host_user", ["hostId", "blockedUserId"]),

  reports: defineTable({
    reporterId: v.id("users"),
    targetUserId: v.id("users"),
    bookingId: v.optional(v.id("bookings")),
    reason: v.string(),
    resolved: v.boolean(),
    createdAt: v.number(),
  }).index("by_target_resolved", ["targetUserId", "resolved"]),

  // ───────────── CLOUDINARY OWNERSHIP (used by uploads.ts / assets.ts) ─────────────
  uploadedAssets: defineTable({
    userId: v.id("users"),
    publicId: v.string(),
    createdAt: v.number(),
  })
    .index("by_public_id", ["publicId"])
    .index("by_user", ["userId"]),

  hostApplications: defineTable({
    userId: v.id("users"),
    status: v.string(), // or a validator, e.g. "pending" | "approved" | "rejected"
    // ...the fields your apply/submit mutation writes...
    idPhotoPublicId: v.optional(v.string()),
    selfiePublicId: v.optional(v.string()),
    idDocumentsUploaded: v.optional(v.boolean()),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  // ───────────── FX RATES (refreshed by cron, base USD) ─────────────
  fxRates: defineTable({
    base: v.string(), // always "USD"
    rates: v.record(v.string(), v.number()), // e.g. { ZAR: 18.2, EUR: 0.92 }
    updatedAt: v.number(),
  }),
});
