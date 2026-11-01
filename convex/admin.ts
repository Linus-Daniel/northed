import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { conflict, notFound } from "./lib/errors";

/**
 * One shot bootstrap for the very first administrator.
 *
 * This function is *internal*: the Convex backend refuses calls to internal
 * functions from a browser client, so the only way to trigger it is from the
 * Convex CLI or the dashboard, and both of those need deployment credentials.
 *
 * It also refuses to run once an administrator exists, so it can never be
 * used to promote an arbitrary account later on. From that point on,
 * administrators are promoted with the `users.setUserRole` mutation, which is
 * itself administrator only.
 *
 * Usage (dev deployment):
 *
 * ```
 * npx convex run convex/admin:grantFirstAdmin '{"userId":"<user id>"}'
 * ```
 *
 * The user id is the `_id` of the `users` document, visible in the
 * dashboard's Data tab or via `npx convex data users`.
 */
export const grantFirstAdmin = internalMutation({
  args: {
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existingAdmin = await ctx.db
      .query("users")
      .withIndex("role", (q) => q.eq("role", "admin"))
      .first();

    if (existingAdmin !== null) {
      conflict(
        "An administrator already exists. Promote other accounts with `users.setUserRole`.",
      );
    }

    const user = await ctx.db.get(args.userId);
    if (user === null) {
      notFound("That user does not exist.");
    }

    await ctx.db.patch(args.userId, { role: "admin" });
    return null;
  },
});
