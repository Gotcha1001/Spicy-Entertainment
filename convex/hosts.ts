import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { getCurrentUser, requireAdult, requireHost } from "./lib/auth";
import { isValidTimeZone } from "./lib/schedule";
import {
  MAX_ACTS,
  MAX_RATE_CENTS,
  MIN_RATE_CENTS,
  PRESENCE_STALE_MS,
  PRESENCE_THROTTLE_MS,
  isBookable,
} from "./lib/hostRules";
import { actValidator, type Act, type HostStatus } from "./lib/validators";

// ───────────── Types returned to the browser (never the subaccount code) ─────────────

export type DancerCard = {
  _id: Id<"hosts">;
  displayName: string;
  tagline: string;
  acts: Act[];
  imageUrl: string | null;
  ratePerHalfHourCents: number;
  city: string | null;
  timezone: string;
  isOnline: boolean;
  /** Average out of 10, or null until she has been rated. */
  rating: number | null;
  ratingCount: number;
};

export type DancerPublic = DancerCard & { bio: string };

export type MyHost = DancerPublic & {
  status: HostStatus;
  isOnboarded: boolean;
  payoutReady: boolean;
  bankName: string | null;
  bankLast4: string | null;
  hasImage: boolean;
  wantsOnline: boolean;
};

function averageRating(h: Doc<"hosts">): number | null {
  if (h.ratingCount === 0) return null;
  return Math.round((h.ratingSum / h.ratingCount) * 10) / 10;
}

function toCard(h: Doc<"hosts">): DancerCard {
  return {
    _id: h._id,
    displayName: h.displayName,
    tagline: h.tagline,
    acts: h.acts,
    imageUrl: h.imageUrl ?? null,
    ratePerHalfHourCents: h.ratePerHalfHourCents,
    city: h.city ?? null,
    timezone: h.timezone,
    isOnline: h.isOnline,
    rating: averageRating(h),
    ratingCount: h.ratingCount,
  };
}

/** Re-derives isOnboarded (image + payout) after any change that affects it. */
async function syncOnboarded(
  ctx: MutationCtx,
  hostId: Id<"hosts">,
): Promise<void> {
  const host = await ctx.db.get(hostId);
  if (!host) return;
  const ready =
    host.imageUrl !== undefined && host.payoutAccountRef !== undefined;
  if (ready !== host.isOnboarded) {
    await ctx.db.patch(hostId, {
      isOnboarded: ready,
      // Not ready any more => make sure she can't show as online.
      ...(ready ? {} : { isOnline: false }),
    });
  }
}

// ───────────── Own profile ─────────────

export const getMyHost = query({
  args: {},
  handler: async (ctx): Promise<MyHost | null> => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const host = await ctx.db
      .query("hosts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (!host) return null;
    return {
      ...toCard(host),
      bio: host.bio,
      status: host.status,
      isOnboarded: host.isOnboarded,
      payoutReady: host.payoutAccountRef !== undefined,
      bankName: host.bankName ?? null,
      bankLast4: host.bankLast4 ?? null,
      hasImage: host.imageUrl !== undefined,
      wantsOnline: host.wantsOnline === true,
    };
  },
});

