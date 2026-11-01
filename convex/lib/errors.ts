import { ConvexError } from "convex/values";

/**
 * Machine readable error codes. The frontend switches on `code` instead of
 * matching on message strings, so copy can change without breaking the UI.
 */
export type AppErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "invalid_input"
  | "conflict";

export type AppErrorData = {
  code: AppErrorCode;
  message: string;
};

export function appError(code: AppErrorCode, message: string): ConvexError<AppErrorData> {
  return new ConvexError({ code, message });
}

export function unauthenticated(
  message = "You need to sign in to do that.",
): never {
  throw appError("unauthenticated", message);
}

export function forbidden(
  message = "You do not have permission to do that.",
): never {
  throw appError("forbidden", message);
}

export function notFound(message = "That record does not exist."): never {
  throw appError("not_found", message);
}

export function invalidInput(message: string): never {
  throw appError("invalid_input", message);
}

export function conflict(message: string): never {
  throw appError("conflict", message);
}
