# NorthEd backend API

This is the complete public surface of the NorthEd Convex deployment. It is
written for a second application that wants to read or write the same data:
another web app, a mobile client, a reporting script or an admin tool.

- Dev deployment: `https://polished-hippopotamus-760.convex.cloud`
- 38 public functions across 7 modules, plus 2 that only the CLI can reach
- Authentication: e-mail and password (Convex Auth), bearer tokens
- Every response is JSON

There is no REST layer, but every function is reachable over plain HTTP JSON,
so a client does not need the Convex SDK. Section 1 shows both ways in.

---

## 1. Talking to the backend

### 1.1 Plain HTTP, any language

Three endpoints, one per kind of function.

| Kind | Endpoint |
| --- | --- |
| Query (read) | `POST {deployment}/api/query` |
| Mutation (write) | `POST {deployment}/api/mutation` |
| Action (external work) | `POST {deployment}/api/action` |

Request body:

```json
{
  "path": "contents:listPublished",
  "args": { "paginationOpts": { "numItems": 20, "cursor": null } },
  "format": "json"
}
```

`path` is `module:function`, for example `comments:addComment`. `args` must
match the function's arguments exactly; an unknown or missing argument is
rejected by the server before the handler runs.

A successful call answers with:

```json
{ "status": "success", "value": { "page": [], "isDone": true, "continueCursor": "" } }
```

A failed call answers with:

```json
{
  "status": "error",
  "errorMessage": "[Request ID: 8ac2f0d46bc018ad] Server Error\nUncaught ConvexError: {...}",
  "errorData": { "code": "unauthenticated", "message": "You need to sign in to do that." }
}
```

Read `errorData`. `errorMessage` is Convex's raw internal text and includes a
stack trace; it is not meant for a user interface.

Convex answers with **HTTP 200 even when the call failed**. Check `status` in
the body, not the HTTP status code.

```bash
curl -s -X POST https://polished-hippopotamus-760.convex.cloud/api/query \
  -H 'Content-Type: application/json' \
  -d '{"path":"contents:listPublished","args":{"paginationOpts":{"numItems":20,"cursor":null}},"format":"json"}'
```

### 1.2 With the Convex SDK

JavaScript and TypeScript:

```js
import { ConvexHttpClient } from "convex/browser";

const client = new ConvexHttpClient("https://polished-hippopotamus-760.convex.cloud");

// After signing in.
client.setAuth(accessToken);

const page = await client.query("contents:listPublished", {
  paginationOpts: { numItems: 20, cursor: null },
});
```

A React or Next.js app that is itself a Convex client gets live updates for
free: wrap the tree in `ConvexProvider` and use `useQuery`, `usePaginatedQuery`
and `useMutation`. A client that is not built on Convex has to poll.

### 1.3 Pointing another app at this backend

Nothing in `convex/` is specific to this repository. To move the backend into
another app:

1. Copy the `convex/` folder and `convex.json` across.
2. Copy the dependencies: `convex` and `@convex-dev/auth` (see `package.json`).
3. Copy `shared/video.ts` and `shared/upload.ts`, which both sides import.
4. Point the new app at the same deployment, or create a fresh one with
   `npx convex dev`.
5. Generate the typed API with `npx convex dev` (it writes `convex/_generated`).
6. Install the auth signing keys with `npm run auth:keys`.

A second app on the *same* deployment only needs the deployment URL and the
`convex` package. Nothing else is shared.

---

## 2. Authentication

All protected calls need the access token from a sign in, sent as:

```
Authorization: Bearer <accessToken>
```

| Function | Type | Purpose |
| --- | --- | --- |
| `auth:signIn` | action | Sign up, sign in, or refresh a session |
| `auth:signOut` | action | Invalidate the current session |
| `auth:isAuthenticated` | query | Whether the bearer token is valid |

### 2.1 Sign up

```json
{
  "path": "auth:signIn",
  "args": {
    "provider": "password",
    "params": {
      "flow": "signUp",
      "email": "learner@example.com",
      "password": "at-least-8-chars",
      "name": "Learner"
    }
  },
  "format": "json"
}
```

The password must be at least 8 characters. The e-mail address is lower-cased
and must look like an address. The account starts with the role `user`.

### 2.2 Sign in

