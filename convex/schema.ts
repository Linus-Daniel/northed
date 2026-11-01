import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

/**
 * Application roles.
 *
 * `role` is only ever written by an administrator (see `users.setUserRole`).
 * Self service mutations never touch it.
 */
export const roleValidator = v.union(
  v.literal("user"),
  v.literal("tutor"),
  v.literal("admin"),
);

/**
 * Content lifecycle: `draft` (tutor only) -> `published` (visible to
 * everyone) -> `archived` (hidden from the feed, kept for records).
 */
export const contentStatusValidator = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("archived"),
);

/**
 * `authTables` provides the tables Convex Auth needs (users, authAccounts,
 * authSessions, authRefreshTokens, authVerificationCodes, authVerifiers,
 * authRateLimits).
 *
 * The `users` table is overridden below so that the Convex Auth user document
 * doubles as the NorthEd application profile: one document per identity, which
 * removes any chance of a profile drifting away from the authenticated user.
 *
 * The Convex Auth fields are kept exactly as the library expects them
 * (see https://labs.convex.dev/auth/setup/schema). The NorthEd specific fields
 * are appended and are all optional, because Convex Auth creates the document
 * before we know anything about the person.
 */
export default defineSchema({
  ...authTables,

  users: defineTable({
    // --- Convex Auth fields -------------------------------------------------
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    image: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // --- NorthEd profile fields --------------------------------------------
    /** Profile picture shown in the UI. Falls back to the Convex Auth image. */
    avatar: v.optional(v.string()),
    gender: v.optional(v.string()),
    address: v.optional(v.string()),
    /** Defaults to "user" when unset. Only administrators may change it. */
    role: v.optional(roleValidator),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("role", ["role"]),

  /** Educational content (a recorded lesson) uploaded by a tutor. */
  contents: defineTable({
    title: v.string(),
    description: v.string(),
    authorId: v.id("users"),
    /**
     * Link to a video hosted elsewhere. See `shared/video.ts` for the
     * supported providers.
     *
     * Exactly one of `videoUrl` and `videoStorageId` is set.
     */
    videoUrl: v.optional(v.string()),
    /**
     * Video the tutor uploaded to Convex file storage.
     *
     * The file itself lives in file storage; only the id is stored here, so
     * the file can be deleted together with the lesson.
     */
    videoStorageId: v.optional(v.id("_storage")),
    /** Link to a thumbnail hosted elsewhere. */
    thumbnailUrl: v.optional(v.string()),
    /** Thumbnail the tutor uploaded to Convex file storage. */
    thumbnailStorageId: v.optional(v.id("_storage")),
    status: contentStatusValidator,
    /** Denormalized counters, kept in sync by the like/comment mutations. */
    likeCount: v.number(),
    commentCount: v.number(),
    updatedAt: v.optional(v.number()),
  })
    // Convex appends `_creationTime` to every index automatically, so these
    // three indexes already order by creation time within each key. Reserved
    // fields must never be named in an index definition.
    .index("author", ["authorId"])
    .index("status", ["status"])
    .index("status_author", ["status", "authorId"])
    // So a file that already backs one lesson cannot back another.
    .index("video_storage", ["videoStorageId"])
    .index("thumbnail_storage", ["thumbnailStorageId"])
    .searchIndex("title_search", {
      searchField: "title",
      filterFields: ["status"],
    }),

  /**
   * Files a tutor uploaded to Convex file storage.
   *
   * The upload itself happens outside the database, so this table records
   * who uploaded which file. A lesson can only point at a file the uploader
   * owns, which stops one tutor from attaching another tutor's file to their
   * own lesson.
   */
  uploads: defineTable({
    storageId: v.id("_storage"),
    ownerId: v.id("users"),
    /** What the file is for: the lesson video or its thumbnail. */
    kind: v.union(v.literal("video"), v.literal("image")),
    contentType: v.string(),
    size: v.number(),
  })
    .index("storage", ["storageId"])
    .index("owner", ["ownerId"]),

  likes: defineTable({
    contentId: v.id("contents"),
    userId: v.id("users"),
  })
    .index("content", ["contentId"])
    .index("user", ["userId"])
    .index("content_user", ["contentId", "userId"]),

  comments: defineTable({
    contentId: v.id("contents"),
    userId: v.id("users"),
    text: v.string(),
    updatedAt: v.optional(v.number()),
  })
    // `_creationTime` is appended automatically, so this index already
    // returns a content's comments oldest first.
    .index("content", ["contentId"])
    .index("user", ["userId"]),

  savedContents: defineTable({
    contentId: v.id("contents"),
    userId: v.id("users"),
  })
    .index("content", ["contentId"])
    .index("user", ["userId"])
    .index("content_user", ["contentId", "userId"]),
});
