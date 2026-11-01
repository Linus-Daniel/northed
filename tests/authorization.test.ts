import { describe, expect, it } from "vitest";
import { api, asUser, createTest, seedUser } from "./setup";
import type { AppErrorCode } from "../convex/lib/errors";

/**
 * Assert that a Convex call fails with one of NorthEd's own error codes.
 *
 * Every protected function throws `ConvexError` with `{ code, message }`, so
 * the tests assert on the code rather than on the copy.
 */
async function expectAppError(
  call: Promise<unknown>,
  code: AppErrorCode,
): Promise<void> {
  await expect(call).rejects.toMatchObject({
    data: { code },
  });
}

const VIDEO_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

describe("anonymous visitors", () => {
  it("cannot like a lesson", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const contentId = await asUser(t, tutor.id).mutation(
      api.contents.createContent,
      { title: "Fractions", description: "Halves and quarters", videoUrl: VIDEO_URL },
    );

    await expectAppError(
      t.mutation(api.likes.likeContent, { contentId }),
      "unauthenticated",
    );
  });

  it("cannot comment on a lesson", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const contentId = await asUser(t, tutor.id).mutation(
      api.contents.createContent,
      { title: "Fractions", description: "Halves and quarters", videoUrl: VIDEO_URL },
    );

    await expectAppError(
      t.mutation(api.comments.addComment, { contentId, text: "Hello" }),
      "unauthenticated",
    );
  });

  it("cannot save a lesson", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const contentId = await asUser(t, tutor.id).mutation(
      api.contents.createContent,
      { title: "Fractions", description: "Halves and quarters", videoUrl: VIDEO_URL },
    );

    await expectAppError(
      t.mutation(api.savedContents.saveContent, { contentId }),
      "unauthenticated",
    );
  });

  it("can read published lessons", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const contentId = await asUser(t, tutor.id).mutation(
      api.contents.createContent,
      { title: "Fractions", description: "Halves and quarters", videoUrl: VIDEO_URL },
    );
    await asUser(t, tutor.id).mutation(api.contents.setContentStatus, {
      contentId,
      status: "published",
    });

    const feed = await t.query(api.contents.listPublished, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(feed.page.map((c) => c.id)).toContain(contentId);

    const detail = await t.query(api.contents.getContent, { contentId });
    expect(detail?.title).toBe("Fractions");
  });

  it("has no profile of its own", async () => {
    const t = createTest();
    expect(await t.query(api.users.getMyProfile, {})).toBeNull();
  });
});

describe("students", () => {
  it("cannot create content", async () => {
    const t = createTest();
    const student = await seedUser(t, { role: "user" });

    await expectAppError(
      asUser(t, student.id).mutation(api.contents.createContent, {
        title: "My own lesson",
        description: "Should not be allowed",
        videoUrl: VIDEO_URL,
      }),
      "forbidden",
    );
  });

  it("cannot list their own lessons (that list is for tutors)", async () => {
    const t = createTest();
    const student = await seedUser(t, { role: "user" });

    await expectAppError(
      asUser(t, student.id).query(api.contents.listMyContents, {
        paginationOpts: { numItems: 10, cursor: null },
      }),
      "forbidden",
    );
  });

  it("cannot change anybody's role", async () => {
    const t = createTest();
    const student = await seedUser(t, { role: "user" });
    const victim = await seedUser(t, { role: "user" });

    await expectAppError(
      asUser(t, student.id).mutation(api.users.setUserRole, {
        userId: victim.id,
        role: "admin",
      }),
      "forbidden",
    );
  });

  it("cannot list all users", async () => {
    const t = createTest();
    const student = await seedUser(t, { role: "user" });

    await expectAppError(
      asUser(t, student.id).query(api.users.listUsers, {
        paginationOpts: { numItems: 10, cursor: null },
      }),
      "forbidden",
    );
  });

  it("cannot look up accounts by email", async () => {
    const t = createTest();
    const student = await seedUser(t, { role: "user" });

    await expectAppError(
      asUser(t, student.id).query(api.users.findUserByEmail, {
        email: "someone@example.com",
      }),
      "forbidden",
    );
  });

  it("cannot raise their own role through the profile mutation", async () => {
    const t = createTest();
    const student = await seedUser(t, { role: "user" });

    // `updateMyProfile` only accepts the editable fields; `role` is rejected
    // by the argument validator before the handler runs.
    await expect(
      asUser(t, student.id).mutation(api.users.updateMyProfile, {
        role: "admin",
      } as never),
    ).rejects.toThrow();

    const profile = await asUser(t, student.id).query(api.users.getMyProfile, {});
    expect(profile?.role).toBe("user");
  });
});

