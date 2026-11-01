import { describe, expect, it } from "vitest";
import { api, asUser, createTest, seedUser } from "./setup";
import type { AppErrorCode } from "../convex/lib/errors";

async function expectAppError(
  call: Promise<unknown>,
  code: AppErrorCode,
): Promise<void> {
  await expect(call).rejects.toMatchObject({
    data: { code },
  });
}

const VIDEO_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const PAGE = { numItems: 20, cursor: null } as const;

describe("likes", () => {
  it("accepts a like only once per user and lesson", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const student = await seedUser(t, { role: "user" });
    const me = asUser(t, student.id);

    const contentId = await asUser(t, tutor.id).mutation(
      api.contents.createContent,
      { title: "Fractions", description: "Halves and quarters", videoUrl: VIDEO_URL },
    );
    await asUser(t, tutor.id).mutation(api.contents.setContentStatus, {
      contentId,
      status: "published",
    });

    expect(await me.mutation(api.likes.likeContent, { contentId })).toBe(1);
    // Liking again must not inflate the counter.
    expect(await me.mutation(api.likes.likeContent, { contentId })).toBe(1);
    expect(await me.query(api.likes.getContentLikeCount, { contentId })).toBe(1);
    expect(await me.query(api.likes.hasLikedContent, { contentId })).toBe(true);

    const rows = await t.run(async (ctx) =>
      ctx.db.query("likes").withIndex("content_user", (q) =>
        q.eq("contentId", contentId).eq("userId", student.id),
      ).collect(),
    );
    expect(rows).toHaveLength(1);
  });

  it("counts each user separately", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const first = await seedUser(t, { role: "user" });
    const second = await seedUser(t, { role: "user" });

    const contentId = await asUser(t, tutor.id).mutation(
      api.contents.createContent,
      { title: "Fractions", description: "Halves and quarters", videoUrl: VIDEO_URL },
    );
    await asUser(t, tutor.id).mutation(api.contents.setContentStatus, {
      contentId,
      status: "published",
    });

    await asUser(t, first.id).mutation(api.likes.likeContent, { contentId });
    expect(await asUser(t, second.id).mutation(api.likes.likeContent, { contentId })).toBe(2);
    expect(await t.query(api.likes.getContentLikeCount, { contentId })).toBe(2);
  });

  it("unliking is idempotent and keeps the counter in step", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const student = await seedUser(t, { role: "user" });
    const me = asUser(t, student.id);

    const contentId = await asUser(t, tutor.id).mutation(
      api.contents.createContent,
      { title: "Fractions", description: "Halves and quarters", videoUrl: VIDEO_URL },
    );
    await asUser(t, tutor.id).mutation(api.contents.setContentStatus, {
      contentId,
      status: "published",
    });

    await me.mutation(api.likes.likeContent, { contentId });
    expect(await me.mutation(api.likes.unlikeContent, { contentId })).toBe(0);
    // Unliking something that was never liked changes nothing.
    expect(await me.mutation(api.likes.unlikeContent, { contentId })).toBe(0);
    expect(await me.query(api.likes.hasLikedContent, { contentId })).toBe(false);
  });

  it("cannot like a lesson that is not published", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const student = await seedUser(t, { role: "user" });

    const contentId = await asUser(t, tutor.id).mutation(
      api.contents.createContent,
      { title: "Draft lesson", description: "Not ready yet", videoUrl: VIDEO_URL },
    );

    await expectAppError(
      asUser(t, student.id).mutation(api.likes.likeContent, { contentId }),
      "forbidden",
    );
  });
});

