import { mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { getViewer, requireAdmin, requireViewer } from "./lib/auth";
import { invalidInput, notFound } from "./lib/errors";
import { toPublicUser } from "./lib/content";
import {
  profileValidator,
  publicUserValidator,
  roleValidator,
} from "./lib/validators";

const MAX_NAME_LENGTH = 80;
const MAX_PHONE_LENGTH = 32;
const MAX_ADDRESS_LENGTH = 240;
const MAX_AVATAR_LENGTH = 2048;

/** Turn a user document into the profile returned to its owner. */
function toProfile(user: Doc<"users">) {
  return {
    id: user._id,
    name: user.name ?? null,
    email: user.email ?? null,
    phone: user.phone ?? null,
    gender: user.gender ?? null,
    address: user.address ?? null,
    avatar: user.avatar ?? user.image ?? null,
    role: user.role ?? ("user" as const),
    createdAt: user._creationTime,
  };
}

/**
 * The signed-in user's own profile.
 *
 * Returns `null` for anonymous visitors rather than throwing, so the UI can
 * render its signed-out state without special casing errors.
 */
export const getMyProfile = query({
  args: {},
  returns: v.nullable(profileValidator),
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (viewer === null) {
      return null;
    }
    const user = await ctx.db.get(viewer.id);
    if (user === null) {
      return null;
    }
    return toProfile(user);
  },
});

/**
 * The public profile of any user.
 *
 * Only the display name, avatar and role are exposed — never the email,
 * phone number or address.
 */
export const getPublicUser = query({
  args: { userId: v.id("users") },
  returns: v.nullable(publicUserValidator),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (user === null) {
      return null;
    }
    return toPublicUser(user);
  },
});

/** Every tutor (and administrator) that publishes content. */
export const listTutors = query({
  args: {},
  returns: v.array(publicUserValidator),
  handler: async (ctx) => {
    const tutors = await ctx.db
      .query("users")
      .withIndex("role", (q) => q.eq("role", "tutor"))
      .collect();
    const admins = await ctx.db
      .query("users")
      .withIndex("role", (q) => q.eq("role", "admin"))
      .collect();

    return [...tutors, ...admins].map(toPublicUser);
  },
});

/**
 * Make sure the authenticated identity has a complete NorthEd profile.
 *
 * Convex Auth creates the `users` document when the person signs up; this
 * mutation backfills the NorthEd specific bits (default role, display name,
 * email taken from the verified identity) without ever escalating privileges.
 * It is idempotent, so the client may call it on every sign in.
 */
export const ensureMyProfile = mutation({
  args: {},
  returns: profileValidator,
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    const user = await ctx.db.get(viewer.id);
    if (user === null) {
      throw notFound("Your profile could not be found.");
    }

    const patch: Partial<Doc<"users">> = {};

    // Only ever *lower* the privilege: a missing role becomes "user".
    if (user.role === undefined) {
      patch.role = "user";
    }
    if (!user.name && user.email) {
      patch.name = user.email.split("@")[0];
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(viewer.id, patch);
    }

    const updated = await ctx.db.get(viewer.id);
    if (updated === null) {
      throw notFound("Your profile could not be found.");
    }
    return toProfile(updated);
  },
});

/**
 * Update the editable parts of your own profile.
 *
 * `role` and `email` are deliberately not accepted: the role is an
 * administrator decision and the email is owned by the authentication
 * provider. Only the fields listed below can be changed here.
 */
export const updateMyProfile = mutation({
  args: {
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    gender: v.optional(v.string()),
    address: v.optional(v.string()),
    avatar: v.optional(v.string()),
  },
  returns: profileValidator,
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);

    const patch: Partial<Doc<"users">> = {};

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
        throw invalidInput(
          `Your name must be between 1 and ${MAX_NAME_LENGTH} characters.`,
        );
      }
      patch.name = name;
    }

    if (args.phone !== undefined) {
      const phone = args.phone.trim();
      if (phone.length > MAX_PHONE_LENGTH) {
        throw invalidInput(
          `Your phone number must be at most ${MAX_PHONE_LENGTH} characters.`,
        );
      }
      patch.phone = phone.length === 0 ? undefined : phone;
    }

    if (args.gender !== undefined) {
      const gender = args.gender.trim();
      if (gender.length > MAX_PHONE_LENGTH) {
        throw invalidInput("That gender value is too long.");
      }
      patch.gender = gender.length === 0 ? undefined : gender;
    }

    if (args.address !== undefined) {
      const address = args.address.trim();
      if (address.length > MAX_ADDRESS_LENGTH) {
        throw invalidInput(
          `Your address must be at most ${MAX_ADDRESS_LENGTH} characters.`,
        );
      }
      patch.address = address.length === 0 ? undefined : address;
    }

    if (args.avatar !== undefined) {
      const avatar = args.avatar.trim();
      if (avatar.length > MAX_AVATAR_LENGTH) {
        throw invalidInput("That avatar URL is too long.");
      }
      if (avatar.length > 0) {
        let parsed: URL;
        try {
          parsed = new URL(avatar);
        } catch {
          throw invalidInput("Your avatar must be a valid URL.");
        }
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
          throw invalidInput("Your avatar must be an http(s) URL.");
        }
      }
      patch.avatar = avatar.length === 0 ? undefined : avatar;
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(viewer.id, patch);
    }

    const updated = await ctx.db.get(viewer.id);
    if (updated === null) {
      throw notFound("Your profile could not be found.");
    }
    return toProfile(updated);
  },
});

/**
 * Promote or demote a user.
 *
 * Administrator only. This is the single place where the `role` field is
 * written, which is what keeps "users cannot assign themselves the tutor or
 * admin role" true by construction.
 */
export const setUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: roleValidator,
  },
  returns: profileValidator,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const user = await ctx.db.get(args.userId);
    if (user === null) {
      throw notFound("That user does not exist.");
    }

    await ctx.db.patch(args.userId, { role: args.role });

    const updated = await ctx.db.get(args.userId);
    if (updated === null) {
      throw notFound("That user does not exist.");
    }
    return toProfile(updated);
  },
});

/** All users, paginated. Administrator only. */
export const listUsers = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(profileValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const result = await ctx.db.query("users").paginate(args.paginationOpts);
    return {
      page: result.page.map(toProfile),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

/**
 * Look a user up by email address.
 *
 * Used by the sign-in flow to check whether an address is already taken.
 * Administrators only, because email addresses are personal data.
 */
export const findUserByEmail = query({
  args: { email: v.string() },
  returns: v.nullable(v.id("users")),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const email = args.email.trim().toLowerCase();
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    return user?._id ?? null;
  },
});
