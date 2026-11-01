import Link from "next/link";
import type { ContentSummary } from "@/convex/lib/validators";
import { LessonPoster } from "./VideoPlayer";
import LikeButton from "./LikeButton";
import SaveButton from "./SaveButton";

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * A lesson in the library list.
 *
 * Deliberately a row, not a card: the library reads like a table of contents,
 * and the poster is a small anchor rather than the whole composition.
 */
export default function LessonCard({
  lesson,
  showStatus = false,
}: {
  lesson: ContentSummary;
  showStatus?: boolean;
}) {
  return (
    <article className="group grid grid-cols-[7rem_1fr] gap-5 border-b border-rule py-6 first:border-t sm:grid-cols-[11rem_1fr]">
      <Link
        href={`/library/${lesson.id}`}
        className="block aspect-video overflow-hidden rounded-sm border border-rule bg-paper-deep"
        tabIndex={-1}
        aria-hidden="true"
      >
        <LessonPoster
          provider={lesson.videoProvider}
          title={lesson.title}
          thumbnailUrl={lesson.thumbnailUrl}
        />
      </Link>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h3 className="font-display text-lg font-semibold leading-snug tracking-tight">
            <Link
              href={`/library/${lesson.id}`}
              className="transition-colors hover:text-forest-deep"
            >
              {lesson.title}
            </Link>
          </h3>
          {showStatus ? (
            <span
              className={`rounded-xs px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] ${
                lesson.status === "published"
                  ? "bg-forest-soft text-forest-deep"
                  : lesson.status === "draft"
                    ? "bg-ochre-soft text-ochre"
                    : "bg-paper-deep text-ink-faint"
              }`}
            >
              {lesson.status}
            </span>
          ) : null}
        </div>

        <p className="line-clamp-2 text-sm leading-relaxed text-ink-soft">
          {lesson.description}
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-xs text-ink-faint">
          <span className="font-medium text-ink-soft">{lesson.author.name}</span>
          <span>{formatDate(lesson.createdAt)}</span>
          <span>{lesson.commentCount} comments</span>
          <span className="ml-auto flex items-center gap-2">
            <LikeButton
              contentId={lesson.id}
              likedByViewer={lesson.likedByViewer}
              likeCount={lesson.likeCount}
              size="sm"
            />
            <SaveButton
              contentId={lesson.id}
              savedByViewer={lesson.savedByViewer}
              size="sm"
            />
          </span>
        </div>
      </div>
    </article>
  );
}