describe("saved lessons", () => {
  it("never stores the same lesson twice", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const student = await seedUser(t, { role: "user" });
    const me = asUser(t, student.id);

    const contentId = await asUser(t, tutor.id).mutation(
      api.contents.createContent,
      { title: "Fractions", description: "Halves and quarters", videoUrl: VIDEO_URL },
    );
    await asUser(t, tutor.id).mutation(api.contents.setContentStatus, {
      contentId,
      status: "published",
    });

    expect(await me.mutation(api.savedContents.saveContent, { contentId })).toBe(true);
    expect(await me.mutation(api.savedContents.saveContent, { contentId })).toBe(true);
    expect(await me.query(api.savedContents.isContentSaved, { contentId })).toBe(true);

    const saved = await me.query(api.savedContents.listSavedContents, {
      paginationOpts: PAGE,
    });
    expect(saved.page.map((c) => c.id)).toEqual([contentId]);

    const rows = await t.run(async (ctx) =>
      ctx.db.query("savedContents").withIndex("content_user", (q) =>
        q.eq("contentId", contentId).eq("userId", student.id),
      ).collect(),
    );
    expect(rows).toHaveLength(1);
  });

  it("unsaving is idempotent", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const student = await seedUser(t, { role: "user" });
    const me = asUser(t, student.id);

    const contentId = await asUser(t, tutor.id).mutation(
      api.contents.createContent,
      { title: "Fractions", description: "Halves and quarters", videoUrl: VIDEO_URL },
    );
    await asUser(t, tutor.id).mutation(api.contents.setContentStatus, {
      contentId,
      status: "published",
    });

    await me.mutation(api.savedContents.saveContent, { contentId });
    expect(await me.mutation(api.savedContents.unsaveContent, { contentId })).toBe(false);
    expect(await me.mutation(api.savedContents.unsaveContent, { contentId })).toBe(false);
    expect(await me.query(api.savedContents.isContentSaved, { contentId })).toBe(false);
  });
});

describe("comments", () => {
  it("keeps the comment counter in step", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const student = await seedUser(t, { role: "user" });
    const me = asUser(t, student.id);

    const contentId = await asUser(t, tutor.id).mutation(
      api.contents.createContent,
      { title: "Fractions", description: "Halves and quarters", videoUrl: VIDEO_URL },
    );
    await asUser(t, tutor.id).mutation(api.contents.setContentStatus, {
      contentId,
      status: "published",
    });

    expect(await me.query(api.comments.getContentCommentCount, { contentId })).toBe(0);

    const commentId = await me.mutation(api.comments.addComment, {
      contentId,
      text: "Clear explanation",
    });
    expect(await me.query(api.comments.getContentCommentCount, { contentId })).toBe(1);

    await me.mutation(api.comments.deleteComment, { commentId });
    expect(await me.query(api.comments.getContentCommentCount, { contentId })).toBe(0);
  });

  it("rejects empty and overlong comments", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const student = await seedUser(t, { role: "user" });
    const me = asUser(t, student.id);

    const contentId = await asUser(t, tutor.id).mutation(
      api.contents.createContent,
      { title: "Fractions", description: "Halves and quarters", videoUrl: VIDEO_URL },
    );
    await asUser(t, tutor.id).mutation(api.contents.setContentStatus, {
      contentId,
      status: "published",
    });

    await expectAppError(
      me.mutation(api.comments.addComment, { contentId, text: "   " }),
      "invalid_input",
    );
    await expectAppError(
      me.mutation(api.comments.addComment, { contentId, text: "x".repeat(2001) }),
      "invalid_input",
    );
  });

  it("never exposes the author's private profile fields", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const student = await seedUser(t, { name: "Ada Lovelace" });
    const me = asUser(t, student.id);

    const contentId = await asUser(t, tutor.id).mutation(
      api.contents.createContent,
      { title: "Fractions", description: "Halves and quarters", videoUrl: VIDEO_URL },
    );
    await asUser(t, tutor.id).mutation(api.contents.setContentStatus, {
      contentId,
      status: "published",
    });

    await me.mutation(api.comments.addComment, { contentId, text: "Nice work" });

    const comments = await me.query(api.comments.listComments, {
      contentId,
      paginationOpts: PAGE,
    });
    const author = comments.page[0]?.author;
    expect(author?.name).toBe("Ada Lovelace");
    expect(author).not.toHaveProperty("email");
    expect(author).not.toHaveProperty("phone");
    expect(author).not.toHaveProperty("address");
  });
});

