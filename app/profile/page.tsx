"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Profile } from "@/convex/lib/validators";
import { toUserMessage } from "@/lib/errors";

export default function ProfilePage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const profile = useQuery(api.users.getMyProfile);

  const ensureMyProfile = useMutation(api.users.ensureMyProfile);
  const updateMyProfile = useMutation(api.users.updateMyProfile);

  // Backfill the NorthEd profile fields on the first visit.
  useEffect(() => {
    if (!isAuthenticated || profile === undefined) return;
    void ensureMyProfile().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, profile?.id]);

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-16">
        <p className="text-sm text-ink-faint">Checking session…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-16">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Sign in to manage your profile
        </h1>
        <Link href="/sign-in" className="button-primary mt-6">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12">
      <header className="mb-8 border-b border-rule-strong pb-5">
        <p className="eyebrow">Your account</p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">
          Profile
        </h1>
        <p className="mt-3 text-sm text-ink-soft">
          These are the details you control. Your email address and role are
          managed by NorthEd — ask an administrator if one of them needs to
          change.
        </p>
      </header>

      {profile == null ? (
        <p className="text-sm text-ink-faint">Loading your profile…</p>
      ) : (
        <>
          <div className="mb-8 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-sm border border-rule bg-surface px-5 py-4 text-sm">
            <span>
              <span className="block text-xs uppercase tracking-[0.14em] text-ink-faint">
                Email
              </span>
              <span className="font-medium text-ink">{profile.email ?? "—"}</span>
            </span>
            <span>
              <span className="block text-xs uppercase tracking-[0.14em] text-ink-faint">
                Role
              </span>
              <span className="font-medium capitalize text-ink">
                {profile.role}
              </span>
            </span>
          </div>

          <ProfileForm
            key={profile.id}
            profile={profile}
            updateMyProfile={updateMyProfile}
          />
        </>
      )}
    </div>
  );
}

/**
 * The editable part of the profile.
 *
 * It is mounted with a key derived from the profile id, so the fields start
 * from the stored values without an effect that writes state back.
 */
function ProfileForm({
  profile,
  updateMyProfile,
}: {
  profile: Profile;
  updateMyProfile: ReturnType<typeof useMutation<typeof api.users.updateMyProfile>>;
}) {
  const [name, setName] = useState(profile.name ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [gender, setGender] = useState(profile.gender ?? "");
  const [address, setAddress] = useState(profile.address ?? "");
  const [avatar, setAvatar] = useState(profile.avatar ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      await updateMyProfile({ name, phone, gender, address, avatar });
      setSaved(true);
    } catch (cause) {
      setError(toUserMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="profile-name" className="label">
          Name
        </label>
        <input
          id="profile-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          className="field mt-1.5"
        />
      </div>

      <div>
        <label htmlFor="profile-phone" className="label">
          Phone
        </label>
        <input
          id="profile-phone"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          maxLength={40}
          className="field mt-1.5"
        />
      </div>

      <div>
        <label htmlFor="profile-gender" className="label">
          Gender
        </label>
        <input
          id="profile-gender"
          value={gender}
          onChange={(event) => setGender(event.target.value)}
          maxLength={40}
          className="field mt-1.5"
        />
      </div>

      <div>
        <label htmlFor="profile-address" className="label">
          Address
        </label>
        <input
          id="profile-address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          maxLength={300}
          className="field mt-1.5"
        />
      </div>

      <div>
        <label htmlFor="profile-avatar" className="label">
          Avatar link
        </label>
        <input
          id="profile-avatar"
          value={avatar}
          onChange={(event) => setAvatar(event.target.value)}
          placeholder="https://…/avatar.jpg"
          className="field mt-1.5"
        />
      </div>

      <div className="flex items-center gap-4 pt-2">
        <button type="submit" className="button-primary" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        {saved ? (
          <span className="text-sm text-forest-deep">Saved.</span>
        ) : null}
        {error ? (
          <span role="alert" className="text-sm text-sienna">
            {error}
          </span>
        ) : null}
      </div>
    </form>
  );
}