/** Onboarding step: create or update the public profile. */
export const saveProfile = mutation({
  args: {
    displayName: v.string(),
    tagline: v.string(),
    bio: v.string(),
    acts: v.array(actValidator),
    ratePerHalfHourCents: v.number(),
    city: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"hosts">> => {
    const user = await requireAdult(ctx); // 18+ and house rules accepted

    if (user.role === "user" && user.onboardingChoice !== "dancer") {
      throw new Error("Choose “I’m a dancer” first");
    }
    const timezone = user.timezone;
    if (!timezone || !isValidTimeZone(timezone)) {
      throw new Error("Choose your time zone first");
    }

    const displayName = args.displayName.trim();
    const tagline = args.tagline.trim();
    const bio = args.bio.trim();
    const city = args.city?.trim() || undefined;
    const acts: Act[] = [...new Set(args.acts)];

    if (displayName.length < 2 || displayName.length > 40)
      throw new Error("Display name must be 2 to 40 characters");
    if (tagline.length < 3 || tagline.length > 80)
      throw new Error("Tagline must be 3 to 80 characters");
    if (bio.length > 500)
      throw new Error("Bio must be 500 characters or fewer");
    if (city !== undefined && city.length > 60)
      throw new Error("City must be 60 characters or fewer");
    if (acts.length < 1 || acts.length > MAX_ACTS)
      throw new Error(`Pick 1 to ${MAX_ACTS} things you’re good at`);
    if (
      !Number.isInteger(args.ratePerHalfHourCents) ||
      args.ratePerHalfHourCents < MIN_RATE_CENTS ||
      args.ratePerHalfHourCents > MAX_RATE_CENTS
    ) {
      throw new Error(
        `Price per 30 minutes must be between R${MIN_RATE_CENTS / 100} and R${MAX_RATE_CENTS / 100}`,
      );
    }

    const existing = await ctx.db
      .query("hosts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        displayName,
        tagline,
        bio,
        acts,
        city,
        ratePerHalfHourCents: args.ratePerHalfHourCents,
        timezone,
      });
      return existing._id;
    }

    const hostId = await ctx.db.insert("hosts", {
      userId: user._id,
      displayName,
      tagline,
      bio,
      acts,
      city,
      ratePerHalfHourCents: args.ratePerHalfHourCents,
      timezone,
      status: "active",
      isOnboarded: false, // flips true once image + payout exist
      payoutProvider: "paystack",
      isOnline: false,
      lastSeenAt: Date.now(),
      ratingSum: 0,
      ratingCount: 0,
      createdAt: Date.now(),
    });
    await ctx.db.patch(user._id, { role: "host" });
    return hostId;
  },
});

/**
 * Saves the Cloudinary image she just uploaded (uploads.uploadProfilePhoto).
 * Returns the PREVIOUS publicId so the client can delete it from Cloudinary
 * with uploads.deleteProfilePhoto.
 */
export const setImage = mutation({
  args: { imageUrl: v.string(), imagePublicId: v.string() },
  handler: async (
    ctx,
    { imageUrl, imagePublicId },
  ): Promise<{ previousPublicId: string | null }> => {
    const { user, host } = await requireHost(ctx);

    if (!imageUrl.startsWith("https://res.cloudinary.com/")) {
      throw new Error("Invalid image URL");
    }
    // The upload action records ownership; make sure this image is hers.
    const asset = await ctx.db
      .query("uploadedAssets")
      .withIndex("by_public_id", (q) => q.eq("publicId", imagePublicId))
      .first();
    if (!asset || asset.userId !== user._id) {
      throw new Error("You can only use images you uploaded yourself");
    }

    await ctx.db.patch(host._id, { imageUrl, imagePublicId });
    await ctx.db.patch(user._id, { imageUrl });
    await syncOnboarded(ctx, host._id);
    return { previousPublicId: host.imagePublicId ?? null };
  },
});

/** Hide / show herself without losing her profile. Suspended dancers can't undo it. */
export const setPaused = mutation({
  args: { paused: v.boolean() },
  handler: async (ctx, { paused }): Promise<null> => {
    const { host } = await requireHost(ctx);
    if (host.status === "suspended") {
      throw new Error("Your profile is suspended");
    }
    await ctx.db.patch(host._id, {
      status: paused ? "paused" : "active",
      ...(paused ? { isOnline: false } : {}),
    });
    return null;
  },
});

// ───────────── Presence ("active now") ─────────────

/**
 * Called every ~60s by the heartbeat hook, but ONLY while the dancer has her
 * "I'm available" toggle on. Marks her online and keeps lastSeenAt fresh.
 */
export const touchPresence = mutation({
  args: {},
  handler: async (ctx): Promise<null> => {
    const { host } = await requireHost(ctx);
    if (!isBookable(host)) return null; // paused / suspended / incomplete: never "online"

    const now = Date.now();
    if (host.isOnline && now - host.lastSeenAt < PRESENCE_THROTTLE_MS)
      return null;
    await ctx.db.patch(host._id, { isOnline: true, lastSeenAt: now });
    return null;
  },
});

