"use client";

import { usePaginatedQuery } from "convex/react";
import { useDeferredValue, useState } from "react";
import { api } from "@/convex/_generated/api";
import LessonCard from "./LessonCard";
import { SearchIcon } from "./icons";

/**
 * The published lesson feed.
 *
 * Both the feed and the search hit the same index-backed queries on the
 * server, so the browser never sees unpublished lessons.
 */
export default function Feed() {
  const [searchTerm, setSearchTerm] = useState("");
  const deferredTerm = useDeferredValue(searchTerm);
  const trimmed = deferredTerm.trim();

  const feed = usePaginatedQuery(
    api.contents.listPublished,
    {},
    { initialNumItems: 8 },
  );

  const search = usePaginatedQuery(
    api.contents.searchContents,
    trimmed.length > 0 ? { searchTerm: trimmed } : "skip",
    { initialNumItems: 8 },
  );

  const searching = trimmed.length > 0;
  const source = searching ? search : feed;
  const lessons = source.results;

  return (
    <div>
      <div className="relative mb-2 max-w-md">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-ink-faint" />
        <label htmlFor="lesson-search" className="sr-only">
          Search lessons by title
        </label>
        <input
          id="lesson-search"
          type="search"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search lessons by title"
          className="field pl-9"
        />
      </div>

      <p className="mb-6 text-xs uppercase tracking-[0.16em] text-ink-faint">
        {searching
          ? `${lessons.length} result${lessons.length === 1 ? "" : "s"} for "${trimmed}"`
          : "Newest first"}
      </p>

      {source.status === "LoadingFirstPage" ? (
        <div className="space-y-4" aria-live="polite">
          <p className="text-sm text-ink-faint">Loading lessons…</p>
        </div>
      ) : lessons.length === 0 ? (
        <p className="rounded-sm border border-rule bg-surface px-4 py-6 text-sm text-ink-soft">
          {searching
            ? "No lesson matches that title yet. Try a different word."
            : "No lessons have been published yet."}
        </p>
      ) : (
        <div>
          {lessons.map((lesson) => (
            <LessonCard key={lesson.id} lesson={lesson} />
          ))}
        </div>
      )}

      {source.status === "CanLoadMore" ? (
        <button
          type="button"
          className="button-secondary mt-8"
          onClick={() => source.loadMore(8)}
        >
          Load more
        </button>
      ) : null}
    </div>
  );
}
