import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { forbidden, invalidInput, notFound } from "./errors";
import {
  formatBytes,
  isAllowedContentType,
  maxUploadBytes,
  type UploadKind,
} from "../../shared/upload";

/**
 * Helpers for files that live in Convex file storage.
 *
 * The studio uploads a file first and passes the resulting storage id to the
 * mutation that creates the lesson. Every storage id that a lesson points at
 * has to be recorded in the `uploads` table first, which is what ties the
 * file to the tutor who uploaded it.
 */

type UploadContext = QueryCtx | MutationCtx;

/** What the deployment knows about a file that is in storage. */
type StorageMetadata = {
  contentType: string | null;
  size: number;
};

/**
 * Read the metadata of a file in storage.
 *
 * `ctx.db.system.get("_storage", id)` is the supported way to do this.
 *
 * Returns `undefined` when the runtime does not expose the system table at
 * all (the unit test harness does not), and `null` when the file is gone.
 * The two are kept apart: a missing file is a problem, an unavailable
 * capability is not.
 */
async function readStorageMetadata(
  ctx: UploadContext,
  storageId: Id<"_storage">,
): Promise<StorageMetadata | null | undefined> {
  try {
    const metadata = await ctx.db.system.get("_storage", storageId);
    if (metadata === null) {
      return null;
    }
    return {
      contentType: metadata.contentType ?? null,
      size: metadata.size ?? 0,
    };
  } catch {
    return undefined;
  }
}

/**
 * Check that the file behind a storage id is one the app accepts.
 *
 * The declared type and size come from the upload record, which was written
 * when the file was uploaded. Where the runtime can report what was actually
 * stored, that is checked as well — so a file that was uploaded under a
 * misleading content type is refused.
 */
export async function validateUpload(
  ctx: UploadContext,
  upload: Doc<"uploads">,
  kind: UploadKind,
): Promise<void> {
  if (!isAllowedContentType(kind, upload.contentType)) {
    throw invalidInput(
      kind === "video"
        ? "That file is not a video. Upload an .mp4, .webm, .mov or .ogv file."
        : "That file is not an image. Upload a .jpg, .png, .webp, .gif or .avif file.",
    );
  }

  const limit = maxUploadBytes(kind);
  if (upload.size > limit) {
    throw invalidInput(
      `That file is ${formatBytes(upload.size)}. The largest file that can be uploaded is ${formatBytes(limit)}.`,
    );
  }

  const metadata = await readStorageMetadata(ctx, upload.storageId);
  if (metadata === null) {
    throw invalidInput(
      kind === "video"
        ? "That video is no longer in storage. Please choose the file again."
        : "That image is no longer in storage. Please choose the file again.",
    );
  }
  if (metadata === undefined) {
    return;
  }

  if (
    metadata.contentType !== null &&
    metadata.contentType.length > 0 &&
    !isAllowedContentType(kind, metadata.contentType)
  ) {
    throw invalidInput(
      kind === "video"
        ? "That file is not a video. Upload an .mp4, .webm, .mov or .ogv file."
        : "That file is not an image. Upload a .jpg, .png, .webp, .gif or .avif file.",
    );
  }

  if (metadata.size > limit) {
    throw invalidInput(
      `That file is ${formatBytes(metadata.size)}. The largest file that can be uploaded is ${formatBytes(limit)}.`,
    );
  }
}

/**
 * The upload record for a file, or `null` when there is none.
 */
export async function findUpload(
  ctx: UploadContext,
  storageId: Id<"_storage">,
): Promise<Doc<"uploads"> | null> {
  return await ctx.db
    .query("uploads")
    .withIndex("storage", (q) => q.eq("storageId", storageId))
    .first();
}

/**
 * Check that the caller may use this file.
 *
 * The file has to exist, have been uploaded by this tutor and be of the kind
 * the lesson expects. A file may only back one lesson, so that two lessons
 * cannot end up pointing at the same video.
 */
export async function requireOwnedUpload(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
  kind: UploadKind,
  ownerId: Id<"users">,
  /** The lesson being changed, when there is one. */
  excludeContentId?: Id<"contents">,
): Promise<Doc<"uploads">> {
  const upload = await findUpload(ctx, storageId);
  if (upload === null) {
    throw notFound("That file was not uploaded from this studio.");
  }
  if (upload.ownerId !== ownerId) {
    throw forbidden("That file was uploaded by somebody else.");
  }
  if (upload.kind !== kind) {
    throw invalidInput(
      kind === "video"
        ? "That file is a thumbnail, not a video."
        : "That file is a video, not a thumbnail.",
    );
  }

  await assertNotAlreadyUsed(ctx, storageId, kind, excludeContentId);

  return upload;
}

/**
 * Refuse a file that already backs another lesson.
 */
async function assertNotAlreadyUsed(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
  kind: UploadKind,
  excludeContentId: Id<"contents"> | undefined,
): Promise<void> {
  const existing =
    kind === "video"
      ? await ctx.db
          .query("contents")
          .withIndex("video_storage", (q) => q.eq("videoStorageId", storageId))
          .first()
      : await ctx.db
          .query("contents")
          .withIndex("thumbnail_storage", (q) =>
            q.eq("thumbnailStorageId", storageId),
          )
          .first();

  if (existing !== null && existing._id !== excludeContentId) {
    throw invalidInput("That file is already used by another lesson.");
  }
}

/**
 * Delete the files behind a set of storage ids.
 *
 * Used when a lesson is deleted, so the video does not linger in storage
 * after the lesson that pointed at it is gone. A file that is already gone
 * is not an error.
 */
export async function deleteUploads(
  ctx: MutationCtx,
  storageIds: (Id<"_storage"> | undefined)[],
): Promise<void> {
  for (const storageId of storageIds) {
    if (storageId === undefined) {
      continue;
    }
    try {
      await ctx.storage.delete(storageId);
    } catch {
      // The file is already gone, which is the state we wanted anyway.
    }
    await deleteUploadRecord(ctx, storageId);
  }
}

/**
 * Remove the record of an upload, so no row is left pointing at a file that
 * no longer exists.
 */
export async function deleteUploadRecord(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
): Promise<void> {
  const upload = await findUpload(ctx, storageId);
  if (upload !== null) {
    await ctx.db.delete(upload._id);
  }
}