describe("the published feed", () => {
  it("only ever contains published lessons", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const me = asUser(t, tutor.id);

    const draftId = await me.mutation(api.contents.createContent, {
      title: "Draft lesson",
      description: "Not ready yet",
      videoUrl: VIDEO_URL,
    });
    const publishedId = await me.mutation(api.contents.createContent, {
      title: "Published lesson",
      description: "Ready to go",
      videoUrl: VIDEO_URL,
    });
    const archivedId = await me.mutation(api.contents.createContent, {
      title: "Archived lesson",
      description: "Old news",
      videoUrl: VIDEO_URL,
    });
    await me.mutation(api.contents.setContentStatus, {
      contentId: publishedId,
      status: "published",
    });
    await me.mutation(api.contents.setContentStatus, {
      contentId: archivedId,
      status: "archived",
    });

    const feed = await t.query(api.contents.listPublished, {
      paginationOpts: PAGE,
    });
    const ids = feed.page.map((c) => c.id);
    expect(ids).toContain(publishedId);
    expect(ids).not.toContain(draftId);
    expect(ids).not.toContain(archivedId);
  });

  it("paginates", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const me = asUser(t, tutor.id);

    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const contentId = await me.mutation(api.contents.createContent, {
        title: `Lesson number ${i}`,
        description: "One of several",
        videoUrl: VIDEO_URL,
      });
      await me.mutation(api.contents.setContentStatus, {
        contentId,
        status: "published",
      });
      ids.push(contentId);
    }

    const first = await t.query(api.contents.listPublished, {
      paginationOpts: { numItems: 2, cursor: null },
    });
    expect(first.page).toHaveLength(2);
    expect(first.isDone).toBe(false);
    expect(first.continueCursor).not.toBe("");

    const second = await t.query(api.contents.listPublished, {
      paginationOpts: { numItems: 2, cursor: first.continueCursor },
    });
    expect(second.page).toHaveLength(1);
    expect(second.isDone).toBe(true);

    const seen = [...first.page, ...second.page].map((c) => c.id);
    expect(new Set(seen)).toEqual(new Set(ids));
  });

  it("finds published lessons by title", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const me = asUser(t, tutor.id);

    const publishedId = await me.mutation(api.contents.createContent, {
      title: "Photosynthesis explained",
      description: "How plants make food",
      videoUrl: VIDEO_URL,
    });
    await me.mutation(api.contents.setContentStatus, {
      contentId: publishedId,
      status: "published",
    });

    const draftId = await me.mutation(api.contents.createContent, {
      title: "Photosynthesis worksheet",
      description: "Not ready yet",
      videoUrl: VIDEO_URL,
    });

    const results = await t.query(api.contents.searchContents, {
      searchTerm: "Photosynthesis",
      paginationOpts: PAGE,
    });
    const ids = results.page.map((c) => c.id);
    expect(ids).toContain(publishedId);
    expect(ids).not.toContain(draftId);
  });
});

describe("content validation", () => {
  it("rejects a title that is too short or too long", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const me = asUser(t, tutor.id);

    await expectAppError(
      me.mutation(api.contents.createContent, {
        title: "ab",
        description: "Too short",
        videoUrl: VIDEO_URL,
      }),
      "invalid_input",
    );

    await expectAppError(
      me.mutation(api.contents.createContent, {
        title: "x".repeat(121),
        description: "Too long",
        videoUrl: VIDEO_URL,
      }),
      "invalid_input",
    );
  });

  it("rejects a video link from an unsupported host", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const me = asUser(t, tutor.id);

    // Not a known provider and not a direct media file.
    await expectAppError(
      me.mutation(api.contents.createContent, {
        title: "A lesson",
        description: "With a bad link",
        videoUrl: "https://not-a-video-host.example/clip",
      }),
      "invalid_input",
    );

    // Plain HTTP is only allowed for local development hosts.
    await expectAppError(
      me.mutation(api.contents.createContent, {
        title: "A lesson",
        description: "With an insecure link",
        videoUrl: "http://not-a-video-host.example/clip.mp4",
      }),
      "invalid_input",
    );

    // A link that is not a URL at all.
    await expectAppError(
      me.mutation(api.contents.createContent, {
        title: "A lesson",
        description: "With a broken link",
        videoUrl: "definitely not a url",
      }),
      "invalid_input",
    );
  });

  it("accepts a direct media file from any host", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const me = asUser(t, tutor.id);

    const contentId = await me.mutation(api.contents.createContent, {
      title: "Self hosted lesson",
      description: "A direct video file",
      videoUrl: "https://not-a-video-host.example/clip.mp4",
    });
    const detail = await me.query(api.contents.getContent, { contentId });
    expect(detail?.video?.url).toBe("https://not-a-video-host.example/clip.mp4");
  });

  it("accepts the supported video providers", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const me = asUser(t, tutor.id);

    const urls = [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://vimeo.com/123456789",
      "https://stream.mux.com/playback-id.m3u8",
      "https://customer-abc.cloudflarestream.com/abc/video.mp4",
      "https://bucket.s3.amazonaws.com/lesson.mp4",
    ];

    for (const [index, videoUrl] of urls.entries()) {
      const contentId = await me.mutation(api.contents.createContent, {
        title: `Supported video ${index}`,
        description: "A lesson with a valid link",
        videoUrl,
      });
      const detail = await me.query(api.contents.getContent, { contentId });
      expect(detail?.video?.url).toBeTruthy();
    }
  });

  it("always creates a lesson as a draft", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const me = asUser(t, tutor.id);

    const contentId = await me.mutation(api.contents.createContent, {
      title: "A fresh lesson",
      description: "Nobody has published it",
      videoUrl: VIDEO_URL,
    });
    const detail = await me.query(api.contents.getContent, { contentId });
    expect(detail?.status).toBe("draft");
  });
});

