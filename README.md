# NorthEd

A Convex backend for an educational video library: tutors upload lessons,
students watch, like, comment and save them.

The backend is a single Convex deployment. There is no other server and no
other database.

- **Backend**: Convex (TypeScript, `convex/`)
- **Frontend**: Next.js App Router + React 19 + Tailwind CSS v4 (`app/`, `components/`)
- **Authentication**: Convex Auth with the e-mail + password provider

---

## Quick start

```bash
npm install

# 1. Log in to Convex (interactive, opens a browser)
npx convex login

# 2. Create a dev deployment and start the local Convex backend.
#    This writes CONVEX_DEPLOYMENT and NEXT_PUBLIC_CONVEX_URL into .env.local
#    and generates convex/_generated/*.
npx convex dev

# 3. In a second terminal, set the Convex Auth signing keys on the deployment
npm run auth:keys

# 4. Start the Next.js app
npm run dev
```

`npx convex dev` keeps running in the foreground. It watches `convex/`, pushes
every change to the deployment and regenerates the typed API. Leave it open
while you work.

---

## Environment variables

### The Next.js app (`.env.local`)

| Variable | Used by | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_CONVEX_URL` | the browser client | Written by `npx convex dev`. |
| `CONVEX_DEPLOYMENT` | the Convex CLI | Written by `npx convex dev`. |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | the app | The deployment's site URL. Written by `npx convex dev`. |
| `CONVEX_SITE_URL` | Convex Auth | A system variable that is always available inside Convex functions. Nothing to set. |
| `NEXT_PUBLIC_SITE_URL` | the app | Absolute links and redirects. Defaults to `http://localhost:3000`. |

Copy `.env.example` to `.env.local` to see the list. The real `.env.local` is
git-ignored and is never overwritten by the tooling in this repository.

### The Convex deployment

