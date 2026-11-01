import { mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { canEditContent, getViewer, requireViewer } from "./lib/auth";
import { buildContentSummaries } from "./lib/content";
import { forbidden, notFound } from "./lib/errors";
import { contentSummaryValidator } from "./lib/validators";

/**
 * Save a lesson for later.
 *
 * Saving the same lesson twice is a no-op, so the saved list never contains
 * duplicates.
 */
export const saveContent = mutation({
  args: { contentId: v.id("contents") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);

    const content = await ctx.db.get(args.contentId);
    if (content === null) {
      throw notFound("That lesson does not exist.");
    }
    if (content.status !== "published" && !canEditContent(viewer, content.authorId)) {
      throw forbidden("You can only save published lessons.");
    }

    const existing = await ctx.db
      .query("savedContents")
      .withIndex("content_user", (q) =>
        q.eq("contentId", content._id).eq("userId", viewer.id),
      )
      .first();

    if (existing !== null) {
      return true;
    }

    await ctx.db.insert("savedContents", {
      contentId: content._id,
      userId: viewer.id,
    });
    return true;
  },
});

/** Remove a lesson from the saved list. Idempotent. */
export const unsaveContent = mutation({
  args: { contentId: v.id("contents") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);

    const existing = await ctx.db
      .query("savedContents")
      .withIndex("content_user", (q) =>
        q.eq("contentId", args.contentId).eq("userId", viewer.id),
      )
      .first();

    if (existing !== null) {
      await ctx.db.delete(existing._id);
    }
    return false;
  },
});

/** Has the current user saved this lesson? */
export const isContentSaved = query({
  args: { contentId: v.id("contents") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (viewer === null) {
      return false;
    }
    const saved = await ctx.db
      .query("savedContents")
      .withIndex("content_user", (q) =>
        q.eq("contentId", args.contentId).eq("userId", viewer.id),
      )
      .first();
    return saved !== null;
  },
});

/** The signed-in user's saved lessons, newest save first. */
export const listSavedContents = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(contentSummaryValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (viewer === null) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const page = await ctx.db
      .query("savedContents")
      .withIndex("user", (q) => q.eq("userId", viewer.id))
      .paginate(args.paginationOpts);

    const contents = (
      await Promise.all(page.page.map((saved) => ctx.db.get(saved.contentId)))
    ).filter((content) => content !== null);

    return {
      page: await buildContentSummaries(ctx, contents, viewer),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});
