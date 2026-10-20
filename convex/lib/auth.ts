// convex/lib/auth.ts
//
// Server-side guards. Call these at the top of every mutation/query that
// needs a signed-in user; hiding a button in the UI is never enough.

import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

export async function getCurrentUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .first();
}

export async function requireCurrentUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!user) throw new Error("Unauthorized – no signed-in user found");
  return user;
}

/** Signed in AND confirmed 18+ AND accepted the house rules. */
export async function requireAdult(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users">> {
  const user = await requireCurrentUser(ctx);
  if (!user.ageConfirmedAt)
    throw new Error("Please confirm you are 18 or older");
  if (!user.rulesAcceptedAt) throw new Error("Please accept the house rules");
  return user;
}

/** Signed-in dancer: returns both her user row and her host row. */
export async function requireHost(
  ctx: QueryCtx | MutationCtx,
): Promise<{ user: Doc<"users">; host: Doc<"hosts"> }> {
  const user = await requireCurrentUser(ctx);
  if (user.role !== "host") throw new Error("Forbidden – dancers only");
  const host = await ctx.db
    .query("hosts")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .unique();
  if (!host) throw new Error("Dancer profile not found");
  return { user, host };
}
