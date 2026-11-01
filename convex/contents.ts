import { mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { describeVideoUrlFailure, parseVideoSource } from "../shared/video";
import {
  canEditContent,
  getViewer,
  requireOwnedContent,
  requireTutor,
} from "./lib/auth";
import { buildContentSummaries, resolveVideo } from "./lib/content";
import { deleteUploads, requireOwnedUpload, validateUpload } from "./lib/uploads";
import { forbidden, invalidInput } from "./lib/errors";
import {
  contentDetailValidator,
  contentStatusValidator,
  contentSummaryValidator,
} from "./lib/validators";

const MAX_TITLE_LENGTH = 120;
const MIN_TITLE_LENGTH = 3;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_THUMBNAIL_LENGTH = 2048;

const paginatedContentsValidator = v.object({
  page: v.array(contentSummaryValidator),
  isDone: v.boolean(),
  continueCursor: v.string(),
});

function validateTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length < MIN_TITLE_LENGTH || trimmed.length > MAX_TITLE_LENGTH) {
    throw invalidInput(
      `The title must be between ${MIN_TITLE_LENGTH} and ${MAX_TITLE_LENGTH} characters.`,
    );
  }
  return trimmed;
}

function validateDescription(description: string): string {
  const trimmed = description.trim();
  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    throw invalidInput(
      `The description must be at most ${MAX_DESCRIPTION_LENGTH} characters.`,
    );
  }
  return trimmed;
}

function validateVideoUrl(videoUrl: string): string {
  const source = parseVideoSource(videoUrl);
  if (source === null) {
    throw invalidInput(describeVideoUrlFailure(videoUrl));
  }
  return source.url;
}