describe("tutors", () => {
  it("can create, publish and archive their own lessons", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const me = asUser(t, tutor.id);

    const contentId = await me.mutation(api.contents.createContent, {
      title: "Newton's laws",
      description: "Motion and force",
      videoUrl: VIDEO_URL,
    });

    // New lessons start as drafts.
    const draft = await me.query(api.contents.getContent, { contentId });
    expect(draft?.status).toBe("draft");

    await me.mutation(api.contents.setContentStatus, {
      contentId,
      status: "published",
    });
    const published = await me.query(api.contents.getContent, { contentId });
    expect(published?.status).toBe("published");

    await me.mutation(api.contents.setContentStatus, {
      contentId,
      status: "archived",
    });
    const archived = await me.query(api.contents.getContent, { contentId });
    expect(archived?.status).toBe("archived");
  });

  it("cannot publish another tutor's lesson", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const other = await seedUser(t, { role: "tutor" });

    const contentId = await asUser(t, tutor.id).mutation(
      api.contents.createContent,
      { title: "Newton's laws", description: "Motion and force", videoUrl: VIDEO_URL },
    );

    await expectAppError(
      asUser(t, other.id).mutation(api.contents.setContentStatus, {
        contentId,
        status: "published",
      }),
      "forbidden",
    );
  });

  it("cannot update or delete another tutor's lesson", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const other = await seedUser(t, { role: "tutor" });

    const contentId = await asUser(t, tutor.id).mutation(
      api.contents.createContent,
      { title: "Newton's laws", description: "Motion and force", videoUrl: VIDEO_URL },
    );

    await expectAppError(
      asUser(t, other.id).mutation(api.contents.updateContent, {
        contentId,
        title: "Hijacked title",
      }),
      "forbidden",
    );

    await expectAppError(
      asUser(t, other.id).mutation(api.contents.deleteContent, { contentId }),
      "forbidden",
    );
  });

  it("cannot see another tutor's draft", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const other = await seedUser(t, { role: "tutor" });

    const contentId = await asUser(t, tutor.id).mutation(
      api.contents.createContent,
      { title: "Secret lesson", description: "Not ready yet", videoUrl: VIDEO_URL },
    );

    // The draft does not even leak its existence.
    const detail = await asUser(t, other.id).query(api.contents.getContent, {
      contentId,
    });
    expect(detail).toBeNull();

    const feed = await asUser(t, other.id).query(api.contents.listPublished, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(feed.page.map((c) => c.id)).not.toContain(contentId);

    await expectAppError(
      asUser(t, other.id).query(api.contents.listByAuthor, {
        authorId: tutor.id,
        includeUnpublished: true,
        paginationOpts: { numItems: 10, cursor: null },
      }),
      "forbidden",
    );
  });

  it("cannot promote themselves to administrator", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });

    await expectAppError(
      asUser(t, tutor.id).mutation(api.users.setUserRole, {
        userId: tutor.id,
        role: "admin",
      }),
      "forbidden",
    );
  });
});

