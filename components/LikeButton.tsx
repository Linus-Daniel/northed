"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { HeartIcon } from "./icons";
import { toUserMessage } from "@/lib/errors";

/**
 * Like / unlike a lesson.
 *
 * The button is only a convenience — the server is the authority. It reflects
 * `likedByViewer` and `likeCount` that the server computed for the current
 * viewer, so a like registered on another device appears here without a
 * refresh.
 */
export default function LikeButton({
  contentId,
  likedByViewer,
  likeCount,
  size = "md",
}: {
  contentId: Id<"contents">;
  likedByViewer: boolean;
  likeCount: number;
  size?: "sm" | "md";
}) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const like = useMutation(api.likes.likeContent);
  const unlike = useMutation(api.likes.unlikeContent);
  const [pending, startTransition] = useTransition();

  const [liked, setLiked] = useState(likedByViewer);
  const [count, setCount] = useState(likeCount);
  const [error, setError] = useState<string | null>(null);

  // The server is the source of truth: resync whenever it sends new numbers.
  if (likedByViewer !== liked && !pending) {
    setLiked(likedByViewer);
    setCount(likeCount);
  } else if (likeCount !== count && !pending) {
    setCount(likeCount);
  }

  const dimension = size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm";

  if (!isLoading && !isAuthenticated) {
    return (
      <Link
        href="/sign-in"
        className={`inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface font-medium text-ink-soft transition-colors hover:border-sienna/50 hover:text-sienna ${dimension}`}
      >
        <HeartIcon />
        <span>{count}</span>
        <span className="sr-only">Sign in to like this lesson</span>
      </Link>
    );
  }

  const toggle = () => {
    setError(null);
    const next = !liked;
    // Optimistic: reflect the intent immediately, reconcile with the server.
    setLiked(next);
    setCount((current) => Math.max(0, current + (next ? 1 : -1)));

    startTransition(async () => {
      try {
        const serverCount = next
          ? await like({ contentId })
          : await unlike({ contentId });
        setCount(serverCount);
      } catch (cause) {
        setLiked(!next);
        setCount((current) => Math.max(0, current + (next ? -1 : 1)));
        setError(toUserMessage(cause));
      }
    });
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={liked}
        className={`inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors disabled:opacity-60 ${dimension} ${
          liked
            ? "border-sienna/60 bg-sienna-soft text-sienna"
            : "border-rule bg-surface text-ink-soft hover:border-sienna/50 hover:text-sienna"
        }`}
      >
        <HeartIcon filled={liked} />
        <span>{count}</span>
        <span className="sr-only">{liked ? "Unlike" : "Like"} this lesson</span>
      </button>
      {error ? (
        <span role="alert" className="text-xs text-sienna">
          {error}
        </span>
      ) : null}
    </span>
  );
}
