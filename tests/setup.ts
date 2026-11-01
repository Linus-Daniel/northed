import { defineTestApp } from "convex-test";
import schema from "../convex/schema";
import * as admin from "../convex/admin";
import * as comments from "../convex/comments";
import * as contents from "../convex/contents";
import * as likes from "../convex/likes";
import * as savedContents from "../convex/savedContents";
import * as storage from "../convex/storage";
import * as users from "../convex/users";
import type { Id } from "../convex/_generated/dataModel";

/**
 * Test application.
 *
 * The modules are the real ones, imported eagerly, so the tests exercise the
 * same function definitions that ship to the Convex deployment. `convex-test`
 * resolves a function reference (`api.contents.listPublished`) by its module
 * path, so the keys below are the module paths inside `convex/`.
 */
export const app = defineTestApp({ schema });

export const { api, internal, createTest } = app.defineModules({
  admin,
  comments,
  contents,
  likes,
  savedContents,
  storage,
  users,
});

export type Test = ReturnType<typeof createTest>;

/** A user row as NorthEd stores it. */
export type SeedUser = {
  id: Id<"users">;
  role: "user" | "tutor" | "admin";
};

/**
 * Insert a user document directly, the way Convex Auth would after sign up.
 */
export async function seedUser(
  t: Test,
  fields: {
    name?: string;
    email?: string;
    role?: "user" | "tutor" | "admin";
  } = {},
): Promise<SeedUser> {
  const role = fields.role ?? "user";
  const id = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      name: fields.name ?? "Test Person",
      email: fields.email ?? `${crypto.randomUUID()}@example.com`,
      role,
    });
  });
  return { id, role };
}

/**
 * Act as the given user.
 *
 * Convex Auth stores the `users` document id in the JWT subject, and
 * `getAuthUserId` splits that subject on "|", so a bare document id is enough
 * to simulate a signed in session.
 */
export function asUser(t: Test, userId: Id<"users">) {
  return t.withIdentity({ subject: userId });
}
