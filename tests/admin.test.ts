import { describe, expect, it } from "vitest";
import { api, asUser, createTest, internal, seedUser } from "./setup";
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

describe("first administrator bootstrap", () => {
  it("promotes a user while no administrator exists", async () => {
    const t = createTest();
    const user = await seedUser(t);

    await t.mutation(internal.admin.grantFirstAdmin, { userId: user.id });

    const profile = await t.query(api.users.getPublicUser, { userId: user.id });
    expect(profile?.role).toBe("admin");
  });

  it("refuses to promote anybody once an administrator exists", async () => {
    const t = createTest();
    const first = await seedUser(t);
    const second = await seedUser(t);

    await t.mutation(internal.admin.grantFirstAdmin, { userId: first.id });

    await expectAppError(
      t.mutation(internal.admin.grantFirstAdmin, { userId: second.id }),
      "conflict",
    );

    const profile = await t.query(api.users.getPublicUser, { userId: second.id });
    expect(profile?.role).toBe("user");
  });

  it("refuses a user that does not exist", async () => {
    const t = createTest();
    const user = await seedUser(t);
    const missing = await t.run(async (ctx) => {
      const doc = await ctx.db.insert("users", { name: "Ghost", email: "ghost@example.com" });
      await ctx.db.delete(doc);
      return doc;
    });

    await expectAppError(
      t.mutation(internal.admin.grantFirstAdmin, { userId: missing }),
      "not_found",
    );
    expect(user.id).not.toBe(missing);
  });
});

describe("role changes after the bootstrap", () => {
  it("lets an administrator promote a tutor", async () => {
    const t = createTest();
    const admin = await seedUser(t, { role: "admin" });
    const tutor = await seedUser(t);

    const updated = await asUser(t, admin.id).mutation(api.users.setUserRole, {
      userId: tutor.id,
      role: "tutor",
    });

    expect(updated.role).toBe("tutor");
  });

  it("never lets a normal user change a role", async () => {
    const t = createTest();
    const user = await seedUser(t);
    const other = await seedUser(t);

    await expectAppError(
      asUser(t, user.id).mutation(api.users.setUserRole, {
        userId: other.id,
        role: "admin",
      }),
      "forbidden",
    );
  });
});
