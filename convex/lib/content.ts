import type { Doc, Id } from "../_generated/dataModel";
import { parseVideoSource } from "../../shared/video";
import type { AuthCtx, Viewer } from "./auth";
import type { ContentSummary, ContentVideo, PublicUser } from "./validators";

const DEFAULT_DISPLAY_NAME = "NorthEd member";

/** Reduce a user document to the fields that are safe to show to anyone. */
export function toPublicUser(user: Doc<"users">): PublicUser {
  return {
    id: user._id,
    name: user.name?.trim() || DEFAULT_DISPLAY_NAME,
    avatar: user.avatar ?? user.image ?? null,
    role: user.role ?? "user",
  };
}

/**
 * Look up the authors of a page of content in one go.
 *
 * Every distinct author is fetched exactly once, so a page of 20 lessons
 * written by 3 tutors costs 3 reads instead of 20.
 */
export async function loadAuthors(
  ctx: AuthCtx,
  contents: Doc<"contents">[],
): Promise<Map<Id<"users">, PublicUser>> {
  const authorIds = [...new Set(contents.map((content) => content.authorId))];
  const authors = await Promise.all(authorIds.map((id) => ctx.db.get(id)));

  const byId = new Map<Id<"users">, PublicUser>();
  authorIds.forEach((id, index) => {
    const author = authors[index];
    if (author !== null) {
      byId.set(id, toPublicUser(author));
    }
  });
  return byId;
}

/**
 * Which of the given contents has the viewer liked?
 *
 * Uses the `content_user` index, so each check is a single indexed point
 * lookup. The number of lookups is bounded by the page size, never by the
 * total number of likes.
 */
export async function loadLikedContentIds(
  ctx: AuthCtx,
  viewer: Viewer | null,
  contentIds: Id<"contents">[],
): Promise<Set<Id<"contents">>> {
  const liked = new Set<Id<"contents">>();
  if (viewer === null || contentIds.length === 0) {
    return liked;
  }

  const results = await Promise.all(
    contentIds.map((contentId) =>
      ctx.db
        .query("likes")
        .withIndex("content_user", (q) =>
          q.eq("contentId", contentId).eq("userId", viewer.id),
        )
        .first(),
    ),
  );

  contentIds.forEach((contentId, index) => {
    if (results[index] !== null) {
      liked.add(contentId);
    }
  });
  return liked;
}

/** Which of the given contents has the viewer saved? */
export async function loadSavedContentIds(
  ctx: AuthCtx,
  viewer: Viewer | null,
  contentIds: Id<"contents">[],
): Promise<Set<Id<"contents">>> {
  const saved = new Set<Id<"contents">>();
  if (viewer === null || contentIds.length === 0) {
    return saved;
  }

  const results = await Promise.all(
    contentIds.map((contentId) =>
      ctx.db
        .query("savedContents")
        .withIndex("content_user", (q) =>
          q.eq("contentId", contentId).eq("userId", viewer.id),
        )
        .first(),
    ),
  );

  contentIds.forEach((contentId, index) => {
    if (results[index] !== null) {
      saved.add(contentId);
    }
  });
  return saved;
}

/**
 * Where a lesson's video comes from.
 *
 * "upload" for a file in Convex file storage, otherwise the provider the
 * link points at. The feed only shows this as a label, so it never has to
 * resolve the file itself.
 */
export function videoProviderOf(content: Doc<"contents">): string {
  if (content.videoStorageId !== undefined) {
    return "upload";
  }
  if (content.videoUrl === undefined) {
    return "video";
  }
  return parseVideoSource(content.videoUrl)?.provider ?? "video";
}

/**
 * The address of a lesson's thumbnail.
 *
 * An uploaded thumbnail is resolved to its storage address; a linked one is
 * used as it is.
 */
export async function resolveThumbnail(
  ctx: AuthCtx,
  content: Doc<"contents">,
): Promise<string | null> {
  if (content.thumbnailStorageId !== undefined) {
    const url = await ctx.storage.getUrl(content.thumbnailStorageId);
    if (url !== null) {
      return url;
    }
  }
  return content.thumbnailUrl ?? null;
}

/**
 * The address a lesson's video should be played from.
 *
 * `null` when the lesson has no video, or when the link it was saved with is
 * no longer one the app accepts.
 */
export async function resolveVideo(
  ctx: AuthCtx,
  content: Doc<"contents">,
): Promise<ContentVideo | null> {
  if (content.videoStorageId !== undefined) {
    const url = await ctx.storage.getUrl(content.videoStorageId);
    if (url !== null) {
      return { kind: "file", url, provider: "upload" };
    }
  }

  if (content.videoUrl !== undefined) {
    const source = parseVideoSource(content.videoUrl);
    if (source !== null) {
      const kind =
        source.provider === "youtube" || source.provider === "vimeo"
          ? "embed"
          : "file";
      return { kind, url: source.embedUrl, provider: source.provider };
    }
  }

  return null;
}

/**
 * Turn content documents into the shape the frontend consumes.
 */
export async function buildContentSummaries(
  ctx: AuthCtx,
  contents: Doc<"contents">[],
  viewer: Viewer | null,
): Promise<ContentSummary[]> {
  const contentIds = contents.map((content) => content._id);
  const [authors, liked, saved] = await Promise.all([
    loadAuthors(ctx, contents),
    loadLikedContentIds(ctx, viewer, contentIds),
    loadSavedContentIds(ctx, viewer, contentIds),
  ]);

  return Promise.all(
    contents.map(async (content) => {
      const author = authors.get(content.authorId);
      return {
        id: content._id,
        title: content.title,
        description: content.description,
        videoProvider: videoProviderOf(content),
        thumbnailUrl: await resolveThumbnail(ctx, content),
        status: content.status,
        author: author ?? {
          id: content.authorId,
          name: DEFAULT_DISPLAY_NAME,
          avatar: null,
          role: "user" as const,
        },
        likeCount: content.likeCount,
        commentCount: content.commentCount,
        likedByViewer: liked.has(content._id),
        savedByViewer: saved.has(content._id),
        createdAt: content._creationTime,
        updatedAt: content.updatedAt ?? null,
      };
    }),
  );
}
