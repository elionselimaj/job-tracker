import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Classification, ClassifyResult } from "./classify";
import { db } from "./db";
import type { EmailMessage } from "./gmail";
import { resolveReviewItem } from "./review";
import { listNewMessageIds, runSync, type SyncDeps } from "./sync";

const TEST_DB = "prisma/test.db";

beforeAll(() => {
  rmSync(TEST_DB, { force: true });
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: `file:./${TEST_DB}` },
    stdio: "ignore",
  });
});

afterAll(async () => {
  await db.$disconnect();
  rmSync(TEST_DB, { force: true });
});

beforeEach(async () => {
  await db.processedEmail.deleteMany();
  await db.application.deleteMany();
  await db.gmailAccount.deleteMany();
  await db.gmailAccount.create({ data: { email: "me@example.com", refreshToken: "r" } });
});

type Fixture = { id: string; thread?: string; sent?: boolean; result: ClassifyResult | Error };

const applied = (company: string | null, role: string | null, source = "LinkedIn"): Classification => ({
  classification: "applied",
  company,
  role,
  source,
});
const rejected = (company: string | null, role: string | null = null): Classification => ({
  classification: "rejected",
  company,
  role,
  source: null,
});
const other: Classification = { classification: "other", company: null, role: null, source: null };

function deps(fixtures: Fixture[]) {
  const byId = new Map(fixtures.map((fixture, index) => [fixture.id, { fixture, index }]));
  const classify = vi.fn(async (email: EmailMessage) => {
    const { result } = byId.get(email.messageId)!.fixture;
    if (result instanceof Error) throw result;
    return result;
  });
  const value: SyncDeps = {
    listMessageIds: async () => fixtures.map((fixture) => fixture.id),
    fetchMessage: async (id) => {
      const { fixture, index } = byId.get(id)!;
      return {
        messageId: id,
        threadId: fixture.thread ?? `thread-${id}`,
        subject: `Subject ${id}`,
        sender: "jobs@example.com",
        recipient: "me@example.com",
        sent: fixture.sent ?? false,
        receivedAt: new Date(Date.UTC(2026, 0, 1 + index)),
        body: "body",
      };
    },
    classify,
  };
  return { value, classify };
}

const sync = (fixtures: Fixture[], lastSyncAt: Date | null = null) =>
  runSync(deps(fixtures).value, lastSyncAt, () => {});

