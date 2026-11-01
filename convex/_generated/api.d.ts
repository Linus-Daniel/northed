/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as comments from "../comments.js";
import type * as contents from "../contents.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_content from "../lib/content.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_uploads from "../lib/uploads.js";
import type * as lib_validators from "../lib/validators.js";
import type * as likes from "../likes.js";
import type * as savedContents from "../savedContents.js";
import type * as storage from "../storage.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  auth: typeof auth;
  comments: typeof comments;
  contents: typeof contents;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/content": typeof lib_content;
  "lib/errors": typeof lib_errors;
  "lib/uploads": typeof lib_uploads;
  "lib/validators": typeof lib_validators;
  likes: typeof likes;
  savedContents: typeof savedContents;
  storage: typeof storage;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