/** She switched "I'm available" off (or closed the tab cleanly). */
export const setOffline = mutation({
  args: {},
  handler: async (ctx): Promise<null> => {
    const { host } = await requireHost(ctx);
    if (host.isOnline) await ctx.db.patch(host._id, { isOnline: false });
    return null;
  },
});

/** Cron: dancers whose heartbeat stopped (closed laptop, lost signal) go offline. */
export const markStaleOffline = internalMutation({
  args: {},
  handler: async (ctx): Promise<number> => {
    const cutoff = Date.now() - PRESENCE_STALE_MS;
    const online = await ctx.db
      .query("hosts")
      .withIndex("by_status_online", (q) =>
        q.eq("status", "active").eq("isOnline", true),
      )
      .collect();
    let flipped = 0;
    for (const h of online) {
      if (h.lastSeenAt < cutoff) {
        await ctx.db.patch(h._id, { isOnline: false });
        flipped += 1;
      }
    }
    return flipped;
  },
});

// ───────────── Public: dashboard + profile ─────────────

/**
 * The dashboard: every bookable dancer, ACTIVE-NOW first, optionally filtered
 * by one act (e.g. only fire performers).
 */
export const listActive = query({
  args: { act: v.optional(actValidator) },
  handler: async (ctx, { act }): Promise<DancerCard[]> => {
    const online = await ctx.db
      .query("hosts")
      .withIndex("by_status_online", (q) =>
        q.eq("status", "active").eq("isOnline", true),
      )
      .take(100);
    const offline = await ctx.db
      .query("hosts")
      .withIndex("by_status_online", (q) =>
        q.eq("status", "active").eq("isOnline", false),
      )
      .take(100);

    return [...online, ...offline]
      .filter(
        (h) => isBookable(h) && (act === undefined || h.acts.includes(act)),
      )
      .map(toCard);
  },
});

export const getPublic = query({
  // string, not v.id: a malformed ID in the URL should show "not found", not crash the page
  args: { hostId: v.string() },
  handler: async (ctx, { hostId: rawId }): Promise<DancerPublic | null> => {
    const hostId = ctx.db.normalizeId("hosts", rawId);
    if (!hostId) return null;
    const h = await ctx.db.get(hostId);
    if (!h || !isBookable(h)) return null;
    return { ...toCard(h), bio: h.bio };
  },
});

// ───────────── Internal: used by hostPayout.ts ─────────────

export const getHostForPayout = internalQuery({
  args: { clerkId: v.string() },
  handler: async (
    ctx,
    { clerkId },
  ): Promise<{
    hostId: Id<"hosts">;
    hasPayout: boolean;
    adult: boolean;
  } | null> => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (!user) return null;
    const host = await ctx.db
      .query("hosts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (!host) return null;
    return {
      hostId: host._id,
      hasPayout: host.payoutAccountRef !== undefined,
      adult:
        user.ageConfirmedAt !== undefined && user.rulesAcceptedAt !== undefined,
    };
  },
});

export const savePayout = internalMutation({
  args: {
    hostId: v.id("hosts"),
    payoutAccountRef: v.string(),
    bankName: v.optional(v.string()),
    bankLast4: v.string(),
  },
  handler: async (
    ctx,
    { hostId, payoutAccountRef, bankName, bankLast4 },
  ): Promise<void> => {
    await ctx.db.patch(hostId, {
      payoutProvider: "paystack",
      payoutAccountRef,
      bankName,
      bankLast4,
    });
    await syncOnboarded(ctx, hostId);
  },
});

export const setAvailable = mutation({
  args: { available: v.boolean() },
  handler: async (ctx, { available }) => {
    const { host } = await requireHost(ctx);
    if (available && !isBookable(host))
      throw new Error("Finish onboarding first");
    await ctx.db.patch(host._id, {
      wantsOnline: available,
      ...(available
        ? { isOnline: true, lastSeenAt: Date.now() }
        : { isOnline: false }),
    });
    return null;
  },
});
