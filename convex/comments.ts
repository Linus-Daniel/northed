import { mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { canEditComment, canEditContent, getViewer, requireViewer } from "./lib/auth";
import { toPublicUser } from "./lib/content";
import { forbidden, invalidInput, notFound } from "./lib/errors";
import { commentValidator } from "./lib/validators";

const MAX_COMMENT_LENGTH = 2000;
const MIN_COMMENT_LENGTH = 1;

/**
 * The comments on a lesson, oldest first, with the author's public details.
 */
export const listComments = query({
  args: {
    contentId: v.id("contents"),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(commentValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);

    const page = await ctx.db
      .query("comments")
      .withIndex("content", (q) => q.eq("contentId", args.contentId))
      .paginate(args.paginationOpts);

    const authors = await Promise.all(
      page.page.map((comment) => ctx.db.get(comment.userId)),
    );

    return {
      page: page.page.map((comment, index) => {
        const author = authors[index];
        return {
          id: comment._id,
          contentId: comment.contentId,
          text: comment.text,
          createdAt: comment._creationTime,
          updatedAt: comment.updatedAt ?? null,
          author:
            author !== null
              ? toPublicUser(author)
              : {
                  id: comment.userId,
                  name: "NorthEd member",
                  avatar: null,
                  role: "user" as const,
                },
          canEdit: canEditComment(viewer, comment.userId),
          canDelete: canEditComment(viewer, comment.userId),
        };
      }),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

/**
 * Post a comment.
 *
 * Anonymous visitors cannot comment. Only published lessons can be commented
 * on, except by the author of the lesson themselves.
 */
export const addComment = mutation({
  args: {
    contentId: v.id("contents"),
    text: v.string(),
  },
  returns: v.id("comments"),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);

    const text = args.text.trim();
    if (text.length < MIN_COMMENT_LENGTH) {
      throw invalidInput("A comment cannot be empty.");
    }
    if (text.length > MAX_COMMENT_LENGTH) {
      throw invalidInput(
        `A comment must be at most ${MAX_COMMENT_LENGTH} characters.`,
      );
    }

    const content = await ctx.db.get(args.contentId);
    if (content === null) {
      throw notFound("That lesson does not exist.");
    }
    if (content.status !== "published" && !canEditContent(viewer, content.authorId)) {
      throw forbidden("You can only comment on published lessons.");
    }

    const commentId = await ctx.db.insert("comments", {
      contentId: content._id,
      userId: viewer.id,
      text,
    });

    await ctx.db.patch(content._id, { commentCount: content.commentCount + 1 });

    return commentId;
  },
});

/**
 * Edit a comment.
 *
 * Only the author of the comment or an administrator may edit it.
 */
export const editComment = mutation({
  args: {
    commentId: v.id("comments"),
    text: v.string(),
  },
  returns: v.id("comments"),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);

    const comment = await ctx.db.get(args.commentId);
    if (comment === null) {
      throw notFound("That comment does not exist.");
    }
    if (!canEditComment(viewer, comment.userId)) {
      throw forbidden("You can only edit your own comments.");
    }

    const text = args.text.trim();
    if (text.length < MIN_COMMENT_LENGTH) {
      throw invalidInput("A comment cannot be empty.");
    }
    if (text.length > MAX_COMMENT_LENGTH) {
      throw invalidInput(
        `A comment must be at most ${MAX_COMMENT_LENGTH} characters.`,
      );
    }

    await ctx.db.patch(comment._id, { text, updatedAt: Date.now() });
    return comment._id;
  },
});

/**
 * Delete a comment.
 *
 * Only the author of the comment or an administrator may delete it.
 */
export const deleteComment = mutation({
  args: { commentId: v.id("comments") },
  returns: v.id("comments"),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);

    const comment = await ctx.db.get(args.commentId);
    if (comment === null) {
      throw notFound("That comment does not exist.");
    }
    if (!canEditComment(viewer, comment.userId)) {
      throw forbidden("You can only delete your own comments.");
    }

    const content = await ctx.db.get(comment.contentId);
    if (content !== null) {
      await ctx.db.patch(content._id, {
        commentCount: Math.max(0, content.commentCount - 1),
      });
    }

    await ctx.db.delete(comment._id);
    return comment._id;
  },
});

/** How many comments does this lesson have? */
export const getContentCommentCount = query({
  args: { contentId: v.id("contents") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const content = await ctx.db.get(args.contentId);
    return content?.commentCount ?? 0;
  },
});

/** The comments written by the signed-in user. */
export const listMyComments = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(commentValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);

    const page = await ctx.db
      .query("comments")
      .withIndex("user", (q) => q.eq("userId", viewer.id))
      .paginate(args.paginationOpts);

    const authors = await Promise.all(
      page.page.map((comment) => ctx.db.get(comment.userId)),
    );

    return {
      page: page.page.map((comment, index) => {
        const author = authors[index];
        return {
          id: comment._id,
          contentId: comment.contentId,
          text: comment.text,
          createdAt: comment._creationTime,
          updatedAt: comment.updatedAt ?? null,
          author:
            author !== null
              ? toPublicUser(author)
              : {
                  id: comment.userId,
                  name: "NorthEd member",
                  avatar: null,
                  role: "user" as const,
                },
          canEdit: true,
          canDelete: true,
        };
      }),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});
