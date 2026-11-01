"use client";

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { type ReactNode } from "react";

/**
 * The Convex deployment URL is inlined at build time by Next.js.
 *
 * When it is missing we still render the app shell, but every data view is
 * replaced by an explanation instead of a confusing connection error.
 */
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

const convex = new ConvexReactClient(
  convexUrl ?? "https://not-configured.invalid",
  { unsavedChangesWarning: false },
);

export default function ConvexClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  if (!convexUrl) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-5 py-24">
        <div className="border-l-2 border-sienna pl-6">
          <p className="eyebrow">Not connected yet</p>
          <h1 className="mt-2 text-3xl">NorthEd needs a Convex deployment</h1>
          <p className="prose-note mt-3">
            Set <code className="font-medium text-ink">NEXT_PUBLIC_CONVEX_URL</code>{" "}
            in <code className="font-medium text-ink">.env.local</code> and restart
            the dev server. Running <code className="font-medium text-ink">npx convex dev</code>{" "}
            creates a deployment and writes the value for you.
          </p>
        </div>
      </div>
    );
  }

  return <ConvexAuthProvider client={convex}>{children}</ConvexAuthProvider>;
}
