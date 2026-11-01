import { mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { canEditContent, getViewer, requireViewer } from "./lib/auth";
import { buildContentSummaries } from "./lib/content";
import { forbidden, notFound } from "./lib/errors";
import { contentSummaryValidator } from "./lib/validators";

/**
 * Like a lesson.
 *
 * Anonymous visitors cannot like anything. A like is only accepted once per
 * user and lesson — the `content_user` index makes the duplicate check a
 * single indexed lookup, and the stored counter is incremented in the same
 * transaction.
 */
export const likeContent = mutation({
  args: { contentId: v.id("contents") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);

    const content = await ctx.db.get(args.contentId);
    if (content === null) {
      throw notFound("That lesson does not exist.");
    }
    if (content.status !== "published" && !canEditContent(viewer, content.authorId)) {
      throw forbidden("You can only like published lessons.");
    }

    const existing = await ctx.db
      .query("likes")
      .withIndex("content_user", (q) =>
        q.eq("contentId", content._id).eq("userId", viewer.id),
      )
      .first();

    if (existing !== null) {
      // Already liked — liking twice must not inflate the counter.
      return content.likeCount;
    }

    await ctx.db.insert("likes", {
      contentId: content._id,
      userId: viewer.id,
    });

    const likeCount = content.likeCount + 1;
    await ctx.db.patch(content._id, { likeCount });
    return likeCount;
  },
});

/**
 * Remove a like.
 *
 * Idempotent: unliking something that was never liked is a no-op.
 */
export const unlikeContent = mutation({
  args: { contentId: v.id("contents") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);

    const content = await ctx.db.get(args.contentId);
    if (content === null) {
      throw notFound("That lesson does not exist.");
    }

    const existing = await ctx.db
      .query("likes")
      .withIndex("content_user", (q) =>
        q.eq("contentId", content._id).eq("userId", viewer.id),
      )
      .first();

    if (existing === null) {
      return content.likeCount;
    }

    await ctx.db.delete(existing._id);

    const likeCount = Math.max(0, content.likeCount - 1);
    await ctx.db.patch(content._id, { likeCount });
    return likeCount;
  },
});

/** Has the current user liked this lesson? */
export const hasLikedContent = query({
  args: { contentId: v.id("contents") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (viewer === null) {
      return false;
    }
    const like = await ctx.db
      .query("likes")
      .withIndex("content_user", (q) =>
        q.eq("contentId", args.contentId).eq("userId", viewer.id),
      )
      .first();
    return like !== null;
  },
});

/** How many likes does this lesson have? */
export const getContentLikeCount = query({
  args: { contentId: v.id("contents") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const content = await ctx.db.get(args.contentId);
    return content?.likeCount ?? 0;
  },
});

/**
 * The lessons a user has liked.
 *
 * By default the signed-in user's own likes. Administrators may ask for
 * another user's likes.
 */
export const listLikedContents = query({
  args: {
    userId: v.optional(v.id("users")),
    paginationOpts: paginationOptsValidator,
  },
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

    const userId = args.userId ?? viewer.id;
    if (userId !== viewer.id && viewer.role !== "admin") {
      throw forbidden("You can only see your own liked lessons.");
    }

    const page = await ctx.db
      .query("likes")
      .withIndex("user", (q) => q.eq("userId", userId))
      .paginate(args.paginationOpts);

    const contents = (
      await Promise.all(page.page.map((like) => ctx.db.get(like.contentId)))
    ).filter((content) => content !== null);

    return {
      page: await buildContentSummaries(ctx, contents, viewer),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

/** The ids of the lessons the current user has liked (for a given page). */
export const listLikedContentIds = query({
  args: { contentIds: v.array(v.id("contents")) },
  returns: v.array(v.id("contents")),
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (viewer === null) {
      return [];
    }

    const likes = await Promise.all(
      args.contentIds.map((contentId) =>
        ctx.db
          .query("likes")
          .withIndex("content_user", (q) =>
            q.eq("contentId", contentId).eq("userId", viewer.id),
          )
          .first(),
      ),
    );

    return args.contentIds.filter((_, index) => likes[index] !== null);
  },
});
