"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery, useQuery_experimental } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CheckIcon, PencilIcon, TrashIcon } from "@/components/icons";
import {
  allowedContentTypes,
  formatBytes,
  isAllowedContentType,
  maxUploadBytes,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_VIDEO_UPLOAD_BYTES,
  type UploadKind,
} from "@/shared/upload";
import { toUserMessage } from "@/lib/errors";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

export default function StudioPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-12">
      <header className="mb-8 border-b border-rule-strong pb-5">
        <p className="eyebrow">Tutor studio</p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">
          Your lessons
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-soft">
          Draft a lesson, then publish it when it is ready. Only you and the
          administrators can see a draft.
        </p>
      </header>

      {isLoading ? (
        <p className="text-sm text-ink-faint">Checking session…</p>
      ) : !isAuthenticated ? (
        <p className="rounded-sm border border-rule bg-surface px-4 py-6 text-sm text-ink-soft">
          <Link href="/sign-in" className="font-medium text-forest-deep underline">
            Sign in
          </Link>{" "}
          with a tutor account to publish lessons.
        </p>
      ) : (
        <StudioContent />
      )}
    </div>
  );
}

function StudioContent() {
  const profile = useQuery(api.users.getMyProfile);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoMode, setVideoMode] = useState<"file" | "link">("file");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbnailMode, setThumbnailMode] = useState<"link" | "file">("link");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"idle" | "uploading" | "saving">("idle");
  /** Bumped after a save so the file inputs come back empty. */
  const [uploadKey, setUploadKey] = useState(0);

  const mine = useQuery_experimental({
    query: api.contents.listMyContents,
    args: "skip",
  });

  const createUploadUrl = useMutation(api.storage.generateUploadUrl);
  const registerUpload = useMutation(api.storage.registerUpload);
  const createContent = useMutation(api.contents.createContent);
  const setStatus = useMutation(api.contents.setContentStatus);
  const removeContent = useMutation(api.contents.deleteContent);

  const role = profile?.role;
  const isTutor = role === "tutor" || role === "admin";

  /**
   * Send a file to Convex file storage and return its storage id.
   *
   * The checks mirror convex/storage.ts, so a file that could never be
   * accepted is refused before anything is uploaded. The upload URL is
   * short lived and single use; the browser POSTs the file to it and reads
   * the storage id out of the response.
   */
  const uploadFile = async (
    file: File,
    kind: UploadKind,
  ): Promise<Id<"_storage">> => {
    if (!isAllowedContentType(kind, file.type)) {
      throw new Error(
        kind === "video"
          ? "That file is not a video. Upload an .mp4, .webm, .mov or .ogv file."
          : "That file is not an image. Upload a .jpg, .png, .webp, .gif or .avif file.",
      );
    }
    if (file.size > maxUploadBytes(kind)) {
      throw new Error(
        `That file is ${formatBytes(file.size)}. The largest file that can be uploaded is ${formatBytes(maxUploadBytes(kind))}.`,
      );
    }

    const postUrl = await createUploadUrl({
      kind,
      contentType: file.type,
      size: file.size,
    });
    const response = await fetch(postUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!response.ok) {
      throw new Error(`Uploading ${file.name} did not work. Please try again.`);
    }

    const { storageId } = (await response.json()) as {
      storageId: Id<"_storage">;
    };

    // Record the file against the tutor who uploaded it. A lesson can only
    // point at a file the backend knows belongs to its own author.
    await registerUpload({
      storageId,
      kind,
      contentType: file.type,
      size: file.size,
    });

    return storageId;
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (videoMode === "file" && videoFile === null) {
      setError("Choose a video file to upload, or add a link instead.");
      return;
    }
    if (thumbnailMode === "file" && thumbnailFile === null) {
      setError("Choose a thumbnail image to upload, or add a link instead.");
      return;
    }

    setBusy(true);
    try {
      setPhase("uploading");
      const videoStorageId =
        videoMode === "file" && videoFile !== null
          ? await uploadFile(videoFile, "video")
          : undefined;
      const thumbnailStorageId =
        thumbnailMode === "file" && thumbnailFile !== null
          ? await uploadFile(thumbnailFile, "image")
          : undefined;

      setPhase("saving");
      await createContent({
        title,
        description,
        videoUrl: videoMode === "link" ? videoUrl : undefined,
        videoStorageId,
        thumbnailUrl:
          thumbnailMode === "link" && thumbnailUrl.length > 0
            ? thumbnailUrl
            : undefined,
        thumbnailStorageId,
      });
      setTitle("");
      setDescription("");
      setVideoUrl("");
      setVideoFile(null);
      setVideoMode("file");
      setThumbnailUrl("");
      setThumbnailFile(null);
      setThumbnailMode("link");
      setUploadKey((key) => key + 1);
    } catch (cause) {
      setError(toUserMessage(cause));
    } finally {
      setPhase("idle");
      setBusy(false);
    }
  };

  const changeStatus = async (
    contentId: Id<"contents">,
    status: "draft" | "published" | "archived",
  ) => {
    setError(null);
    try {
      await setStatus({ contentId, status });
    } catch (cause) {
      setError(toUserMessage(cause));
    }
  };

  const destroy = async (contentId: Id<"contents">) => {
    setError(null);
    try {
      await removeContent({ contentId });
    } catch (cause) {
      setError(toUserMessage(cause));
    }
  };

  if (profile === undefined) {
    return <p className="text-sm text-ink-faint">Loading your profile…</p>;
  }

  if (!isTutor) {
    return (
      <div className="rounded-sm border border-rule bg-surface px-5 py-8">
        <p className="font-display text-xl font-semibold tracking-tight">
          The studio is for tutors
        </p>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
          Your account is a student account, so you can watch, like, save and
          comment on lessons. Ask an administrator to change your role if you
          should be teaching here too.
        </p>
        <Link href="/" className="button-secondary mt-6">
          Back to the library
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-12 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <section aria-labelledby="new-lesson-heading">
        <h2
          id="new-lesson-heading"
          className="font-display text-2xl font-semibold tracking-tight"
        >
          New lesson
        </h2>
        <p className="mt-2 text-sm text-ink-soft">
          New lessons are always created as a draft.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="lesson-title" className="label">
              Title
            </label>
            <input
              id="lesson-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              minLength={3}
              maxLength={120}
              className="field mt-1.5"
            />
          </div>

          <div>
            <label htmlFor="lesson-description" className="label">
              Description
            </label>
            <textarea
              id="lesson-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              required
              rows={5}
              maxLength={2000}
              className="field mt-1.5 resize-y"
            />
          </div>

          <div>
            <span id="lesson-video-label" className="label">
              Video
            </span>
            <div
              role="group"
              aria-labelledby="lesson-video-label"
              className="mb-2 inline-flex gap-1"
            >
              <button
                type="button"
                aria-pressed={videoMode === "file"}
                onClick={() => setVideoMode("file")}
                className={`rounded-xs px-2.5 py-1.5 text-sm transition-colors ${
                  videoMode === "file"
                    ? "bg-forest-soft font-medium text-forest-deep"
                    : "text-ink-soft hover:bg-paper-deep hover:text-ink"
                }`}
              >
                Upload a file
              </button>
              <button
                type="button"
                aria-pressed={videoMode === "link"}
                onClick={() => setVideoMode("link")}
                className={`rounded-xs px-2.5 py-1.5 text-sm transition-colors ${
                  videoMode === "link"
                    ? "bg-forest-soft font-medium text-forest-deep"
                    : "text-ink-soft hover:bg-paper-deep hover:text-ink"
                }`}
              >
                Add a link
              </button>
            </div>

            {videoMode === "file" ? (
              <div>
                <label htmlFor="lesson-video-file" className="sr-only">
                  Video file
                </label>
                <input
                  key={`video-${uploadKey}`}
                  id="lesson-video-file"
                  type="file"
                  accept={allowedContentTypes("video").join(",")}
                  onChange={(event) =>
                    setVideoFile(event.target.files?.[0] ?? null)
                  }
                  className="field text-sm"
                />
                <p className="mt-1.5 text-xs text-ink-faint">
                  An .mp4, .webm, .mov or .ogv file up to{" "}
                  {formatBytes(MAX_VIDEO_UPLOAD_BYTES)}.
                </p>
                {videoFile !== null ? (
                  <p className="mt-1 text-xs text-ink-soft">
                    {videoFile.name} · {formatBytes(videoFile.size)}
                  </p>
                ) : null}
              </div>
            ) : (
              <div>
                <label htmlFor="lesson-video" className="sr-only">
                  Video link
                </label>
                <input
                  id="lesson-video"
                  value={videoUrl}
                  onChange={(event) => setVideoUrl(event.target.value)}
                  required
                  placeholder="https://www.youtube.com/watch?v=…"
                  className="field"
                />
                <p className="mt-1.5 text-xs text-ink-faint">
                  YouTube, Vimeo, Mux, Cloudflare Stream, S3 or a direct .mp4
                  link.
                </p>
              </div>
            )}
          </div>

          <div>
            <span id="lesson-thumbnail-label" className="label">
              Thumbnail (optional)
            </span>
            <div
              role="group"
              aria-labelledby="lesson-thumbnail-label"
              className="mb-2 inline-flex gap-1"
            >
              <button
                type="button"
                aria-pressed={thumbnailMode === "link"}
                onClick={() => setThumbnailMode("link")}
                className={`rounded-xs px-2.5 py-1.5 text-sm transition-colors ${
                  thumbnailMode === "link"
                    ? "bg-forest-soft font-medium text-forest-deep"
                    : "text-ink-soft hover:bg-paper-deep hover:text-ink"
                }`}
              >
                Add a link
              </button>
              <button
                type="button"
                aria-pressed={thumbnailMode === "file"}
                onClick={() => setThumbnailMode("file")}
                className={`rounded-xs px-2.5 py-1.5 text-sm transition-colors ${
                  thumbnailMode === "file"
                    ? "bg-forest-soft font-medium text-forest-deep"
                    : "text-ink-soft hover:bg-paper-deep hover:text-ink"
                }`}
              >
                Upload an image
              </button>
            </div>

            {thumbnailMode === "link" ? (
              <div>
                <label htmlFor="lesson-thumbnail" className="sr-only">
                  Thumbnail link
                </label>
                <input
                  id="lesson-thumbnail"
                  value={thumbnailUrl}
                  onChange={(event) => setThumbnailUrl(event.target.value)}
                  placeholder="https://…/thumbnail.jpg"
                  className="field"
                />
              </div>
            ) : (
              <div>
                <label htmlFor="lesson-thumbnail-file" className="sr-only">
                  Thumbnail image
                </label>
                <input
                  key={`thumbnail-${uploadKey}`}
                  id="lesson-thumbnail-file"
                  type="file"
                  accept={allowedContentTypes("image").join(",")}
                  onChange={(event) =>
                    setThumbnailFile(event.target.files?.[0] ?? null)
                  }
                  className="field text-sm"
                />
                <p className="mt-1.5 text-xs text-ink-faint">
                  A .jpg, .png, .webp, .gif or .avif file up to{" "}
                  {formatBytes(MAX_IMAGE_UPLOAD_BYTES)}.
                </p>
                {thumbnailFile !== null ? (
                  <p className="mt-1 text-xs text-ink-soft">
                    {thumbnailFile.name} · {formatBytes(thumbnailFile.size)}
                  </p>
                ) : null}
              </div>
            )}
          </div>

          <button type="submit" className="button-primary" disabled={busy}>
            {phase === "uploading"
              ? "Uploading…"
              : busy
                ? "Saving…"
                : "Save as draft"}
          </button>

          {error ? (
            <p role="alert" className="text-sm text-sienna">
              {error}
            </p>
          ) : null}
        </form>
      </section>

      <section aria-labelledby="my-lessons-heading">
        <h2
          id="my-lessons-heading"
          className="font-display text-2xl font-semibold tracking-tight"
        >
          Published and drafts
        </h2>

        {mine.status === "pending" ? (
          <p className="mt-4 text-sm text-ink-faint">Loading your lessons…</p>
        ) : mine.status === "error" ? (
          <p className="mt-4 text-sm text-sienna">{mine.error.message}</p>
        ) : mine.data.page.length === 0 ? (
          <p className="mt-4 rounded-sm border border-dashed border-rule-strong px-5 py-10 text-center text-sm text-ink-soft">
            You have not written a lesson yet.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-rule border-t border-rule">
            {mine.data.page.map((lesson) => (
              <li key={lesson.id} className="py-5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Link
                    href={`/library/${lesson.id}`}
                    className="font-display text-lg font-semibold tracking-tight transition-colors hover:text-forest-deep"
                  >
                    {lesson.title}
                  </Link>
                  <span
                    className={`rounded-xs px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] ${
                      lesson.status === "published"
                        ? "bg-forest-soft text-forest-deep"
                        : lesson.status === "draft"
                          ? "bg-ochre-soft text-ochre"
                          : "bg-paper-deep text-ink-faint"
                    }`}
                  >
                    {STATUS_LABEL[lesson.status] ?? lesson.status}
                  </span>
                </div>

                <p className="mt-1.5 line-clamp-2 text-sm text-ink-soft">
                  {lesson.description}
                </p>

                <p className="mt-1.5 text-xs text-ink-faint">
                  {lesson.likeCount} likes · {lesson.commentCount} comments
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {lesson.status !== "published" ? (
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => void changeStatus(lesson.id, "published")}
                    >
                      <CheckIcon /> Publish
                    </button>
                  ) : null}
                  {lesson.status !== "archived" ? (
                    <button
                      type="button"
                      className="button-ghost"
                      onClick={() => void changeStatus(lesson.id, "archived")}
                    >
                      Archive
                    </button>
                  ) : null}
                  {lesson.status !== "draft" ? (
                    <button
                      type="button"
                      className="button-ghost"
                      onClick={() => void changeStatus(lesson.id, "draft")}
                    >
                      Move to draft
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="button-ghost"
                    onClick={() => void destroy(lesson.id)}
                  >
                    <TrashIcon /> Delete
                  </button>
                  <Link href={`/library/${lesson.id}`} className="button-ghost">
                    <PencilIcon /> View
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