describe("administrators", () => {
  it("can change a user's role", async () => {
    const t = createTest();
    const admin = await seedUser(t, { role: "admin" });
    const student = await seedUser(t, { role: "user" });

    const updated = await asUser(t, admin.id).mutation(api.users.setUserRole, {
      userId: student.id,
      role: "tutor",
    });
    expect(updated.role).toBe("tutor");
  });

  it("can manage any lesson, including another author's", async () => {
    const t = createTest();
    const admin = await seedUser(t, { role: "admin" });
    const tutor = await seedUser(t, { role: "tutor" });

    const contentId = await asUser(t, tutor.id).mutation(
      api.contents.createContent,
      { title: "Newton's laws", description: "Motion and force", videoUrl: VIDEO_URL },
    );

    await asUser(t, admin.id).mutation(api.contents.setContentStatus, {
      contentId,
      status: "published",
    });
    const published = await asUser(t, admin.id).query(api.contents.getContent, {
      contentId,
    });
    expect(published?.status).toBe("published");

    await asUser(t, admin.id).mutation(api.contents.deleteContent, { contentId });
    expect(
      await asUser(t, admin.id).query(api.contents.getContent, { contentId }),
    ).toBeNull();
  });

  it("can list all users and look them up by email", async () => {
    const t = createTest();
    const admin = await seedUser(t, { role: "admin" });
    const student = await seedUser(t, { email: "student@example.com" });

    const users = await asUser(t, admin.id).query(api.users.listUsers, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(users.page.map((u) => u.id)).toContain(student.id);

    const found = await asUser(t, admin.id).query(api.users.findUserByEmail, {
      email: "student@example.com",
    });
    expect(found).toBe(student.id);
  });
});

describe("comments", () => {
  it("can only be edited by their author or an administrator", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const student = await seedUser(t, { role: "user" });
    const other = await seedUser(t, { role: "user" });
    const admin = await seedUser(t, { role: "admin" });

    const contentId = await asUser(t, tutor.id).mutation(
      api.contents.createContent,
      { title: "Fractions", description: "Halves and quarters", videoUrl: VIDEO_URL },
    );
    await asUser(t, tutor.id).mutation(api.contents.setContentStatus, {
      contentId,
      status: "published",
    });

    const commentId = await asUser(t, student.id).mutation(
      api.comments.addComment,
      { contentId, text: "Clear explanation" },
    );

    await expectAppError(
      asUser(t, other.id).mutation(api.comments.editComment, {
        commentId,
        text: "Hijacked",
      }),
      "forbidden",
    );

    await expectAppError(
      asUser(t, other.id).mutation(api.comments.deleteComment, { commentId }),
      "forbidden",
    );

    // The author may edit their own comment.
    await asUser(t, student.id).mutation(api.comments.editComment, {
      commentId,
      text: "Edited by the author",
    });
    const comments = await asUser(t, student.id).query(api.comments.listComments, {
      contentId,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(comments.page[0]?.text).toBe("Edited by the author");

    // So may an administrator.
    await asUser(t, admin.id).mutation(api.comments.deleteComment, { commentId });
    const afterDelete = await asUser(t, student.id).query(
      api.comments.listComments,
      { contentId, paginationOpts: { numItems: 10, cursor: null } },
    );
    expect(afterDelete.page).toHaveLength(0);
  });

  it("cannot be posted on a lesson that is not published", async () => {
    const t = createTest();
    const tutor = await seedUser(t, { role: "tutor" });
    const student = await seedUser(t, { role: "user" });

    const contentId = await asUser(t, tutor.id).mutation(
      api.contents.createContent,
      { title: "Draft lesson", description: "Not ready yet", videoUrl: VIDEO_URL },
    );

    await expectAppError(
      asUser(t, student.id).mutation(api.comments.addComment, {
        contentId,
        text: "Anybody there?",
      }),
      "forbidden",
    );
  });
});

describe("profile privacy", () => {
  it("never exposes email, phone or address to other users", async () => {
    const t = createTest();
    const student = await seedUser(t, { name: "Ada Lovelace" });
    await asUser(t, student.id).mutation(api.users.updateMyProfile, {
      phone: "+44 20 7946 0000",
      address: "12 Analytical Engine Way",
    });

    const profile = await asUser(t, student.id).query(api.users.getMyProfile, {});
    expect(profile?.email).toContain("@");
    expect(profile?.phone).toBe("+44 20 7946 0000");

    const publicProfile = await t.query(api.users.getPublicUser, {
      userId: student.id,
    });
    expect(publicProfile?.name).toBe("Ada Lovelace");
    expect(publicProfile).not.toHaveProperty("email");
    expect(publicProfile).not.toHaveProperty("phone");
    expect(publicProfile).not.toHaveProperty("address");
  });
});
