import { getAuthUserId } from "@convex-dev/auth/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { forbidden, notFound, unauthenticated } from "./errors";
import type { Role } from "./validators";

/**
 * Every Convex query/mutation receives a context that can resolve the
 * authenticated identity. Convex Auth stores the id of the `users` document in
 * the JWT subject, so `getAuthUserId` resolves straight to the application
 * profile — there is no separate "link account" table to keep in sync.
 */
export type AuthCtx = QueryCtx | MutationCtx;

/** The authenticated caller, as far as the backend is concerned. */
export type Viewer = {
  id: Id<"users">;
  role: Role;
  name: string;
  email: string | null;
  avatar: string | null;
};

const DEFAULT_DISPLAY_NAME = "NorthEd member";

/**
 * Resolve the current viewer, or `null` for an anonymous visitor.
 *
 * Never throws — use {@link requireViewer} for protected functions.
 */
export async function getViewer(ctx: AuthCtx): Promise<Viewer | null> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    return null;
  }

  const user = await ctx.db.get(userId as Id<"users">);
  if (user === null) {
    // The session points at a profile that has been removed.
    return null;
  }

  return {
    id: user._id,
    role: user.role ?? "user",
    name: user.name?.trim() || DEFAULT_DISPLAY_NAME,
    email: user.email ?? null,
    avatar: user.avatar ?? user.image ?? null,
  };
}

/** Require an authenticated caller. Throws `unauthenticated` otherwise. */
export async function requireViewer(ctx: AuthCtx): Promise<Viewer> {
  const viewer = await getViewer(ctx);
  if (viewer === null) {
    unauthenticated();
  }
  return viewer;
}

/** Require the caller to hold one of the given roles. */
export async function requireRole(
  ctx: AuthCtx,
  ...roles: Role[]
): Promise<Viewer> {
  const viewer = await requireViewer(ctx);
  if (!roles.includes(viewer.role)) {
    forbidden(
      `This action requires one of the following roles: ${roles.join(", ")}.`,
    );
  }
  return viewer;
}

/** Require a tutor (or an administrator). */
export function requireTutor(ctx: AuthCtx): Promise<Viewer> {
  return requireRole(ctx, "tutor", "admin");
}

/** Require an administrator. */
export function requireAdmin(ctx: AuthCtx): Promise<Viewer> {
  return requireRole(ctx, "admin");
}

/** True when the viewer may modify the given content record. */
export function canEditContent(
  viewer: Viewer | null,
  authorId: Id<"users">,
): boolean {
  if (viewer === null) {
    return false;
  }
  return viewer.role === "admin" || viewer.id === authorId;
}

/** True when the viewer may modify the given comment. */
export function canEditComment(
  viewer: Viewer | null,
  userId: Id<"users">,
): boolean {
  if (viewer === null) {
    return false;
  }
  return viewer.role === "admin" || viewer.id === userId;
}

/**
 * Load a content record and assert that the viewer is allowed to manage it.
 * Administrators may manage any content; tutors only their own.
 */
export async function requireOwnedContent(
  ctx: AuthCtx,
  contentId: Id<"contents">,
): Promise<{ viewer: Viewer; content: Doc<"contents"> }> {
  const viewer = await requireTutor(ctx);
  const content = await ctx.db.get(contentId);
  if (content === null) {
    notFound("That lesson does not exist.");
  }
  if (!canEditContent(viewer, content.authorId)) {
    forbidden("You can only manage your own lessons.");
  }
  return { viewer, content };
}
