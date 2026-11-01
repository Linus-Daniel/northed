import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireTutor } from "./lib/auth";
import { forbidden, invalidInput } from "./lib/errors";
import {
  allowedContentTypes,
  formatBytes,
  isAllowedContentType,
  maxUploadBytes,
} from "../shared/upload";

/**
 * File uploads.
 *
 * A browser cannot write to Convex file storage directly, so it asks the
 * backend for a short lived upload URL, POSTs the file to that URL and passes
 * the returned storage id to the mutation that creates the lesson.
 */

const uploadKindValidator = v.union(v.literal("video"), v.literal("image"));

/**
 * A one time URL the browser can POST a file to.
 *
 * Tutors and administrators only — an anonymous visitor must not be able to
 * fill the deployment's storage. The declared type and size are checked here
 * so a file that could never be accepted is refused before it is uploaded.
 */
export const generateUploadUrl = mutation({
  args: {
    kind: uploadKindValidator,
    contentType: v.string(),
    size: v.number(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    await requireTutor(ctx);

    const contentType = args.contentType.trim().toLowerCase();
    if (!isAllowedContentType(args.kind, contentType)) {
      throw invalidInput(
        args.kind === "video"
          ? `That file type is not supported. Use one of: ${allowedContentTypes("video").join(", ")}.`
          : `That file type is not supported. Use one of: ${allowedContentTypes("image").join(", ")}.`,
      );
    }

    if (!Number.isFinite(args.size) || args.size <= 0) {
      throw invalidInput("That file is empty.");
    }

    const limit = maxUploadBytes(args.kind);
    if (args.size > limit) {
      throw invalidInput(
        `That file is larger than ${formatBytes(limit)}. Choose a smaller file.`,
      );
    }

    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Record a file that has just been uploaded.
 *
 * The upload itself happens outside the database, so the file is only known
 * to the deployment once the browser has POSTed it. This mutation is called
 * right after that: it stores the id of the file together with the tutor who
 * uploaded it, which is what lets a lesson prove that it points at a file
 * the author owns.
 */
export const registerUpload = mutation({
  args: {
    storageId: v.id("_storage"),
    kind: uploadKindValidator,
    contentType: v.string(),
    size: v.number(),
  },
  returns: v.id("uploads"),
  handler: async (ctx, args) => {
    const viewer = await requireTutor(ctx);

    const contentType = args.contentType.trim().toLowerCase();
    if (!isAllowedContentType(args.kind, contentType)) {
      throw invalidInput(
        args.kind === "video"
          ? `That file type is not supported. Use one of: ${allowedContentTypes("video").join(", ")}.`
          : `That file type is not supported. Use one of: ${allowedContentTypes("image").join(", ")}.`,
      );
    }

    if (!Number.isFinite(args.size) || args.size <= 0) {
      throw invalidInput("That file is empty.");
    }

    const limit = maxUploadBytes(args.kind);
    if (args.size > limit) {
      throw invalidInput(
        `That file is larger than ${formatBytes(limit)}. Choose a smaller file.`,
      );
    }

    const existing = await ctx.db
      .query("uploads")
      .withIndex("storage", (q) => q.eq("storageId", args.storageId))
      .first();
    if (existing !== null) {
      if (existing.ownerId !== viewer.id) {
        throw forbidden("That file was uploaded by somebody else.");
      }
      return existing._id;
    }

    return await ctx.db.insert("uploads", {
      storageId: args.storageId,
      ownerId: viewer.id,
      kind: args.kind,
      contentType,
      size: args.size,
    });
  },
});