describe("runSync", () => {
  it("creates a card for an application", async () => {
    const summary = await sync([{ id: "a", result: applied("Acme", "Engineer") }]);
    expect(summary).toMatchObject({ scanned: 1, created: 1 });
    expect(await db.application.findFirstOrThrow()).toMatchObject({
      company: "Acme",
      role: "Engineer",
      source: "LinkedIn",
      status: "APPLIED",
      manuallyMoved: false,
      gmailThreadId: "thread-a",
      appliedAt: new Date(Date.UTC(2026, 0, 1)),
    });
  });

  it("does not create a duplicate for the same company and role", async () => {
    await sync([
      { id: "a", result: applied("Acme Inc.", "Engineer") },
      { id: "b", result: applied("ACME", "engineer") },
    ]);
    expect(await db.application.count()).toBe(1);
  });

  it("moves the matching card to Rejected, even within one sync", async () => {
    const summary = await sync([
      { id: "a", result: applied("Acme", "Engineer") },
      { id: "b", result: rejected("Acme") },
    ]);
    expect(summary.rejected).toBe(1);
    expect((await db.application.findFirstOrThrow()).status).toBe("REJECTED");
  });

  it("ignores everything classified as other", async () => {
    await sync([{ id: "a", result: other }]);
    expect(await db.application.count()).toBe(0);
  });

  it.each(["IN_PROGRESS", "INTERVIEW", "OFFER"] as const)(
    "never moves a card into %s and leaves it alone on an applied email",
    async (status) => {
      await db.application.create({
        data: { company: "Acme", role: "Engineer", status, appliedAt: new Date() },
      });
      await sync([{ id: "a", result: applied("Acme", "Engineer") }]);
      expect((await db.application.findFirstOrThrow()).status).toBe(status);
    },
  );

  it("moves a card from a later column when sync placed it there", async () => {
    await db.application.create({
      data: { company: "Acme", role: "Engineer", status: "INTERVIEW", appliedAt: new Date() },
    });
    await sync([{ id: "a", result: rejected("Acme") }]);
    expect((await db.application.findFirstOrThrow()).status).toBe("REJECTED");
  });

  it("leaves a manually moved card in place and asks for review", async () => {
    await db.application.create({
      data: {
        company: "Acme",
        role: "Engineer",
        status: "OFFER",
        manuallyMoved: true,
        appliedAt: new Date(),
      },
    });
    const summary = await sync([{ id: "a", result: rejected("Acme") }]);
    expect(summary.needsReview).toBe(1);
    expect((await db.application.findFirstOrThrow()).status).toBe("OFFER");
    expect((await db.processedEmail.findFirstOrThrow()).outcome).toBe("kept_manual");
  });

  it("leaves a card in Close/Hold in place and asks for review", async () => {
    await db.application.create({
      data: {
        company: "Acme",
        role: "Engineer",
        appliedAt: new Date(),
        status: "CLOSE_HOLD",
        manuallyMoved: true,
      },
    });
    const summary = await sync([{ id: "a", result: rejected("Acme", "Engineer") }]);
    expect(summary).toMatchObject({ needsReview: 1, rejected: 0 });
    expect((await db.application.findFirstOrThrow()).status).toBe("CLOSE_HOLD");
  });

  it("does not create a card for a rejection with no match", async () => {
    await sync([{ id: "a", result: rejected("Acme") }]);
    expect(await db.application.count()).toBe(0);
    expect((await db.processedEmail.findFirstOrThrow()).outcome).toBe("no_match");
  });

  it("does not classify the same email twice", async () => {
    const fixtures = [{ id: "a", result: applied("Acme", "Engineer") }];
    await sync(fixtures);
    const second = deps(fixtures);
    await runSync(second.value, null, () => {});
    expect(second.classify).not.toHaveBeenCalled();
  });

  it("stops on an API failure, keeps earlier work and retries the rest next time", async () => {
    const failing = [
      { id: "a", result: applied("Acme", "Engineer") },
      { id: "b", result: new Error("overloaded") },
      { id: "c", result: rejected("Acme") },
    ];
    await expect(sync(failing)).rejects.toThrow("overloaded");

    expect(await db.processedEmail.count()).toBe(1);
    expect((await db.application.findFirstOrThrow()).status).toBe("APPLIED");
    expect((await db.gmailAccount.findFirstOrThrow()).lastSyncAt).toBeNull();

    await sync([
      { id: "a", result: applied("Acme", "Engineer") },
      { id: "b", result: other },
      { id: "c", result: rejected("Acme") },
    ]);
    expect((await db.application.findFirstOrThrow()).status).toBe("REJECTED");
    expect((await db.gmailAccount.findFirstOrThrow()).lastSyncAt).not.toBeNull();
  });

  it("records an unusable answer for review without blocking the sync", async () => {
    const summary = await sync([
      { id: "a", result: null },
      { id: "b", result: applied("Acme", "Engineer") },
    ]);
    expect(summary).toMatchObject({ scanned: 2, created: 1, needsReview: 1 });
  });

  it("asks Gmail for mail since the last sync, with a small overlap", async () => {
    const { value } = deps([]);
    const list = vi.spyOn(value, "listMessageIds");
    const last = new Date("2026-03-01T12:00:00Z");
    await runSync(value, last, () => {});
    expect(list).toHaveBeenCalledWith(new Date("2026-03-01T11:55:00Z"));
  });

  it("creates a card for an application the user emailed themselves", async () => {
    const summary = await sync([
      { id: "a", sent: true, result: applied("Acme", "Engineer", "Email") },
    ]);
    expect(summary).toMatchObject({ created: 1 });
    expect(await db.application.findFirstOrThrow()).toMatchObject({
      company: "Acme",
      source: "Email",
      status: "APPLIED",
    });
  });

  it("links a sent application and its confirmation to one card", async () => {
    await sync([
      { id: "a", sent: true, result: applied("Acme", "Engineer", "Email") },
      { id: "b", result: applied("Acme", "Engineer") },
    ]);
    expect(await db.application.count()).toBe(1);
  });

  it("never lets an email the user sent reject a card", async () => {
    await sync([
      { id: "a", result: applied("Acme", "Engineer") },
      { id: "b", sent: true, result: rejected("Acme") },
    ]);
    expect((await db.application.findFirstOrThrow()).status).toBe("APPLIED");
    expect((await db.processedEmail.findUniqueOrThrow({ where: { messageId: "b" } })).outcome).toBe(
      "ignored",
    );
  });

  it("stops between chunks, keeps the cursor and resumes on the next sync", async () => {
    const fixtures = Array.from({ length: 12 }, (_, index) => ({
      id: `m${index}`,
      result: other as ClassifyResult,
    }));
    const stop = new AbortController();
    const first = deps(fixtures);
    const summary = await runSync(
      first.value,
      null,
      (done) => {
        if (done === 5) stop.abort();
      },
      stop.signal,
    );

    expect(summary).toMatchObject({ scanned: 5, stopped: true });
    expect(first.classify).toHaveBeenCalledTimes(5);
    expect((await db.gmailAccount.findFirstOrThrow()).lastSyncAt).toBeNull();

    const second = deps(fixtures);
    expect(await runSync(second.value, null, () => {})).toMatchObject({
      scanned: 7,
      stopped: false,
    });
    expect(second.classify).toHaveBeenCalledTimes(7);
    expect((await db.gmailAccount.findFirstOrThrow()).lastSyncAt).not.toBeNull();
  });

  it("never calls Claude when stopped before the first chunk", async () => {
    const stop = new AbortController();
    stop.abort();
    const { value, classify } = deps([{ id: "a", result: other }]);
    const summary = await runSync(value, null, () => {}, stop.signal);
    expect(summary).toMatchObject({ scanned: 0, stopped: true });
    expect(classify).not.toHaveBeenCalled();
  });

  it("finishes cleanly if Gmail was disconnected on the last chunk", async () => {
    const { value } = deps([{ id: "a", result: other }]);
    const { classify } = value;
    value.classify = async (email) => {
      await db.gmailAccount.deleteMany();
      return classify(email);
    };
    const summary = await runSync(value, null, () => {});
    expect(summary).toMatchObject({ scanned: 1, stopped: false });
    expect(await db.gmailAccount.count()).toBe(0);
  });

  it("previews only the emails not processed yet, without classifying", async () => {
    await sync([{ id: "a", result: other }]);
    const { value, classify } = deps([
      { id: "a", result: other },
      { id: "b", result: other },
    ]);
    expect(await listNewMessageIds(value, null, new Date())).toEqual(["b"]);
    expect(classify).not.toHaveBeenCalled();
  });
});

