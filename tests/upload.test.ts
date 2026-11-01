import { describe, expect, it } from "vitest";
import { api, asUser, createTest, seedUser } from "./setup";
import type { Id } from "../convex/_generated/dataModel";
import type { AppErrorCode } from "../convex/lib/errors";

/**
 * Assert that a Convex call fails with one of NorthEd's own error codes.
 */
async function expectAppError(
  call: Promise<unknown>,
  code: AppErrorCode,
): Promise<void> {
  await expect(call).rejects.toMatchObject({
    data: { code },
  });
}

/**
 * Put a file in Convex file storage and return its id.
 *
 * This is what the browser does when it POSTs a file to the upload URL, so
 * the tests work with a real storage id.
 */
async function storeFile(
  t: ReturnType<typeof createTest>,
  contentType: string,
  size = 1024,
): Promise<Id<"_storage">> {
  return await t.run(async (ctx) => {
    const blob = new Blob([new Uint8Array(size)], { type: contentType });
    return await ctx.storage.store(blob);
  });
}

describe("upload urls", () => {
  it("are only handed to tutors", async () => {
    const t = createTest();
    const learner = await seedUser(t);

    await expectAppError(
      asUser(t, learner.id).mutation(api.storage.generateUploadUrl, {
        kind: "video",
        contentType: "video/mp4",
        size: 1024,
      }),
      "forbidden",
    );
  });

  it("are refused to anonymous visitors", async () => {
    const t = createTest();

    await expectAppError(
      t.mutation(api.storage.generateUploadUrl, {
        kind: "video",
        contentType: "video/mp4",
        size: 1024,
      }),
      "unauthenticated",
    );
  });

  it("reject a file type the app does not accept", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });

    await expectAppError(
      asUser(t, tutor.id).mutation(api.storage.generateUploadUrl, {
        kind: "video",
        contentType: "application/pdf",
        size: 1024,
      }),
      "invalid_input",
    );
  });

  it("reject a file that is too large", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });

    await expectAppError(
      asUser(t, tutor.id).mutation(api.storage.generateUploadUrl, {
        kind: "video",
        contentType: "video/mp4",
        size: 21 * 1024 * 1024,
      }),
      "invalid_input",
    );
  });

  it("are handed to a tutor for an acceptable file", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });

    const url = await asUser(t, tutor.id).mutation(
      api.storage.generateUploadUrl,
      { kind: "video", contentType: "video/mp4", size: 1024 },
    );

    expect(url).toContain("https://");
  });
});

describe("uploaded lessons", () => {
  it("accept a lesson whose video was uploaded by its author", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const me = asUser(t, tutor.id);

    const storageId = await storeFile(t, "video/mp4");
    await me.mutation(api.storage.registerUpload, {
      storageId,
      kind: "video",
      contentType: "video/mp4",
      size: 1024,
    });

    const contentId = await me.mutation(api.contents.createContent, {
      title: "An uploaded lesson",
      description: "Straight from my computer",
      videoStorageId: storageId,
    });

    const detail = await me.query(api.contents.getContent, { contentId });
    expect(detail?.video?.kind).toBe("file");
    expect(detail?.video?.provider).toBe("upload");
    expect(detail?.video?.url).toContain("/api/storage/");
  });

  it("refuse a lesson that points at a file nobody uploaded", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const me = asUser(t, tutor.id);

    const storageId = await storeFile(t, "video/mp4");

    await expectAppError(
      me.mutation(api.contents.createContent, {
        title: "A borrowed lesson",
        description: "Pointing at a file I did not upload",
        videoStorageId: storageId,
      }),
      "not_found",
    );
  });

  it("refuse a lesson that points at another tutor's file", async () => {
    const t = createTest();
    const owner = await seedUser(t, { role: "tutor" });
    const other = await seedUser(t, { role: "tutor" });

    const storageId = await storeFile(t, "video/mp4");
    await asUser(t, owner.id).mutation(api.storage.registerUpload, {
      storageId,
      kind: "video",
      contentType: "video/mp4",
      size: 1024,
    });

    await expectAppError(
      asUser(t, other.id).mutation(api.contents.createContent, {
        title: "A borrowed lesson",
        description: "Pointing at somebody else's file",
        videoStorageId: storageId,
      }),
      "forbidden",
    );
  });

  it("refuse a video file used as a thumbnail", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const me = asUser(t, tutor.id);

    const storageId = await storeFile(t, "video/mp4");
    await me.mutation(api.storage.registerUpload, {
      storageId,
      kind: "video",
      contentType: "video/mp4",
      size: 1024,
    });

    await expectAppError(
      me.mutation(api.contents.createContent, {
        title: "A confused lesson",
        description: "A video where a thumbnail belongs",
        videoStorageId: storageId,
        thumbnailStorageId: storageId,
      }),
      "invalid_input",
    );
  });

  it("need exactly one video source", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const me = asUser(t, tutor.id);

    const storageId = await storeFile(t, "video/mp4");
    await me.mutation(api.storage.registerUpload, {
      storageId,
      kind: "video",
      contentType: "video/mp4",
      size: 1024,
    });

    await expectAppError(
      me.mutation(api.contents.createContent, {
        title: "Both at once",
        description: "A link and an upload",
        videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        videoStorageId: storageId,
      }),
      "invalid_input",
    );

    await expectAppError(
      me.mutation(api.contents.createContent, {
        title: "Neither",
        description: "No video at all",
      }),
      "invalid_input",
    );
  });

  it("are listed in the feed with the upload as their video", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const me = asUser(t, tutor.id);

    const storageId = await storeFile(t, "video/mp4");
    await me.mutation(api.storage.registerUpload, {
      storageId,
      kind: "video",
      contentType: "video/mp4",
      size: 1024,
    });

    const contentId = await me.mutation(api.contents.createContent, {
      title: "An uploaded lesson",
      description: "Straight from my computer",
      videoStorageId: storageId,
    });
    await me.mutation(api.contents.setContentStatus, {
      contentId,
      status: "published",
    });

    const feed = await me.query(api.contents.listPublished, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    const lesson = feed.page.find((item) => item.id === contentId);
    expect(lesson?.videoProvider).toBe("upload");
  });

  it("delete the file when the lesson is deleted", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const me = asUser(t, tutor.id);

    const storageId = await storeFile(t, "video/mp4");
    await me.mutation(api.storage.registerUpload, {
      storageId,
      kind: "video",
      contentType: "video/mp4",
      size: 1024,
    });

    const contentId = await me.mutation(api.contents.createContent, {
      title: "A temporary lesson",
      description: "Gone in a moment",
      videoStorageId: storageId,
    });

    await me.mutation(api.contents.deleteContent, { contentId });

    const stillThere = await t.run(async (ctx) => {
      return await ctx.db.system.get("_storage", storageId);
    });
    expect(stillThere).toBeNull();
  });
});

