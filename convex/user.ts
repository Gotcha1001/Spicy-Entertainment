// convex/user.ts
//
// Account basics: create-on-first-sign-in, who am I, party-vs-dancer choice,
// 18+ / house-rules confirmation, locale (country + time zone), appearance.
// No admin anywhere.
import { checkCountryCurrency, loadRates } from "./lib/locale";
import { convertMinor, limitsFor, niceMinor } from "./lib/currency";
import { MAX_RATE_CENTS, MIN_RATE_CENTS } from "./lib/hostRules";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { getCurrentUser, requireCurrentUser } from "./lib/auth";
import { isValidTimeZone } from "./lib/schedule";
import { COUNTRY_CURRENCY } from "./lib/currency";
import {
  onboardingChoiceValidator,
  type OnboardingChoice,
  type UserRole,
} from "./lib/validators";
import { normalizeAppearance } from "@/lib/appearance";

const MIN_AGE = 18;
const MAX_AGE = 120;

function normalizeCountry(country: string): string {
  const code = country.trim().toUpperCase();
  if (!COUNTRY_CURRENCY[code]) throw new Error("Invalid country");
  return code;
}

// ───────────── create / read ─────────────

export const createOrGet = mutation({
  args: {},
  handler: async (ctx): Promise<Doc<"users">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized – no identity found");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    if (existing) return existing;

    const email = typeof identity.email === "string" ? identity.email : "";
    const name =
      typeof identity.name === "string"
        ? identity.name
        : typeof identity.givenName === "string"
          ? identity.givenName
          : "Unknown User";
    const imageUrl =
      typeof identity.pictureUrl === "string"
        ? identity.pictureUrl
        : typeof identity.picture === "string"
          ? identity.picture
          : undefined;

    const userId = await ctx.db.insert("users", {
      clerkId: identity.subject,
      email,
      name,
      imageUrl,
      role: "user",
      createdAt: Date.now(),
    });
    const created = await ctx.db.get(userId);
    if (!created) throw new Error("Failed to create user");
    return created;
  },
});

export const getMe = query({
  args: {},
  handler: async (ctx): Promise<Doc<"users"> | null> => {
    return await getCurrentUser(ctx);
  },
});

// ───────────── onboarding status (drives the route guard) ─────────────

export type OnboardingStatus = {
  role: UserRole;
  choice: OnboardingChoice | null;
  country: string | null;
  timezone: string | null;
  ageConfirmed: boolean;
  rulesAccepted: boolean;
  /** Dancers only: has she finished her profile + bank details? */
  hostOnboarded: boolean;
};

export const getOnboardingStatus = query({
  args: {},
  handler: async (ctx): Promise<OnboardingStatus | null> => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const host =
      user.role === "host"
        ? await ctx.db
            .query("hosts")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .unique()
        : null;

    return {
      role: user.role,
      choice: user.onboardingChoice ?? null,
      country: user.country ?? null,
      timezone: user.timezone ?? null,
      ageConfirmed: user.ageConfirmedAt !== undefined,
      rulesAccepted: user.rulesAcceptedAt !== undefined,
      hostOnboarded: host?.isOnboarded ?? false,
    };
  },
});

// ───────────── step 1: party or dancer + country + time zone ─────────────

/**
 * Chosen right after sign-up. Changing your mind is fine until a dancer
 * profile exists (role flips to "host" when she completes onboarding).
 * Country drives display currency (useMoney); timezone drives schedule.
 */
export const chooseAccountType = mutation({
  args: {
    choice: onboardingChoiceValidator,
    country: v.string(),
    timezone: v.string(),
    currency: v.string(),
  },
  handler: async (
    ctx,
    { choice, country, timezone, currency },
  ): Promise<null> => {
    const user = await requireCurrentUser(ctx);
    if (user.role !== "user") {
      throw new Error("Your account type is already set");
    }
    if (!isValidTimeZone(timezone)) throw new Error("Invalid time zone");
    const rates = await loadRates(ctx);
    const clean = checkCountryCurrency({ country, currency }, rates);
    await ctx.db.patch(user._id, {
      onboardingChoice: choice,
      timezone,
      country: clean.country,
      currency: clean.currency,
    });
    return null;
  },
});

// ───────────── step 2: 18+ and house rules ─────────────

/**
 * Checks the date of birth on the server, stores ONLY timestamps, and
 * discards the date itself. Booking and dancer onboarding both require this.
 */