describe("resolveReviewItem", () => {
  const choice = { company: "", role: "", cardId: null };
  const reviewed = (messageId: string) =>
    db.processedEmail.findUniqueOrThrow({ where: { messageId } });

  it("creates a rejected card for a rejection that matched nothing", async () => {
    await sync([{ id: "a", result: rejected("Acme", "Engineer") }]);
    await resolveReviewItem("a", { ...choice, status: "REJECTED", company: " Acme ", role: "Engineer" });

    const card = await db.application.findFirstOrThrow();
    expect(card).toMatchObject({ company: "Acme", role: "Engineer", status: "REJECTED", manuallyMoved: true });
    expect(await reviewed("a")).toMatchObject({ reviewed: true, applicationId: card.id });
  });

  it("uses a placeholder when no role is given", async () => {
    await sync([{ id: "a", result: rejected("Acme") }]);
    await resolveReviewItem("a", { ...choice, status: "REJECTED", company: "Acme" });
    expect((await db.application.findFirstOrThrow()).role).toBe("Unknown role");
  });

  it("sets any status on an existing card and keeps sync away from it", async () => {
    await sync([
      { id: "a", result: applied("Acme", "Engineer") },
      { id: "b", result: rejected("Acme") },
    ]);
    const { id } = await db.application.findFirstOrThrow();
    await resolveReviewItem("b", { ...choice, status: "INTERVIEW", cardId: id });
    expect(await db.application.findFirstOrThrow()).toMatchObject({
      status: "INTERVIEW",
      manuallyMoved: true,
    });
    expect(await db.application.count()).toBe(1);
  });

  it("lets a later rejection move a new card left in Applied", async () => {
    await sync([{ id: "a", result: null }]);
    await resolveReviewItem("a", { ...choice, status: "APPLIED", company: "Acme", role: "Engineer" });
    await sync([{ id: "b", result: rejected("Acme", "Engineer") }]);
    expect((await db.application.findFirstOrThrow()).status).toBe("REJECTED");
  });

  it("refuses a new card with no company and changes nothing", async () => {
    await sync([{ id: "a", result: null }]);
    await expect(
      resolveReviewItem("a", { ...choice, status: "REJECTED", company: "  " }),
    ).rejects.toThrow("needs a company");
    expect(await db.application.count()).toBe(0);
    expect((await reviewed("a")).reviewed).toBe(false);
  });
});
