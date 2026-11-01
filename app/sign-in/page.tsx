"use client";

import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toUserMessage } from "@/lib/errors";

type Mode = "signIn" | "signUp";

export default function SignInPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn } = useAuthActions();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isLoading && isAuthenticated) {
    return (
      <div className="mx-auto w-full max-w-md px-5 py-20 text-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          You are signed in
        </h1>
        <Link href="/" className="button-primary mt-6">
          Browse the library
        </Link>
      </div>
    );
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn("password", {
        flow: mode,
        email,
        password,
        ...(mode === "signUp" && name.length > 0 ? { name } : {}),
      });
      router.push("/");
    } catch (cause) {
      setError(toUserMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md px-5 py-16">
      <header className="mb-8 text-center">
        <p className="eyebrow">NorthEd account</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
          {mode === "signIn" ? "Welcome back" : "Create an account"}
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          {mode === "signIn"
            ? "Sign in to like lessons, save them and join the discussion."
            : "An account lets you like lessons, save them and join the discussion."}
        </p>
      </header>

      <form onSubmit={submit} className="space-y-4">
        {mode === "signUp" ? (
          <div>
            <label htmlFor="signin-name" className="label">
              Name
            </label>
            <input
              id="signin-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              className="field mt-1.5"
            />
          </div>
        ) : null}

        <div>
          <label htmlFor="signin-email" className="label">
            Email
          </label>
          <input
            id="signin-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            className="field mt-1.5"
          />
        </div>

        <div>
          <label htmlFor="signin-password" className="label">
            Password
          </label>
          <input
            id="signin-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
            autoComplete={
              mode === "signIn" ? "current-password" : "new-password"
            }
            className="field mt-1.5"
          />
          {mode === "signUp" ? (
            <p className="mt-1.5 text-xs text-ink-faint">
              At least 8 characters. Your password is hashed before it is
              stored — NorthEd never keeps the plain text.
            </p>
          ) : null}
        </div>

        <button type="submit" className="button-primary w-full" disabled={busy}>
          {busy
            ? "Working…"
            : mode === "signIn"
              ? "Sign in"
              : "Create account"}
        </button>

        {error ? (
          <p role="alert" className="text-sm text-sienna">
            {error}
          </p>
        ) : null}
      </form>

      <p className="mt-6 text-center text-sm text-ink-soft">
        {mode === "signIn" ? "No account yet?" : "Already have an account?"}{" "}
        <button
          type="button"
          className="font-medium text-forest-deep underline"
          onClick={() => {
            setMode(mode === "signIn" ? "signUp" : "signIn");
            setError(null);
          }}
        >
          {mode === "signIn" ? "Create one" : "Sign in"}
        </button>
      </p>
    </div>
  );
}