| Variable | Used by | Notes |
| --- | --- | --- |
| `JWT_PRIVATE_KEY` | Convex Auth | RS256 private key (PKCS#8). |
| `JWKS` | Convex Auth | The matching public key set. |

These two live in the **deployment's** environment, not in `.env.local`.
`npm run auth:keys` generates them and installs them without putting them in
your shell history. `npm run auth:keys:prod` does the same for production.

The private key is never printed, never written to a tracked file, and never
sent to the browser.

---

## Data model

Defined in `convex/schema.ts`. The Convex Auth tables (`authAccounts`,
`authSessions`, `authRefreshTokens`, `authVerificationCodes`,
`authVerifiers`, `authRateLimits`) come from `authTables`; the `users` table is
overridden so that the Convex Auth document *is* the NorthEd profile.

### `users`

| Field | Type | Notes |
| --- | --- | --- |
| `name` | `string?` | Display name. |
| `email` | `string?` | Owned by the auth provider. |
| `phone` | `string?` | Editable by the owner. |
| `gender` | `string?` | Editable by the owner. |
| `address` | `string?` | Editable by the owner. |
| `avatar` | `string?` | Must be an http(s) URL. Falls back to `image`. |
| `role` | `"user" \| "tutor" \| "admin"` | **Only an administrator can write this.** |
| `image`, `emailVerificationTime`, `phoneVerificationTime`, `isAnonymous` | | Standard Convex Auth fields. |

Indexes: `email`, `phone`, `role`.

### `contents`

| Field | Type | Notes |
| --- | --- | --- |
| `title` | `string` | 3–120 characters. |
| `description` | `string` | Up to 2000 characters. |
| `authorId` | `id("users")` | The tutor who uploaded it. |
| `videoUrl` | `string?` | A link to a video hosted elsewhere. See *Video* below. |
| `videoStorageId` | `Id<"_storage">?` | A video the tutor uploaded. Exactly one of `videoUrl` and `videoStorageId` is set. |
| `thumbnailUrl` | `string?` | http(s) URL. |
| `thumbnailStorageId` | `Id<"_storage">?` | A thumbnail the tutor uploaded. |
| `status` | `"draft" \| "published" \| "archived"` | |
| `likeCount`, `commentCount` | `number` | Denormalized counters. |
| `updatedAt` | `number?` | Set on every edit. |

Indexes: `author`, `status`, `status_author`, `video_storage`,
`thumbnail_storage`.
Search index: `title_search` (searches `title`, filtered by `status`).

Convex appends `_creationTime` to every index, so these already order by
creation time within each key. `_creationTime` must not be named in an index
definition — the deployment rejects the schema if it is.

### `uploads`

`storageId`, `ownerId`, `kind` (`"video"` or `"image"`), `contentType`,
`size`. Indexes: `storage`, `owner`.

One row per file the tutor uploaded. It is what ties a file to the tutor who
uploaded it, so a lesson can only point at a file its own author uploaded.

### `likes`

`contentId`, `userId`. Indexes: `content`, `user`, `content_user`.
The `content_user` index makes the duplicate check a single point lookup.

### `comments`

`contentId`, `userId`, `text`, `updatedAt?`. Indexes: `content`, `user`.

### `savedContents`

`contentId`, `userId`. Indexes: `content`, `user`, `content_user`.

---

## Functions

Every function lives in `convex/` and is reachable as `api.<module>.<name>`.

**[`docs/API.md`](docs/API.md) is the endpoint reference.** It covers every
public function, the raw HTTP contract for clients that do not use the Convex
SDK, the authentication flow, the error codes, the upload sequence and the
permission matrix. Read it to connect another app to this backend.

### `users`

| Function | Type | Who | What |
| --- | --- | --- | --- |
| `getMyProfile` | query | signed in | The caller's own profile, or `null` when signed out. |
| `getPublicUser({ userId })` | query | anyone | Name, avatar and role only. Never the e-mail, phone or address. |
| `listTutors` | query | anyone | Tutors and administrators. |
| `ensureMyProfile` | mutation | signed in | Backfills the profile after sign-up. Idempotent. |
| `updateMyProfile({ name?, phone?, gender?, address?, avatar? })` | mutation | signed in | Updates the editable fields only. |
| `setUserRole({ userId, role })` | mutation | admin | The only place `role` is written. |
| `listUsers({ paginationOpts })` | query | admin | All accounts. |
| `findUserByEmail({ email })` | query | admin | Looks an account up by address. |

### `contents`

| Function | Type | Who | What |
| --- | --- | --- | --- |
| `listPublished({ paginationOpts, authorId? })` | query | anyone | The feed. Published lessons only, newest first. |
| `searchContents({ searchTerm, paginationOpts })` | query | anyone | Full text search over published titles. |
| `getContent({ contentId })` | query | anyone | One lesson. Unpublished lessons return `null` unless you are the author or an admin. |
| `listByAuthor({ authorId, paginationOpts, includeUnpublished? })` | query | anyone | A tutor's lessons. `includeUnpublished` requires being that tutor or an admin. |
| `listMyContents({ paginationOpts })` | query | tutor, admin | The caller's own lessons, drafts included. |
| `createContent({ title, description, videoUrl?, videoStorageId?, thumbnailUrl?, thumbnailStorageId? })` | mutation | tutor, admin | Creates a **draft**. Exactly one video source. |
| `updateContent({ contentId, title?, description?, videoUrl?, videoStorageId?, thumbnailUrl?, thumbnailStorageId? })` | mutation | author, admin | Updates an owned lesson. |
| `setContentStatus({ contentId, status })` | mutation | author, admin | Publish, archive or unpublish. |
| `deleteContent({ contentId })` | mutation | author, admin | Deletes the lesson, its likes, comments, saved rows and its uploaded files. |

### `storage`

| Function | Type | Who | What |
| --- | --- | --- | --- |
| `generateUploadUrl({ kind, contentType, size })` | mutation | tutor, admin | A one time URL to upload a file to. |
| `registerUpload({ storageId, kind, contentType, size })` | mutation | tutor, admin | Records an uploaded file against the caller. |

### `admin`

| Function | Type | Who | What |
| --- | --- | --- | --- |
| `grantFirstAdmin({ userId })` | mutation (internal) | CLI or dashboard only | Promotes the first administrator. Refuses once one exists. |

### `likes`

| Function | Type | Who | What |
| --- | --- | --- | --- |
| `likeContent({ contentId })` | mutation | signed in | Likes once. Returns the new count. |
| `unlikeContent({ contentId })` | mutation | signed in | Removes the like. Idempotent. |
| `hasLikedContent({ contentId })` | query | anyone | Whether the caller liked it. |
| `getContentLikeCount({ contentId })` | query | anyone | The stored counter. |
| `listLikedContents({ paginationOpts, userId? })` | query | signed in | The caller's liked lessons. Another user's requires admin. |
| `listLikedContentIds({ contentIds })` | query | anyone | Which of the given lessons the caller liked. |

### `comments`

| Function | Type | Who | What |
| --- | --- | --- | --- |
| `listComments({ contentId, paginationOpts })` | query | anyone | The comments, oldest first. |
| `addComment({ contentId, text })` | mutation | signed in | Posts a comment on a published lesson. |
| `editComment({ commentId, text })` | mutation | author, admin | Edits a comment. |
| `deleteComment({ commentId })` | mutation | author, admin | Deletes a comment. |
| `getContentCommentCount({ contentId })` | query | anyone | The stored counter. |
| `listMyComments({ paginationOpts })` | query | signed in | The caller's own comments. |

### `savedContents`

| Function | Type | Who | What |
| --- | --- | --- | --- |
| `saveContent({ contentId })` | mutation | signed in | Saves a lesson. Saving twice is a no-op. |
| `unsaveContent({ contentId })` | mutation | signed in | Removes it. Idempotent. |
| `isContentSaved({ contentId })` | query | anyone | Whether the caller saved it. |
| `listSavedContents({ paginationOpts })` | query | signed in | The caller's saved lessons. |

---

## Permissions

| Action | Anonymous | Student (`user`) | Tutor (`tutor`) | Admin (`admin`) |
| --- | --- | --- | --- | --- |
| Read published lessons | yes | yes | yes | yes |
| See a draft | no | no | own only | any |
| Create a lesson | no | no | yes | yes |
| Edit / publish / delete a lesson | no | no | own only | any |
| Like, comment, save | no | yes | yes | yes |
| Edit / delete a comment | no | no | own only | any |
| Change a role | no | no | no | yes |
| List all users | no | no | no | yes |

The rules that matter most:

- **No plaintext passwords, ever.** Convex Auth hashes them with scrypt. There
  is no password field on the `users` table.
- **Nobody can promote themselves.** `role` is not an argument of
  `updateMyProfile`, and `ensureMyProfile` only ever *lowers* a missing role
  to `"user"`. `setUserRole` is the single writer of `role` and it is admin
  only.
- **Nobody can change their own e-mail identity** through a profile mutation.
  The address belongs to the auth provider.
- **Every protected function checks on the server.** The React components hide
  buttons, but the check that matters is in `convex/lib/auth.ts`.
- **Unpublished lessons do not leak.** `getContent` returns `null` for
  somebody else's draft rather than an error that would confirm it exists.

---

## Video and uploads

A lesson's video comes either from a file the tutor uploaded or from a link
to a video that is hosted elsewhere. Both are handled server side.

### Uploaded files

The studio offers a file picker for the video and for the thumbnail, so a
tutor never has to host a file elsewhere. The picker is the default; a link is
still accepted for a video that already lives somewhere else.

The upload runs through Convex file storage:

1. `storage.generateUploadUrl({ kind, contentType, size })` hands the browser
   a short lived upload URL. Tutors and administrators only.
2. The browser POSTs the file to that URL and reads `{ storageId }` from the
   response.
3. `storage.registerUpload({ storageId, kind, contentType, size })` records
   the file against the tutor who uploaded it.
4. `contents.createContent` is called with the storage id.

The third step is not optional. `contents.createContent` only accepts a
storage id that has a row in `uploads` belonging to the calling tutor, so a
file that was uploaded by somebody else can never be attached to your lesson.

Every step is checked on the server. The declared type and size are checked
against the limits in `shared/upload.ts`, the file that is actually in storage
is checked again when the lesson is created, and a lesson may only point at a
file its own author uploaded, and only at one lesson at a time. When a lesson
is deleted its files are deleted with it.

| Limit | Value |
| --- | --- |
| Video | 20 MiB, `.mp4` `.webm` `.mov` `.m4v` `.ogv` |
| Thumbnail | 5 MiB, `.jpg` `.png` `.webp` `.gif` `.avif` |

### Links

`videoUrl` is validated on the server by `shared/video.ts`, which accepts:

| Provider | Example |
| --- | --- |
| YouTube | `https://www.youtube.com/watch?v=...` |
| Vimeo | `https://vimeo.com/123456789` |
| Mux | `https://stream.mux.com/<playback-id>.m3u8` |
| Cloudflare Stream | `https://<account>.cloudflarestream.com/<id>` |
| S3 / CloudFront | `https://<bucket>.s3.amazonaws.com/<file>.mp4` |
| Direct file | any `https://` URL ending in `.mp4`, `.webm`, `.m3u8`, `.mov`, `.ogv`, `.ogg` |

Plain `http://` is only accepted for `localhost` and other loopback hosts.

To add a provider, extend `parseVideoSourceDetailed` in `shared/video.ts`.
The schema and the mutations do not change.

A link that is refused comes back with a message that says why, so the studio
can show it instead of a generic error. The same is true of every other
failure: the backend answers with `{ code, message }` and the interface shows
that message, never the raw Convex error.

No storage credentials are stored in the database and none are exposed to the
client.

---

## Tests

```bash
npm test
```

65 tests run against the real function definitions with
[`convex-test`](https://www.npmjs.com/package/convex-test):

- `tests/authorization.test.ts` — who may do what: anonymous visitors,
  students, tutors, administrators, comment ownership and profile privacy.
- `tests/data-integrity.test.ts` — duplicate likes and saves, counter
  consistency, pagination, search, input validation, cascade deletes and
  role escalation.

---

## Checks

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # vitest run
npm run build       # next build
```

---

## Deploying to production

```bash
npx convex login
npx convex dev --once    # push the functions without starting the watcher
npm run auth:keys:prod   # set JWT_PRIVATE_KEY and JWKS on the production deployment
npx convex deploy --prod
npm run build
```

Set `NEXT_PUBLIC_CONVEX_URL` to the production deployment URL in the
environment where the Next.js app is hosted.

---

## Project layout

```
convex/
  _generated/       typed API, produced by `npx convex dev`
  auth.ts           Convex Auth configuration (password provider)
  auth.config.ts    the auth domain the backend trusts
  comments.ts       comments
  contents.ts       lessons
  http.ts           HTTP routes
  likes.ts          likes
  savedContents.ts  saved lessons
  schema.ts         tables and indexes
  users.ts          profiles and roles
  lib/
    auth.ts         getViewer / requireViewer / requireTutor / requireAdmin
    content.ts      summary builders (no N+1 reads)
    errors.ts       the { code, message } error shape
    validators.ts   shared validators
app/                Next.js pages
components/         React components
shared/video.ts     video URL validation, shared by both sides
shared/upload.ts    upload limits and file types, shared by both sides
lib/errors.ts       client helper that turns a Convex failure into a sentence
scripts/            setup-auth-keys.mjs
tests/              convex-test suites
docs/API.md         endpoint reference for connecting another app
```

---

## Manual steps that still need a human

1. `npx convex login` — needs a browser and your Convex account.
2. `npx convex dev` — creates the dev deployment and generates
   `convex/_generated/`.
3. `npm run auth:keys` — sets the Convex Auth signing keys on that deployment.
4. Promote the first real account to administrator. The role is only writable
   by an admin, so the very first one is granted by the internal
   `admin.grantFirstAdmin` mutation. It can only be called from the Convex
   CLI or the dashboard, never from a browser, and it refuses to run once an
   administrator exists:

   ```bash
   # find the account id
   npx convex data users

   # promote it
   npx convex run convex/admin:grantFirstAdmin '{"userId":"<the users document id>"}'
   ```

   Later role changes go through `users.setUserRole`, which is admin only.
