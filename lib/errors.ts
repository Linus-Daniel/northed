/**
 * Turns whatever a Convex call threw into a sentence the interface can show.
 *
 * The backend answers a failed call with a `{ code, message }` payload (see
 * `convex/lib/errors.ts`). On the client that payload arrives as the `data` of
 * a `ConvexError`, while the error's own `message` is the raw
 * "Server Error / Uncaught ConvexError: {...}" text. The payload's message is
 * the one written for a person, so it wins.
 *
 * Convex Auth failures arrive as `ConvexAuthError`, whose data carries its own
 * `message`; those are handled by the same rule.
 */
export function toUserMessage(
  cause: unknown,
  fallback = "That did not work.",
): string {
  const fromPayload = messageFromData(cause);
  if (fromPayload !== null) {
    return fromPayload;
  }

  if (cause instanceof Error) {
    // Convex wraps the payload in the message when the data is not plain.
    const wrapped = cause.message.match(/ConvexError:\s*(\{[\s\S]*\})\s*$/);
    if (wrapped !== null) {
      try {
        const parsed = JSON.parse(wrapped[1]) as { message?: unknown };
        if (typeof parsed.message === "string" && parsed.message.length > 0) {
          return parsed.message;
        }
      } catch {
        // Not JSON. Fall through to the raw message.
      }
    }
    if (cause.message.length > 0) {
      return cause.message;
    }
  }

  return fallback;
}

/** The `message` inside an error's `data`, when there is one. */
function messageFromData(cause: unknown): string | null {
  if (typeof cause !== "object" || cause === null) {
    return null;
  }
  const data = (cause as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const message = (data as { message?: unknown }).message;
  if (typeof message === "string" && message.length > 0) {
    return message;
  }
  return null;
}