function validateThumbnailUrl(thumbnailUrl: string | undefined): string | undefined {
  if (thumbnailUrl === undefined) {
    return undefined;
  }
  const trimmed = thumbnailUrl.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (trimmed.length > MAX_THUMBNAIL_LENGTH) {
    throw invalidInput("That thumbnail URL is too long.");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw invalidInput("The thumbnail must be a valid URL.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw invalidInput("The thumbnail must be an http(s) URL.");
  }
  return trimmed;
}

/**
 * The published feed.
 *
 * Only `published` content is ever returned here, newest first. Optional
 * author and search filters are applied with the matching index, so the feed
 * never scans the whole table.
 */
export const listPublished = query({
  args: {
    paginationOpts: paginationOptsValidator,
    authorId: v.optional(v.id("users")),
  },
  returns: paginatedContentsValidator,
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);

    const page =
      args.authorId === undefined
        ? await ctx.db
            .query("contents")
            .withIndex("status", (q) => q.eq("status", "published"))
            .order("desc")
            .paginate(args.paginationOpts)
        : await ctx.db
            .query("contents")
            .withIndex("status_author", (q) =>
              q
                .eq("status", "published")
                .eq("authorId", args.authorId as Id<"users">),
            )
            .order("desc")
            .paginate(args.paginationOpts);

    return {
      page: await buildContentSummaries(ctx, page.page, viewer),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

/**
 * Full text search across published lesson titles.
 */
export const searchContents = query({
  args: {
    searchTerm: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginatedContentsValidator,
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    const term = args.searchTerm.trim();

    if (term.length === 0) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const page = await ctx.db
      .query("contents")
      .withSearchIndex("title_search", (q) =>
        q.search("title", term).eq("status", "published"),
      )
      .paginate(args.paginationOpts);

    return {
      page: await buildContentSummaries(ctx, page.page, viewer),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

/**
 * A single lesson.
 *
 * Published lessons are visible to everybody. Drafts and archived lessons are
 * only visible to their author and to administrators — everyone else gets
 * `null`, so the existence of an unpublished lesson is not leaked.
 */
export const getContent = query({
  args: { contentId: v.id("contents") },
  returns: v.nullable(contentDetailValidator),
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    const content = await ctx.db.get(args.contentId);
    if (content === null) {
      return null;
    }

    const isPublished = content.status === "published";
    if (!isPublished && !canEditContent(viewer, content.authorId)) {
      return null;
    }

    const [summary] = await buildContentSummaries(ctx, [content], viewer);
    if (summary === undefined) {
      return null;
    }

    return {
      ...summary,
      video: await resolveVideo(ctx, content),
      canEdit: canEditContent(viewer, content.authorId),
    };
  },
});

/**
 * The lessons uploaded by one tutor.
 *
 * Unpublished lessons are included only when the caller is that tutor or an
 * administrator.
 */
export const listByAuthor = query({
  args: {
    authorId: v.id("users"),
    paginationOpts: paginationOptsValidator,
    includeUnpublished: v.optional(v.boolean()),
  },
  returns: paginatedContentsValidator,
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    const includeUnpublished = args.includeUnpublished ?? false;

    if (includeUnpublished) {
      const isOwner = viewer !== null && viewer.id === args.authorId;
      const isAdmin = viewer !== null && viewer.role === "admin";
      if (!isOwner && !isAdmin) {
        throw forbidden("You can only list your own unpublished lessons.");
      }
    }

    const page = await ctx.db
      .query("contents")
      .withIndex("author", (q) => q.eq("authorId", args.authorId))
      .order("desc")
      .paginate(args.paginationOpts);

    const contents = includeUnpublished
      ? page.page
      : page.page.filter((content) => content.status === "published");

    return {
      page: await buildContentSummaries(ctx, contents, viewer),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

/**
 * The signed-in tutor's own lessons, including drafts and archived lessons.
 */
export const listMyContents = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginatedContentsValidator,
  handler: async (ctx, args) => {
    const viewer = await requireTutor(ctx);

    const page = await ctx.db
      .query("contents")
      .withIndex("author", (q) => q.eq("authorId", viewer.id))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      page: await buildContentSummaries(ctx, page.page, viewer),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

/**
 * Create a lesson as a draft.
 *
 * Tutors and administrators only. New content is never published
 * automatically — the author has to publish it explicitly.
 *
 * A lesson can be backed by a video link or a file the tutor uploaded to
 * Convex file storage. Exactly one must be provided.
 */
export const createContent = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    videoUrl: v.optional(v.string()),
    videoStorageId: v.optional(v.id("_storage")),
    thumbnailUrl: v.optional(v.string()),
    thumbnailStorageId: v.optional(v.id("_storage")),
  },
  returns: v.id("contents"),
  handler: async (ctx, args) => {
    const viewer = await requireTutor(ctx);

    const title = validateTitle(args.title);
    const description = validateDescription(args.description);

    const hasVideoUrl = args.videoUrl !== undefined && args.videoUrl.trim().length > 0;
    const hasVideoFile = args.videoStorageId !== undefined;
    if (hasVideoUrl === hasVideoFile) {
      throw invalidInput("Provide either a video link or an uploaded video file.");
    }

    const videoUrl = hasVideoUrl ? validateVideoUrl(args.videoUrl as string) : undefined;
    const videoStorageId = args.videoStorageId;
    if (videoStorageId !== undefined) {
      const upload = await requireOwnedUpload(ctx, videoStorageId, "video", viewer.id);
      await validateUpload(ctx, upload, "video");
    }

    const hasThumbnailUrl =
      args.thumbnailUrl !== undefined && args.thumbnailUrl.trim().length > 0;
    const hasThumbnailFile = args.thumbnailStorageId !== undefined;
    if (hasThumbnailUrl && hasThumbnailFile) {
      throw invalidInput("Provide either a thumbnail link or an uploaded image, not both.");
    }

    const thumbnailUrl = validateThumbnailUrl(args.thumbnailUrl);
    const thumbnailStorageId = args.thumbnailStorageId;
    if (thumbnailStorageId !== undefined) {
      const upload = await requireOwnedUpload(
        ctx,
        thumbnailStorageId,
        "image",
        viewer.id,
      );
      await validateUpload(ctx, upload, "image");
    }

    return await ctx.db.insert("contents", {
      title,
      description,
      videoUrl,
      videoStorageId,
      thumbnailUrl,
      thumbnailStorageId,
      authorId: viewer.id,
      status: "draft",
      likeCount: 0,
      commentCount: 0,
    });
  },
});

/**
 * Update a lesson you own.
 *
 * Updating a published lesson keeps it published; use
 * {@link setContentStatus} to change the status.
 */
export const updateContent = mutation({
  args: {
    contentId: v.id("contents"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    videoUrl: v.optional(v.string()),
    videoStorageId: v.optional(v.id("_storage")),
    thumbnailUrl: v.optional(v.string()),
    thumbnailStorageId: v.optional(v.id("_storage")),
  },
  returns: v.id("contents"),
  handler: async (ctx, args) => {
    const { content, viewer } = await requireOwnedContent(ctx, args.contentId);

    const patch: Partial<Doc<"contents">> = {};

    if (args.title !== undefined) {
      patch.title = validateTitle(args.title);
    }
    if (args.description !== undefined) {
      patch.description = validateDescription(args.description);
    }
    const obsoleteUploads: (Id<"_storage"> | undefined)[] = [];
    if (args.videoUrl !== undefined) {
      patch.videoUrl = validateVideoUrl(args.videoUrl);
      patch.videoStorageId = undefined;
      obsoleteUploads.push(content.videoStorageId);
    }
    if (args.videoStorageId !== undefined) {
      const upload = await requireOwnedUpload(
        ctx,
        args.videoStorageId,
        "video",
        viewer.id,
        content._id,
      );
      await validateUpload(ctx, upload, "video");
      patch.videoStorageId = args.videoStorageId;
      patch.videoUrl = undefined;
      obsoleteUploads.push(content.videoStorageId);
    }
    if (args.thumbnailUrl !== undefined) {
      patch.thumbnailUrl = validateThumbnailUrl(args.thumbnailUrl);
      patch.thumbnailStorageId = undefined;
      obsoleteUploads.push(content.thumbnailStorageId);
    }
    if (args.thumbnailStorageId !== undefined) {
      const upload = await requireOwnedUpload(
        ctx,
        args.thumbnailStorageId,
        "image",
        viewer.id,
        content._id,
      );
      await validateUpload(ctx, upload, "image");
      patch.thumbnailStorageId = args.thumbnailStorageId;
      patch.thumbnailUrl = undefined;
      obsoleteUploads.push(content.thumbnailStorageId);
    }

    if (Object.keys(patch).length > 0) {
      patch.updatedAt = Date.now();
      await ctx.db.patch(content._id, patch);
      await deleteUploads(ctx, obsoleteUploads);
    }

    return content._id;
  },
});

/**
 * Publish, archive or move a lesson back to draft.
 *
 * A tutor may only change the status of their own lessons. Administrators may
 * change the status of any lesson.
 */
export const setContentStatus = mutation({
  args: {
    contentId: v.id("contents"),
    status: contentStatusValidator,
  },
  returns: v.id("contents"),
  handler: async (ctx, args) => {
    const { content } = await requireOwnedContent(ctx, args.contentId);

    await ctx.db.patch(content._id, {
      status: args.status,
      updatedAt: Date.now(),
    });

    return content._id;
  },
});

/**
 * Delete a lesson you own.
 *
 * The likes, comments and saved-content rows that point at it are removed as
 * well, so no orphaned rows are left behind. Administrators may delete any
 * lesson.
 */
export const deleteContent = mutation({
  args: { contentId: v.id("contents") },
  returns: v.id("contents"),
  handler: async (ctx, args) => {
    const { content } = await requireOwnedContent(ctx, args.contentId);

    const likes = await ctx.db
      .query("likes")
      .withIndex("content", (q) => q.eq("contentId", content._id))
      .collect();
    for (const like of likes) {
      await ctx.db.delete(like._id);
    }

    const comments = await ctx.db
      .query("comments")
      .withIndex("content", (q) => q.eq("contentId", content._id))
      .collect();
    for (const comment of comments) {
      await ctx.db.delete(comment._id);
    }

    const saved = await ctx.db
      .query("savedContents")
      .withIndex("content", (q) => q.eq("contentId", content._id))
      .collect();
    for (const savedContent of saved) {
      await ctx.db.delete(savedContent._id);
    }

    await deleteUploads(ctx, [content.videoStorageId, content.thumbnailStorageId]);
    await ctx.db.delete(content._id);
    return content._id;
  },
});
