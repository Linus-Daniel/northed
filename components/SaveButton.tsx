"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { BookmarkIcon } from "./icons";
import { toUserMessage } from "@/lib/errors";

/**
 * Save a lesson for later.
 *
 * Anonymous visitors are sent to the sign-in page; the server rejects the
 * mutation either way.
 */
export default function SaveButton({
  contentId,
  savedByViewer,
  size = "md",
}: {
  contentId: Id<"contents">;
  savedByViewer: boolean;
  size?: "sm" | "md";
}) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const save = useMutation(api.savedContents.saveContent);
  const unsave = useMutation(api.savedContents.unsaveContent);
  const [saved, setSaved] = useState(savedByViewer);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (savedByViewer !== saved && !pending) {
    setSaved(savedByViewer);
  }

  const dimension = size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm";

  if (!isLoading && !isAuthenticated) {
    return (
      <Link
        href="/sign-in"
        className={`inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface font-medium text-ink-soft transition-colors hover:border-forest/50 hover:text-forest-deep ${dimension}`}
      >
        <BookmarkIcon />
        <span className="sr-only">Sign in to save this lesson</span>
      </Link>
    );
  }

  const toggle = () => {
    setError(null);
    const next = !saved;
    setSaved(next);

    startTransition(async () => {
      try {
        await (next ? save({ contentId }) : unsave({ contentId }));
      } catch (cause) {
        setSaved(!next);
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
        aria-pressed={saved}
        className={`inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors disabled:opacity-60 ${dimension} ${
          saved
            ? "border-forest/50 bg-forest-soft text-forest-deep"
            : "border-rule bg-surface text-ink-soft hover:border-forest/50 hover:text-forest-deep"
        }`}
      >
        <BookmarkIcon filled={saved} />
        <span>{saved ? "Saved" : "Save"}</span>
      </button>
      {error ? (
        <span role="alert" className="text-xs text-sienna">
          {error}
        </span>
      ) : null}
    </span>
  );
}
