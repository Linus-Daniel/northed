import { v } from "convex/values";
import type { Infer } from "convex/values";

/**
 * Application roles. Only administrators may change a user's role.
 */
export const roleValidator = v.union(
  v.literal("user"),
  v.literal("tutor"),
  v.literal("admin"),
);
export type Role = Infer<typeof roleValidator>;

/**
 * Content lifecycle: `draft` (author only) -> `published` (everyone) ->
 * `archived` (hidden from the feed).
 */
export const contentStatusValidator = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("archived"),
);
export type ContentStatus = Infer<typeof contentStatusValidator>;

/**
 * The safe subset of a user document that may be shown to anybody.
 * It deliberately excludes email, phone and address.
 */
export const publicUserValidator = v.object({
  id: v.id("users"),
  name: v.string(),
  avatar: v.union(v.string(), v.null()),
  role: roleValidator,
});
export type PublicUser = Infer<typeof publicUserValidator>;

/**
 * How a lesson's video should be played.
 *
 * `embed` is an address for an <iframe> (YouTube, Vimeo), `file` is an
 * address the browser plays itself (an uploaded file, an S3 object, a
 * direct `.mp4`).
 */
export const contentVideoValidator = v.object({
  kind: v.union(v.literal("embed"), v.literal("file")),
  url: v.string(),
  provider: v.string(),
});
export type ContentVideo = Infer<typeof contentVideoValidator>;

/** A content record as it appears in a feed or on a detail page. */
export const contentSummaryValidator = v.object({
  id: v.id("contents"),
  title: v.string(),
  description: v.string(),
  /** Where the video comes from: "youtube", "vimeo", "upload", "s3", ... */
  videoProvider: v.string(),
  thumbnailUrl: v.union(v.string(), v.null()),
  status: contentStatusValidator,
  author: publicUserValidator,
  likeCount: v.number(),
  commentCount: v.number(),
  likedByViewer: v.boolean(),
  savedByViewer: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
});
export type ContentSummary = Infer<typeof contentSummaryValidator>;

/** A content record plus the viewer's editing rights. */
export const contentDetailValidator = v.object({
  ...contentSummaryValidator.fields,
  /** The video itself, resolved to something the player can use. */
  video: v.union(contentVideoValidator, v.null()),
  canEdit: v.boolean(),
});
export type ContentDetail = Infer<typeof contentDetailValidator>;

/** A comment together with its author and the viewer's rights on it. */
export const commentValidator = v.object({
  id: v.id("comments"),
  contentId: v.id("contents"),
  text: v.string(),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
  author: publicUserValidator,
  canEdit: v.boolean(),
  canDelete: v.boolean(),
});
export type CommentItem = Infer<typeof commentValidator>;

/** The signed-in user's own profile. */
export const profileValidator = v.object({
  id: v.id("users"),
  name: v.union(v.string(), v.null()),
  email: v.union(v.string(), v.null()),
  phone: v.union(v.string(), v.null()),
  gender: v.union(v.string(), v.null()),
  address: v.union(v.string(), v.null()),
  avatar: v.union(v.string(), v.null()),
  role: roleValidator,
  createdAt: v.number(),
});
export type Profile = Infer<typeof profileValidator>;

/**
 * A content record as shown in the "saved" list: the saved content plus the
 * moment it was saved.
 */
export const savedContentValidator = v.object({
  content: contentSummaryValidator,
  savedAt: v.number(),
});
export type SavedContent = Infer<typeof savedContentValidator>;