export const confirmAdult = mutation({
  args: {
    dateOfBirth: v.string(), // "YYYY-MM-DD" from <input type="date">
    acceptRules: v.literal(true), // "no nudity, no porn, be respectful"
  },
  handler: async (ctx, { dateOfBirth }): Promise<null> => {
    const user = await requireCurrentUser(ctx);

    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
    if (!m) throw new Error("Enter a valid date of birth");
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);

    // Reject impossible dates like 2000-02-31
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (
      probe.getUTCFullYear() !== year ||
      probe.getUTCMonth() !== month - 1 ||
      probe.getUTCDate() !== day
    ) {
      throw new Error("Enter a valid date of birth");
    }

    const now = new Date();
    let age = now.getUTCFullYear() - year;
    const hadBirthday =
      now.getUTCMonth() + 1 > month ||
      (now.getUTCMonth() + 1 === month && now.getUTCDate() >= day);
    if (!hadBirthday) age -= 1;

    if (probe.getTime() > now.getTime() || age > MAX_AGE) {
      throw new Error("Enter a valid date of birth");
    }
    if (age < MIN_AGE)
      throw new Error("You must be 18 or older to use this site");

    const stamp = Date.now();
    await ctx.db.patch(user._id, {
      ageConfirmedAt: user.ageConfirmedAt ?? stamp,
      rulesAcceptedAt: stamp,
    });
    return null;
  },
});

// ───────────── settings: country + time zone ─────────────

/**
 * Change country + time zone (Settings → LocalePicker).
 * Country drives display currency via useMoney / currencyForCountry.
 *
 * If I'm a dancer and the ZONE changes, one-day overrides are deleted: they're
 * keyed by local day index, which means something different in the new zone.
 * Weekly slots are wall-clock times, so they follow her zone on their own.
 * Existing bookings are UTC instants so they stay valid.
 */
/**
 * Change my country, time zone and currency (Settings).
 * A dancer's host row stays in step. If her CURRENCY changes, her rate is
 * converted once at today's rate and clamped to the allowed range in the new
 * currency. If her ZONE changes, her one-day overrides are cleared (they're
 * keyed by local day index). Existing bookings are not touched.
 */
export const setLocale = mutation({
  args: { country: v.string(), timezone: v.string(), currency: v.string() },
  handler: async (
    ctx,
    { country, timezone, currency },
  ): Promise<{ clearedOverrides: number; rateConverted: boolean }> => {
    const user = await requireCurrentUser(ctx);
    if (!isValidTimeZone(timezone)) throw new Error("Invalid time zone");
    const rates = await loadRates(ctx);
    const clean = checkCountryCurrency({ country, currency }, rates);

    await ctx.db.patch(user._id, {
      country: clean.country,
      timezone,
      currency: clean.currency,
    });

    let clearedOverrides = 0;
    let rateConverted = false;
    const host = await ctx.db
      .query("hosts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    if (host) {
      const patch: {
        timezone: string;
        currency: string;
        ratePerHalfHourCents?: number;
      } = { timezone, currency: clean.currency };

      const oldCurrency = host.currency ?? "ZAR";
      if (oldCurrency !== clean.currency) {
        const limits = limitsFor(
          MIN_RATE_CENTS,
          MAX_RATE_CENTS,
          clean.currency,
          rates,
        );
        const converted = niceMinor(
          convertMinor(
            host.ratePerHalfHourCents,
            oldCurrency,
            clean.currency,
            rates,
          ),
          clean.currency,
        );
        patch.ratePerHalfHourCents = Math.min(
          limits.max,
          Math.max(limits.min, converted),
        );
        rateConverted = true;
      }

      const zoneChanged = host.timezone !== timezone;
      await ctx.db.patch(host._id, patch);
      if (zoneChanged) {
        const overrides = await ctx.db
          .query("hostDayOverrides")
          .withIndex("by_host", (q) => q.eq("hostId", host._id))
          .collect();
        for (const o of overrides) await ctx.db.delete(o._id);
        clearedOverrides = overrides.length;
      }
    }
    return { clearedOverrides, rateConverted };
  },
});

/**
 * Time zone only (legacy / callers that don't touch country).
 * Prefer setLocale from Settings so country and zone stay in sync.
 */
export const setTimezone = mutation({
  args: { timezone: v.string() },
  handler: async (
    ctx,
    { timezone },
  ): Promise<{ timezone: string; clearedOverrides: number }> => {
    const user = await requireCurrentUser(ctx);
    if (!isValidTimeZone(timezone)) throw new Error("Invalid time zone");

    await ctx.db.patch(user._id, { timezone });

    let clearedOverrides = 0;
    const host = await ctx.db
      .query("hosts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    if (host) {
      const zoneChanged = host.timezone !== timezone;
      await ctx.db.patch(host._id, { timezone });

      if (zoneChanged) {
        const overrides = await ctx.db
          .query("hostDayOverrides")
          .withIndex("by_host", (q) => q.eq("hostId", host._id))
          .collect();
        for (const o of overrides) await ctx.db.delete(o._id);
        clearedOverrides = overrides.length;
      }
    }

    return { timezone, clearedOverrides };
  },
});

export const setAppearance = mutation({
  args: {
    appearance: v.object({
      accent: v.string(),
      rainMode: v.string(),
      rainDensity: v.number(),
      rainSpeed: v.number(),
      rainOpacity: v.number(),
      glow: v.boolean(),
    }),
  },
  handler: async (ctx, { appearance }): Promise<null> => {
    const user = await requireCurrentUser(ctx);
    await ctx.db.patch(user._id, {
      appearance: normalizeAppearance(appearance),
    });
    return null;
  },
});
