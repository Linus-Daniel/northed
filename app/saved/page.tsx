"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { usePaginatedQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import LessonCard from "@/components/LessonCard";

export default function SavedPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const saved = usePaginatedQuery(
    api.savedContents.listSavedContents,
    {},
    { initialNumItems: 10 },
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-12">
      <header className="mb-8 border-b border-rule-strong pb-5">
        <p className="eyebrow">Your shelf</p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">
          Saved lessons
        </h1>
      </header>

      {isLoading ? (
        <p className="text-sm text-ink-faint">Checking session…</p>
      ) : !isAuthenticated ? (
        <p className="rounded-sm border border-rule bg-surface px-4 py-6 text-sm text-ink-soft">
          <Link href="/sign-in" className="font-medium text-forest-deep underline">
            Sign in
          </Link>{" "}
          to keep a list of the lessons you want to come back to.
        </p>
      ) : saved.status === "LoadingFirstPage" ? (
        <p className="text-sm text-ink-faint">Loading your saved lessons…</p>
      ) : saved.results.length === 0 ? (
        <div className="rounded-sm border border-dashed border-rule-strong px-6 py-12 text-center">
          <p className="font-display text-xl font-semibold tracking-tight">
            Nothing saved yet
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
            Browse the library and press Save on anything worth returning to.
          </p>
          <Link href="/" className="button-secondary mt-6">
            Browse the library
          </Link>
        </div>
      ) : (
        <div>
          {saved.results.map((lesson) => (
            <LessonCard key={lesson.id} lesson={lesson} />
          ))}
        </div>
      )}

      {saved.status === "CanLoadMore" ? (
        <button
          type="button"
          className="button-secondary mt-8"
          onClick={() => saved.loadMore(10)}
        >
          Load more
        </button>
      ) : null}
    </div>
  );
}
