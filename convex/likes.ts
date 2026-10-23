import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser, requireAdult } from "./lib/auth";

/** Like or unlike a dancer. Returns the new state. */
export const toggle = mutation({
  args: { hostId: v.id("hosts") },
  handler: async (ctx, { hostId }) => {
    const user = await requireAdult(ctx);
    const host = await ctx.db.get(hostId);
    if (!host) throw new Error("Dancer not found");

    const existing = await ctx.db
      .query("likes")
      .withIndex("by_host_user", (q) =>
        q.eq("hostId", hostId).eq("userId", user._id),
      )
      .unique();

    const current = host.likeCount ?? 0;
    if (existing) {
      await ctx.db.delete(existing._id);
      await ctx.db.patch(hostId, { likeCount: Math.max(0, current - 1) });
      return { liked: false, likeCount: Math.max(0, current - 1) };
    }
    await ctx.db.insert("likes", {
      hostId,
      userId: user._id,
      createdAt: Date.now(),
    });
    await ctx.db.patch(hostId, { likeCount: current + 1 });
    return { liked: true, likeCount: current + 1 };
  },
});

/** Dancer ids the signed-in viewer has liked (empty when signed out). */
export const myLikedHostIds = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const rows = await ctx.db
      .query("likes")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    return rows.map((r) => r.hostId);
  },
});