describe("deleting a lesson", () => {
  it("removes the likes, comments and saved rows that point at it", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const student = await seedUser(t, { role: "user" });
    const me = asUser(t, student.id);

    const contentId = await asUser(t, tutor.id).mutation(
      api.contents.createContent,
      { title: "Fractions", description: "Halves and quarters", videoUrl: VIDEO_URL },
    );
    await asUser(t, tutor.id).mutation(api.contents.setContentStatus, {
      contentId,
      status: "published",
    });

    await me.mutation(api.likes.likeContent, { contentId });
    await me.mutation(api.savedContents.saveContent, { contentId });
    await me.mutation(api.comments.addComment, { contentId, text: "Nice" });

    await asUser(t, tutor.id).mutation(api.contents.deleteContent, { contentId });

    const remaining = await t.run(async (ctx) => ({
      likes: await ctx.db.query("likes").collect(),
      comments: await ctx.db.query("comments").collect(),
      saved: await ctx.db.query("savedContents").collect(),
      contents: await ctx.db.query("contents").collect(),
    }));
    expect(remaining.likes).toHaveLength(0);
    expect(remaining.comments).toHaveLength(0);
    expect(remaining.saved).toHaveLength(0);
    expect(remaining.contents).toHaveLength(0);
  });
});

describe("profile mutations", () => {
  it("never raises a user's own role", async () => {
    const t = createTest();
    const student = await seedUser(t, { role: "user" });
    const me = asUser(t, student.id);

    const profile = await me.mutation(api.users.ensureMyProfile, {});
    expect(profile.role).toBe("user");

    // `role` is not an accepted argument at all.
    await expect(
      me.mutation(api.users.updateMyProfile, { role: "admin" } as never),
    ).rejects.toThrow();

    // Nor is `email`.
    await expect(
      me.mutation(api.users.updateMyProfile, { email: "hijack@example.com" } as never),
    ).rejects.toThrow();
  });

  it("gives a brand new account the lowest privilege", async () => {
    const t = createTest();
    const id = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "Fresh Account" }),
    );

    const profile = await asUser(t, id).mutation(api.users.ensureMyProfile, {});
    expect(profile.role).toBe("user");
  });

  it("keeps a name that is already set", async () => {
    const t = createTest();
    const student = await seedUser(t, { name: "Ada Lovelace" });

    const profile = await asUser(t, student.id).mutation(api.users.ensureMyProfile, {});
    expect(profile.name).toBe("Ada Lovelace");
  });

  it("trims values and rejects an unusable avatar", async () => {
    const t = createTest();
    const student = await seedUser(t, { role: "user" });
    const me = asUser(t, student.id);

    const profile = await me.mutation(api.users.updateMyProfile, {
      name: "  Grace Hopper  ",
    });
    expect(profile.name).toBe("Grace Hopper");

    await expectAppError(
      me.mutation(api.users.updateMyProfile, { avatar: "not-a-url" }),
      "invalid_input",
    );
    await expectAppError(
      me.mutation(api.users.updateMyProfile, { avatar: "javascript:alert(1)" }),
      "invalid_input",
    );
  });
});