Same call with `"flow": "signIn"` and without `name`:

```json
{
  "path": "auth:signIn",
  "args": {
    "provider": "password",
    "params": { "flow": "signIn", "email": "learner@example.com", "password": "..." }
  },
  "format": "json"
}
```

### 2.3 The response

Both flows answer with:

```json
{ "status": "success", "value": { "tokens": { "token": "<access token>", "refreshToken": "<refresh token>" } } }
```

The access token is a JWT that is valid for **one hour**. Keep the refresh
token and use it before the hour is up.

### 2.4 Refresh

Call `auth:signIn` again with the refresh token and no provider:

```json
{
  "path": "auth:signIn",
  "args": { "refreshToken": "<refresh token>" },
  "format": "json"
}
```

The answer has the same `{ tokens: { token, refreshToken } }` shape, with a new
access token and a new refresh token.

### 2.5 Sign out

`auth:signOut` takes no arguments. It invalidates the session the bearer token
belongs to, so the token stops working immediately.

### 2.6 How roles work

The role lives on the `users` document and is written in exactly one place,
`users:setUserRole`, which only an administrator can call. There is no way for
a client to promote itself, and `ensureMyProfile` only ever *lowers* a missing
role to `user`. The first administrator is granted from the CLI, see
[section 9](#9-the-first-administrator).

---

## 3. Errors

Every failure the application raises carries a machine readable code and a
message written for a person.

| Code | Meaning | Typical cause |
| --- | --- | --- |
| `unauthenticated` | No valid session | Missing or expired bearer token |
| `forbidden` | Signed in, but not allowed | Wrong role, or not your lesson |
| `not_found` | The record does not exist | Unknown id, or an unpublished lesson you cannot see |
| `invalid_input` | The arguments were rejected | A title that is too short, a file that is too large, an unsupported video link |
| `conflict` | The state does not allow it | A second administrator already exists |

Convex's own validation failures (a wrong argument type, for example) arrive
without `errorData`. Treat a missing `errorData` as a programming error rather
than something to show a user.

In the Convex SDK the same payload is on `error.data`, so
`error.data?.message` is the text to display.

---

## 4. Identifiers

Every id is an opaque string, for example `k177k6y6aff3qahnb65393m8tx8h8x77`
for a lesson and `kd76wfx8fgsnt81f132xaq4qdd8h9zhb` for a user. Pass them
around as strings, never parse them, and never build one by hand. A storage id
looks different (`kg26ph212xe7gvebgq9qgzjfhs8h8gtd`) and comes from the upload
step in [section 8](#8-uploading-a-file).

---

## 5. Data model

### `users`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | id | |
| `name` | `string \| null` | Display name. Defaults to the e-mail local part. |
| `email` | `string \| null` | Owned by the auth provider. |
| `phone` | `string \| null` | Editable by the owner. |
| `gender` | `string \| null` | Editable by the owner. |
| `address` | `string \| null` | Editable by the owner. |
| `avatar` | `string \| null` | http(s) URL. Falls back to the auth provider's image. |
| `role` | `"user" \| "tutor" \| "admin"` | Only an administrator can write it. |
| `createdAt` | `number` | Milliseconds since the epoch. |

Indexes: `email`, `phone`, `role`.

### `contents` (lessons)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | id | |
| `title` | `string` | 3 to 120 characters after trimming. |
| `description` | `string` | Up to 2000 characters. |
| `authorId` | id | The tutor who wrote it. |
| `videoUrl` | `string \| null` | A link to a video hosted elsewhere. |
| `videoStorageId` | id \| null | A video in Convex file storage. |
| `thumbnailUrl` | `string \| null` | http(s) URL. |
| `thumbnailStorageId` | id \| null` | A thumbnail in Convex file storage. |
| `status` | `"draft" \| "published" \| "archived"` | |
| `likeCount`, `commentCount` | `number` | Denormalised counters. |
| `updatedAt` | `number \| null` | Set on every edit. |

Exactly one of `videoUrl` and `videoStorageId` is set on a lesson, and at most
one of `thumbnailUrl` and `thumbnailStorageId`.

Indexes: `author`, `status`, `status_author`, `video_storage`,
`thumbnail_storage`. Search index: `title_search` (searches `title`, filtered
by `status`).

### `uploads`

| Field | Type | Notes |
| --- | --- | --- |
| `storageId` | id | The file in Convex file storage. |
| `ownerId` | id | The tutor who uploaded it. |
| `kind` | `"video" \| "image"` | What the file is for. |
| `contentType` | `string` | As declared at upload time. |
| `size` | `number` | Bytes. |

Indexes: `storage`, `owner`. A lesson may only point at a file its own author
uploaded, and one file may only back one lesson.

### `likes`, `comments`, `savedContents`

`likes` and `savedContents` are `{contentId, userId}` rows with indexes
`content`, `user` and `content_user`. The `content_user` index is what makes
the duplicate check a single lookup.

`comments` are `{contentId, userId, text, updatedAt?}` with indexes `content`
and `user`.

---

## 6. Endpoints

Unless stated otherwise, a function that returns a page returns it in the
shape:

```ts
{
  page: T[];
  isDone: boolean;
  continueCursor: string;
}
```

### 6.1 `users`

| Function | Type | Who | Arguments | Returns |
| --- | --- | --- | --- | --- |
| `users:getMyProfile` | query | signed in | none | `Profile \| null` |
| `users:getPublicUser` | query | anyone | `{ userId }` | `PublicUser \| null` |
| `users:listTutors` | query | anyone | none | `PublicUser[]` |
| `users:ensureMyProfile` | mutation | signed in | none | `Profile` |
| `users:updateMyProfile` | mutation | signed in | `{ name?, phone?, gender?, address?, avatar? }` | `Profile` |
| `users:setUserRole` | mutation | admin | `{ userId, role }` | `Profile` |
| `users:listUsers` | query | admin | `{ paginationOpts }` | page of `Profile` |
| `users:findUserByEmail` | query | admin | `{ email }` | `userId \| null` |

`Profile` is the whole `users` document plus `createdAt`. `PublicUser` is the
safe subset: `id`, `name`, `avatar`, `role`. The e-mail, phone and address are
never returned to anybody but the owner.

`ensureMyProfile` backfills the profile after a sign up: it sets a missing role
to `user` and a missing name to the e-mail local part. It is idempotent, so
it is safe to call on every sign in.

`updateMyProfile` accepts only the five editable fields. `role` and `email`
are not arguments, so neither can be changed through it.

### 6.2 `contents`

| Function | Type | Who | Arguments | Returns |
| --- | --- | --- | --- | --- |
| `contents:listPublished` | query | anyone | `{ paginationOpts, authorId? }` | page of `ContentSummary` |
| `contents:searchContents` | query | anyone | `{ searchTerm, paginationOpts }` | page of `ContentSummary` |
| `contents:getContent` | query | anyone | `{ contentId }` | `ContentDetail \| null` |
| `contents:listByAuthor` | query | anyone | `{ authorId, paginationOpts, includeUnpublished? }` | page of `ContentSummary` |
| `contents:listMyContents` | query | tutor, admin | `{ paginationOpts }` | page of `ContentSummary` |
| `contents:createContent` | mutation | tutor, admin | `{ title, description, videoUrl?, videoStorageId?, thumbnailUrl?, thumbnailStorageId? }` | `contentId` |
| `contents:updateContent` | mutation | author, admin | `{ contentId, title?, description?, videoUrl?, videoStorageId?, thumbnailUrl?, thumbnailStorageId? }` | `contentId` |
| `contents:setContentStatus` | mutation | author, admin | `{ contentId, status }` | `contentId` |
| `contents:deleteContent` | mutation | author, admin | `{ contentId }` | `contentId` |

`ContentSummary`:

```ts
{
  id: string;
  title: string;
  description: string;
  videoProvider: string;        // "youtube", "vimeo", "upload", "s3", "direct", ...
  thumbnailUrl: string | null;
  status: "draft" | "published" | "archived";
  author: { id, name, avatar, role };
  likeCount: number;
  commentCount: number;
  likedByViewer: boolean;
  savedByViewer: boolean;
  createdAt: number;
  updatedAt: number | null;
}
```

`ContentDetail` is a `ContentSummary` plus:

```ts
{
  video: { kind: "embed" | "file"; url: string; provider: string } | null;
  canEdit: boolean;
}
```

`video.kind` is `embed` for YouTube and Vimeo, `file` for an uploaded file, an
S3 object or a direct media link, and `video.url` is ready to be handed to an
`<iframe>` or a `<video>` tag as it is.

Notes:

- `listPublished` and `searchContents` only ever return published lessons,
  newest first.
- `getContent` returns `null` for a draft or archived lesson that belongs to
  somebody else, so the existence of an unpublished lesson is not leaked.
- `listByAuthor` with `includeUnpublished: true` is refused with `forbidden`
  unless the caller is that author or an administrator.
- `createContent` always creates a **draft**. Publishing is a separate,
  explicit step with `setContentStatus`.
- `createContent` needs exactly one video source. Passing both `videoUrl` and
  `videoStorageId`, or neither, is `invalid_input`.
- `updateContent` only changes the fields you pass. Passing `videoUrl`
  replaces an uploaded video and deletes the file behind it; passing
  `videoStorageId` replaces a linked video. There is no way to clear a field
  that way.
- `deleteContent` also removes the likes, the comments, the saved rows and the
  uploaded files of that lesson.

### 6.3 `likes`

| Function | Type | Who | Arguments | Returns |
| --- | --- | --- | --- | --- |
| `likes:likeContent` | mutation | signed in | `{ contentId }` | the new like count |
| `likes:unlikeContent` | mutation | signed in | `{ contentId }` | the new like count |
| `likes:hasLikedContent` | query | anyone | `{ contentId }` | `boolean` |
| `likes:getContentLikeCount` | query | anyone | `{ contentId }` | `number` |
| `likes:listLikedContents` | query | signed in | `{ paginationOpts, userId? }` | page of `ContentSummary` |
| `likes:listLikedContentIds` | query | anyone | `{ contentIds: string[] }` | `string[]` |

Liking twice does not raise the counter twice. Unliking something that was
never liked is a no-op. `listLikedContents` returns the caller's own likes
unless an administrator asks for somebody else's, which is `forbidden`
otherwise. `listLikedContentIds` is the cheap way to mark a page of lessons
as liked, as opposed to reading `likedByViewer` on every summary.

### 6.4 `comments`

| Function | Type | Who | Arguments | Returns |
| --- | --- | --- | --- | --- |
| `comments:listComments` | query | anyone | `{ contentId, paginationOpts }` | page of `Comment` |
| `comments:addComment` | mutation | signed in | `{ contentId, text }` | `commentId` |
| `comments:editComment` | mutation | author, admin | `{ commentId, text }` | `commentId` |
| `comments:deleteComment` | mutation | author, admin | `{ commentId }` | `commentId` |
| `comments:getContentCommentCount` | query | anyone | `{ contentId }` | `number` |
| `comments:listMyComments` | query | signed in | `{ paginationOpts }` | page of `Comment` |

```ts
type Comment = {
  id: string;
  contentId: string;
  text: string;
  createdAt: number;
  updatedAt: number | null;
  author: { id, name, avatar, role };
  canEdit: boolean;
  canDelete: boolean;
};
```

Comments are returned oldest first. A comment is 1 to 2000 characters. Only
published lessons can be commented on, except by the author of the lesson
itself. `canEdit` and `canDelete` tell the client whether to show the
controls; the server checks again either way.

### 6.5 `savedContents`

| Function | Type | Who | Arguments | Returns |
| --- | --- | --- | --- | --- |
| `savedContents:saveContent` | mutation | signed in | `{ contentId }` | `boolean` |
| `savedContents:unsaveContent` | mutation | signed in | `{ contentId }` | `boolean` |
| `savedContents:isContentSaved` | query | anyone | `{ contentId }` | `boolean` |
| `savedContents:listSavedContents` | query | signed in | `{ paginationOpts }` | page of `ContentSummary` |

Saving twice is a no-op, so the saved list never has duplicates.

### 6.6 `storage`

| Function | Type | Who | Arguments | Returns |
| --- | --- | --- | --- | --- |
| `storage:generateUploadUrl` | mutation | tutor, admin | `{ kind, contentType, size }` | an upload URL |
| `storage:registerUpload` | mutation | tutor, admin | `{ storageId, kind, contentType, size }` | `uploadId` |

`kind` is `"video"` or `"image"`. The declared `contentType` and `size` are
checked against the limits below before anything is accepted.

| Kind | Maximum size | Accepted content types |
| --- | --- | --- |
| `video` | 20 MiB | `video/mp4`, `video/webm`, `video/quicktime`, `video/x-m4v`, `video/ogg` |
| `image` | 5 MiB | `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/avif` |

---

## 7. Pagination

Every paged function takes a `paginationOpts` object:

```ts
{
  numItems: number;      // how many rows you want
  cursor: string | null; // null for the first page
  endCursor?: string;
}
```

and answers with `{ page, isDone, continueCursor }`. Pass `continueCursor`
back as `cursor` to get the next page. An empty string means there is nothing
more.

The first call always sends `"cursor": null`. Sending a missing `cursor` is
rejected by the server.

```ts
let cursor: string | null = null;
const all: ContentSummary[] = [];
do {
  const res = await client.query("contents:listPublished", {
    paginationOpts: { numItems: 50, cursor },
  });
  all.push(...res.page);
  cursor = res.isDone ? null : res.continueCursor;
} while (cursor !== null);
```

---

## 8. Uploading a file

A lesson's video can come from a link (section 9) or from a file the tutor
uploads. The upload is four steps, and every one of them is checked on the
server.

```ts
// 1. Ask for a one time upload URL.
const postUrl = await client.mutation("storage:generateUploadUrl", {
  kind: "video",
  contentType: file.type,       // e.g. "video/mp4"
  size: file.size,
});

// 2. POST the file to that URL.
const response = await fetch(postUrl, {
  method: "POST",
  headers: { "Content-Type": file.type },
  body: file,
});
if (!response.ok) throw new Error("The upload failed.");

// 3. Tell the backend about the file.
const { storageId } = await response.json();
await client.mutation("storage:registerUpload", {
  storageId,
  kind: "video",
  contentType: file.type,
  size: file.size,
});

// 4. Create the lesson with the file.
const contentId = await client.mutation("contents:createContent", {
  title: "Fractions explained",
  description: "A short lesson.",
  videoStorageId: storageId,
});
```

The upload URL is single use and short lived. Step 3 is not optional: the
backend only accepts a storage id that has an `uploads` row belonging to the
caller, and the answer to step 3 says so directly.

Rules the server enforces:

- Only a tutor or an administrator can get an upload URL.
- The declared type and size must be within the limits in section 6.6.
- The file that actually arrived in storage is checked again, so a file
  uploaded under a misleading content type is refused.
- A lesson may only point at a file its own author uploaded. Somebody else's
  file is `forbidden`, and a file with no upload record is `not_found`.
- A file may only back one lesson. Reusing it is `invalid_input`.
- When a lesson is deleted, its files are deleted with it. The same happens
  when a lesson's video is replaced by `updateContent`.

A thumbnail follows the same four steps with `kind: "image"`.

The storage URL of a file is `https://{deployment}/api/storage/{storageId}`.
It is public and does not expire, so treat it as a public link and never put
anything private in a lesson.

---

## 9. Video links

`videoUrl` is validated on the server. The accepted links are:

| Provider | Example | Player |
| --- | --- | --- |
| YouTube | `https://www.youtube.com/watch?v=...` | embed |
| Vimeo | `https://vimeo.com/123456789` | embed |
| Mux | `https://stream.mux.com/{playback-id}.m3u8` | file |
| Cloudflare Stream | `https://{account}.cloudflarestream.com/{id}` | file |
| S3 or CloudFront | `https://{bucket}.s3.amazonaws.com/{file}.mp4` | file |
| Direct file | any `https://` URL ending in `.mp4`, `.webm`, `.m3u8`, `.mov`, `.ogv` or `.ogg` | file |

Plain `http://` is only accepted for `localhost` and other loopback hosts. A
link that is refused comes back with `invalid_input` and a message that says
why, for example "That video link is not supported. Use a YouTube, Vimeo, Mux,
Cloudflare Stream or S3 link, or a direct .mp4/.webm URL."

The schema and the mutations do not change when a provider is added: extend
`parseVideoSourceDetailed` in `shared/video.ts`.

---

## 10. Permissions

| Action | Anonymous | Student (`user`) | Tutor (`tutor`) | Admin (`admin`) |
| --- | --- | --- | --- | --- |
| Read published lessons | yes | yes | yes | yes |
| See a draft | no | no | own only | any |
| Create a lesson | no | no | yes | yes |
| Edit, publish or delete a lesson | no | no | own only | any |
| Like, comment, save | no | yes | yes | yes |
| Edit or delete a comment | no | no | own only | any |
| Upload a file | no | no | yes | yes |
| Change a role | no | no | no | yes |
| List all users | no | no | no | yes |

These are checked in the backend, in `convex/lib/auth.ts`. The interface hides
the buttons it should hide, but that is a convenience, not the rule.

---

## 11. The first administrator

`admin:grantFirstAdmin` is an internal function, so the backend refuses it
when it comes from a browser. It can only be run from the Convex CLI or the
dashboard, and it refuses to run once an administrator exists.

```bash
# find the account id
npx convex data users

# promote it
npx convex run convex/admin:grantFirstAdmin '{"userId":"<the users document id>"}'
```

Afterwards, role changes go through `users:setUserRole`, which only an
administrator can call.

---

## 12. Rules worth knowing before you build against this

- **Passwords.** Hashed with scrypt inside Convex Auth. There is no password
  field on the `users` table and no plaintext anywhere.
- **Access tokens last one hour.** Refresh with the refresh token.
- **New accounts are students.** A tutor has to be promoted first.
- **Lessons are never published automatically.** `createContent` always makes
  a draft.
- **Counters are denormalised.** `likeCount` and `commentCount` are stored on
  the lesson and kept in step by the like and comment mutations.
- **Search covers titles of published lessons only.**
- **Unpublished lessons do not leak.** They read as `null`, not as an error
  that would confirm they exist.
- **Storage URLs are public and permanent.**
- **An uploaded file that is never attached to a lesson is not cleaned up.**
  There is no garbage collector for orphan uploads yet.
- **A link and a file are mutually exclusive.** A lesson has exactly one
  video source and at most one thumbnail source.

---

## 13. A complete client in one file

```ts
import { ConvexHttpClient } from "convex/browser";

const DEPLOYMENT = "https://polished-hippopotamus-760.convex.cloud";
const client = new ConvexHttpClient(DEPLOYMENT);

async function signIn(email: string, password: string) {
  const res = await client.action("auth:signIn", {
    provider: "password",
    params: { flow: "signIn", email, password },
  });
  const tokens = (res as { tokens: { token: string; refreshToken: string } }).tokens;
  client.setAuth(tokens.token);
  return tokens;
}

async function publishLesson(title: string, description: string, file: File) {
  const postUrl = (await client.mutation("storage:generateUploadUrl", {
    kind: "video",
    contentType: file.type,
    size: file.size,
  })) as string;

  const response = await fetch(postUrl, {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
  });
  const { storageId } = (await response.json()) as { storageId: string };

  await client.mutation("storage:registerUpload", {
    storageId,
    kind: "video",
    contentType: file.type,
    size: file.size,
  });

  const contentId = (await client.mutation("contents:createContent", {
    title,
    description,
    videoStorageId: storageId,
  })) as string;

  await client.mutation("contents:setContentStatus", {
    contentId,
    status: "published",
  });

  return contentId;
}
```

Without the Convex SDK, the same thing over plain HTTP:

```ts
const DEPLOYMENT = "https://polished-hippopotamus-760.convex.cloud";

// "query" for reads, "mutation" for writes, "action" for the auth actions.
async function call(kind: "query" | "mutation" | "action", path: string, args: unknown, token?: string) {
  const response = await fetch(`${DEPLOYMENT}/api/${kind}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  const body = await response.json();
  if (body.status === "error") {
    throw new Error(body.errorData?.message ?? body.errorMessage);
  }
  return body.value;
}

const { value: { tokens } } = await (
  await fetch(`${DEPLOYMENT}/api/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "auth:signIn",
      args: {
        provider: "password",
        params: { flow: "signIn", email, password },
      },
      format: "json",
    }),
  })
).json();

const feed = await call("query", "contents:listPublished", {
  paginationOpts: { numItems: 20, cursor: null },
}, tokens.token);
```
