"use client";

import { useQuery_experimental } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import VideoPlayer from "@/components/VideoPlayer";
import LikeButton from "@/components/LikeButton";
import SaveButton from "@/components/SaveButton";
import CommentSection from "@/components/CommentSection";

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function LessonPage() {
  const params = useParams<{ id: string }>();
  const contentId = params.id as Id<"contents">;

  const state = useQuery_experimental({
    query: api.contents.getContent,
    args: { contentId },
  });

  if (state.status === "pending") {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-16">
        <p className="text-sm text-ink-faint">Loading lesson…</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-16">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          That lesson could not be opened
        </h1>
        <p className="mt-3 text-sm text-ink-soft">{state.error.message}</p>
        <Link href="/" className="button-secondary mt-6">
          Back to the library
        </Link>
      </div>
    );
  }

  const lesson = state.data;

  if (lesson === null) {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-16">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          This lesson is not available
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-soft">
          It may still be a draft, or it may have been archived. Only published
          lessons are visible to everyone.
        </p>
        <Link href="/" className="button-secondary mt-6">
          Back to the library
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-ink-faint">
        <Link href="/" className="transition-colors hover:text-ink">
          Library
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-ink-soft">{lesson.title}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            {lesson.title}
          </h1>

          <p className="mt-3 text-sm text-ink-faint">
            By {lesson.author.name} · {formatDate(lesson.createdAt)}
            {lesson.updatedAt !== null ? " · updated" : ""}
          </p>

          <div className="mt-6">
            <VideoPlayer
              video={lesson.video}
              title={lesson.title}
              thumbnailUrl={lesson.thumbnailUrl}
            />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <LikeButton
              contentId={lesson.id}
              likedByViewer={lesson.likedByViewer}
              likeCount={lesson.likeCount}
            />
            <SaveButton
              contentId={lesson.id}
              savedByViewer={lesson.savedByViewer}
            />
            <span className="text-xs text-ink-faint">
              {lesson.commentCount}{" "}
              {lesson.commentCount === 1 ? "comment" : "comments"}
            </span>
          </div>

          <div className="prose-note mt-8 border-t border-rule pt-6">
            {lesson.description}
          </div>

          <CommentSection contentId={lesson.id} />
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="border-t-2 border-ink pt-4">
            <p className="eyebrow">Taught by</p>
            <p className="mt-2 font-display text-xl font-semibold tracking-tight">
              {lesson.author.name}
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-ink-faint">
              {lesson.author.role}
            </p>
          </div>

          {lesson.canEdit ? (
            <div className="mt-8 border-t border-rule pt-4">
              <p className="eyebrow">Your lesson</p>
              <p className="mt-2 text-sm text-ink-soft">
                You can publish, archive and edit this lesson from the studio.
              </p>
              <Link href="/studio" className="button-secondary mt-4">
                Open the studio
              </Link>
            </div>
          ) : null}

          <div className="mt-8 border-t border-rule pt-4 text-xs text-ink-faint">
            <p>Status: {lesson.status}</p>
            <p className="mt-1">Added {formatDate(lesson.createdAt)}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
