"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, usePaginatedQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CheckIcon, PencilIcon, TrashIcon } from "./icons";
import { toUserMessage } from "@/lib/errors";

const MAX_COMMENT_LENGTH = 2000;

function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(timestamp).toLocaleDateString();
}

/**
 * Discussion thread for a lesson.
 *
 * Read and write rights come from the server: the API returns `canEdit` and
 * `canDelete` per comment, so the UI only reflects what the backend allows.
 */
export default function CommentSection({ contentId }: { contentId: Id<"contents"> }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const [commentText, setCommentText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const comments = usePaginatedQuery(
    api.comments.listComments,
    { contentId },
    { initialNumItems: 10 },
  );

  const addComment = useMutation(api.comments.addComment);
  const editComment = useMutation(api.comments.editComment);
  const deleteComment = useMutation(api.comments.deleteComment);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = commentText.trim();
    if (text.length === 0) return;
    setError(null);
    setPending(true);
    try {
      await addComment({ contentId, text });
      setCommentText("");
    } catch (cause) {
      setError(toUserMessage(cause));
    } finally {
      setPending(false);
    }
  };

  const saveEdit = async (commentId: Id<"comments">) => {
    const text = editingText.trim();
    if (text.length === 0) {
      setError("A comment cannot be empty.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      await editComment({ commentId, text });
      setEditingId(null);
    } catch (cause) {
      setError(toUserMessage(cause));
    } finally {
      setPending(false);
    }
  };

  const remove = async (commentId: Id<"comments">) => {
    setError(null);
    setPending(true);
    try {
      await deleteComment({ commentId });
      if (editingId === commentId) setEditingId(null);
    } catch (cause) {
      setError(toUserMessage(cause));
    } finally {
      setPending(false);
    }
  };

  return (
    <section aria-labelledby="discussion-heading" className="mt-14">
      <h2
        id="discussion-heading"
        className="font-display text-2xl font-semibold tracking-tight"
      >
        Discussion
      </h2>

      {isLoading ? (
        <p className="mt-4 text-sm text-ink-faint">Checking session…</p>
      ) : isAuthenticated ? (
        <form onSubmit={submit} className="mt-5">
          <label htmlFor="comment-body" className="label">
            Add a comment
          </label>
          <textarea
            id="comment-body"
            name="comment"
            rows={3}
            maxLength={MAX_COMMENT_LENGTH}
            value={commentText}
            onChange={(event) => setCommentText(event.target.value)}
            placeholder="Ask a question or share what you took from this lesson."
            className="field resize-y"
          />
          <div className="mt-3 flex items-center gap-3">
            <button type="submit" className="button-primary" disabled={pending}>
              {pending ? "Posting…" : "Post comment"}
            </button>
            {commentText.length > 0 ? (
              <span className="text-xs text-ink-faint">
                {commentText.length}/{MAX_COMMENT_LENGTH}
              </span>
            ) : null}
          </div>
        </form>
      ) : (
        <p className="mt-5 rounded-sm border border-rule bg-surface px-4 py-3 text-sm text-ink-soft">
          <Link href="/sign-in" className="font-medium text-forest-deep underline">
            Sign in
          </Link>{" "}
          to join the discussion.
        </p>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-sienna">
          {error}
        </p>
      ) : null}

      <ul className="mt-8 divide-y divide-rule border-t border-rule">
        {comments.results.map((comment) => (
          <li key={comment.id} className="py-5">
            <div className="flex items-baseline gap-2.5">
              <span className="font-medium text-ink">{comment.author.name}</span>
              {comment.author.role !== "user" ? (
                <span className="rounded-xs bg-forest-soft px-1.5 py-0.5 text-[0.65rem] uppercase tracking-[0.12em] text-forest-deep">
                  {comment.author.role}
                </span>
              ) : null}
              <span className="text-xs text-ink-faint">
                {relativeTime(comment.createdAt)}
              </span>
              {comment.updatedAt !== null ? (
                <span className="text-xs text-ink-faint">· edited</span>
              ) : null}
            </div>

            {editingId === comment.id ? (
              <div className="mt-2.5">
                <textarea
                  rows={3}
                  maxLength={MAX_COMMENT_LENGTH}
                  value={editingText}
                  onChange={(event) => setEditingText(event.target.value)}
                  aria-label="Edit comment"
                  className="field resize-y"
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    className="button-primary"
                    disabled={pending}
                    onClick={() => void saveEdit(comment.id)}
                  >
                    <CheckIcon /> Save
                  </button>
                  <button
                    type="button"
                    className="button-ghost"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-2 whitespace-pre-wrap text-[0.95rem] leading-relaxed text-ink-soft">
                {comment.text}
              </p>
            )}

            {comment.canEdit && editingId !== comment.id ? (
              <div className="mt-2.5 flex items-center gap-3">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-forest-deep"
                  onClick={() => {
                    setEditingId(comment.id);
                    setEditingText(comment.text);
                  }}
                >
                  <PencilIcon /> Edit
                </button>
                {comment.canDelete ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-sienna"
                    onClick={() => void remove(comment.id)}
                  >
                    <TrashIcon /> Delete
                  </button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {comments.status === "LoadingFirstPage" ? (
        <p className="mt-6 text-sm text-ink-faint">Loading comments…</p>
      ) : null}

      {comments.status === "CanLoadMore" ? (
        <button
          type="button"
          className="button-secondary mt-6"
          onClick={() => comments.loadMore(10)}
        >
          Load more comments
        </button>
      ) : null}

      {comments.status !== "LoadingFirstPage" &&
      comments.results.length === 0 ? (
        <p className="mt-6 text-sm text-ink-faint">
          No comments yet. Start the conversation.
        </p>
      ) : null}
    </section>
  );
}