describe("uploaded files", () => {
  it("cannot back two lessons at once", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const me = asUser(t, tutor.id);

    const storageId = await storeFile(t, "video/mp4");
    await me.mutation(api.storage.registerUpload, {
      storageId,
      kind: "video",
      contentType: "video/mp4",
      size: 1024,
    });

    await me.mutation(api.contents.createContent, {
      title: "The first lesson",
      description: "Uses the file",
      videoStorageId: storageId,
    });

    await expectAppError(
      me.mutation(api.contents.createContent, {
        title: "The second lesson",
        description: "Wants the same file",
        videoStorageId: storageId,
      }),
      "invalid_input",
    );
  });

  it("can still be kept when the lesson is edited", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const me = asUser(t, tutor.id);

    const storageId = await storeFile(t, "video/mp4");
    await me.mutation(api.storage.registerUpload, {
      storageId,
      kind: "video",
      contentType: "video/mp4",
      size: 1024,
    });

    const contentId = await me.mutation(api.contents.createContent, {
      title: "An edited lesson",
      description: "Keeps its video",
      videoStorageId: storageId,
    });

    const updated = await me.mutation(api.contents.updateContent, {
      contentId,
      description: "A better description",
      videoStorageId: storageId,
    });

    expect(updated).toBe(contentId);
  });

  it("are recorded with the tutor who uploaded them", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const me = asUser(t, tutor.id);

    const storageId = await storeFile(t, "video/mp4");
    await me.mutation(api.storage.registerUpload, {
      storageId,
      kind: "video",
      contentType: "video/mp4",
      size: 1024,
    });

    const uploads = await t.run(async (ctx) => {
      return await ctx.db.query("uploads").collect();
    });

    expect(uploads).toHaveLength(1);
    expect(uploads[0]?.ownerId).toBe(tutor.id);
    expect(uploads[0]?.kind).toBe("video");
  });

  it("are cleaned up when the lesson they belong to is deleted", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const me = asUser(t, tutor.id);

    const storageId = await storeFile(t, "video/mp4");
    await me.mutation(api.storage.registerUpload, {
      storageId,
      kind: "video",
      contentType: "video/mp4",
      size: 1024,
    });

    const contentId = await me.mutation(api.contents.createContent, {
      title: "A short lived lesson",
      description: "Gone in a moment",
      videoStorageId: storageId,
    });

    await me.mutation(api.contents.deleteContent, { contentId });

    const uploads = await t.run(async (ctx) => {
      return await ctx.db.query("uploads").collect();
    });
    expect(uploads).toHaveLength(0);
  });
});
