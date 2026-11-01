"use client";

import { useConvexAuth, useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/convex/_generated/api";

const links = [
  { href: "/", label: "Library" },
  { href: "/saved", label: "Saved" },
];

export default function TopNav() {
  const pathname = usePathname();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const profile = useQuery(api.users.getMyProfile);

  const canPublish = profile?.role === "tutor" || profile?.role === "admin";

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/85 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-5 py-3.5">
        <Link
          href="/"
          className="font-display text-xl font-semibold tracking-tight text-ink"
        >
          North
          <span className="italic text-sienna">Ed</span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          {links.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-xs px-2.5 py-1.5 transition-colors ${
                  active
                    ? "bg-forest-soft font-medium text-forest-deep"
                    : "text-ink-soft hover:bg-paper-deep hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          {canPublish ? (
            <Link
              href="/studio"
              aria-current={pathname.startsWith("/studio") ? "page" : undefined}
              className={`rounded-xs px-2.5 py-1.5 transition-colors ${
                pathname.startsWith("/studio")
                  ? "bg-forest-soft font-medium text-forest-deep"
                  : "text-ink-soft hover:bg-paper-deep hover:text-ink"
              }`}
            >
              Studio
            </Link>
          ) : null}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {isLoading ? (
            <span className="text-xs text-ink-faint">Checking session…</span>
          ) : isAuthenticated && profile ? (
            <>
              <Link
                href="/profile"
                className="flex items-center gap-2 text-sm text-ink-soft transition-colors hover:text-ink"
              >
                <span
                  className="grid h-8 w-8 place-items-center overflow-hidden rounded-full border border-rule-strong bg-forest-soft text-xs font-semibold uppercase text-forest-deep"
                  aria-hidden="true"
                >
                  {profile.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.avatar}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    profile.name?.slice(0, 1) ?? "?"
                  )}
                </span>
                <span className="hidden sm:inline">{profile.name}</span>
              </Link>
              <button
                type="button"
                className="button-ghost"
                onClick={() => void signOut()}
              >
                Sign out
              </button>
            </>
          ) : (
            <Link href="/sign-in" className="button-primary">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
