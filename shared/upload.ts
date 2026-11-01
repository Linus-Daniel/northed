/**
 * Rules for files a tutor uploads to Convex file storage.
 *
 * Shared by the backend, which enforces them on the server, and by the
 * studio form, which checks a file before sending it so the tutor is told
 * immediately instead of after a failed upload.
 */

/**
 * Convex file storage accepts 20 MiB per file. The limit is on the
 * deployment, not on the code, so it is checked in one place.
 */
export const MAX_VIDEO_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;

export const VIDEO_CONTENT_TYPES: readonly string[] = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
  "video/ogg",
];

export const IMAGE_CONTENT_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];

export type UploadKind = "video" | "image";

/** The largest file of this kind that may be uploaded. */
export function maxUploadBytes(kind: UploadKind): number {
  return kind === "video" ? MAX_VIDEO_UPLOAD_BYTES : MAX_IMAGE_UPLOAD_BYTES;
}

/** The file types that are accepted for this kind of upload. */
export function allowedContentTypes(kind: UploadKind): readonly string[] {
  return kind === "video" ? VIDEO_CONTENT_TYPES : IMAGE_CONTENT_TYPES;
}

/**
 * Is this the kind of file the app accepts?
 *
 * Browsers report the type of the file the tutor picked, and they disagree
 * about some formats (`video/quicktime` and `video/x-m4v` for the same `.mov`
 * file, for example), so the list is explicit rather than a wildcard.
 */
export function isAllowedContentType(
  kind: UploadKind,
  contentType: string,
): boolean {
  return allowedContentTypes(kind).includes(contentType.trim().toLowerCase());
}

/** A human readable file size, for the file picker. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
