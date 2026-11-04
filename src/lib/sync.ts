import type { ClassifyResult } from "./classify";
import { db } from "./db";
import type { EmailMessage } from "./gmail";
import { findExistingCard, findRejectionTarget } from "./matching";
import { UNKNOWN_ROLE } from "./status";

const CHUNK_SIZE = 5;
// Gmail can index a message slightly after its timestamp. Re-listing a few
// minutes is free because processed messages are skipped.
const CURSOR_OVERLAP_MS = 5 * 60 * 1000;

export interface SyncDeps {
  listMessageIds(since: Date): Promise<string[]>;
  fetchMessage(id: string): Promise<EmailMessage>;
  classify(email: EmailMessage): Promise<ClassifyResult>;
}

export interface SyncSummary {
  scanned: number;
  created: number;
  rejected: number;
  needsReview: number;
  stopped: boolean;
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

function initialSince(now: Date) {
  const days = Number(process.env.INITIAL_SYNC_DAYS) || 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

async function touchCard(
  tx: Tx,
  card: { id: string; gmailThreadId: string | null; lastEmailAt: Date | null },
  email: EmailMessage,
  extra: { status?: "REJECTED" } = {},
) {
  await tx.application.update({
    where: { id: card.id },
    data: {
      ...extra,
      gmailThreadId: card.gmailThreadId ?? email.threadId,
      lastEmailAt:
        card.lastEmailAt && card.lastEmailAt > email.receivedAt
          ? card.lastEmailAt
          : email.receivedAt,
    },
  });
}

/** Applies one classified email and returns its outcome and linked card. */
async function applyResult(tx: Tx, email: EmailMessage, result: ClassifyResult) {
  if (!result) return { outcome: "unreadable" };
  if (result.classification === "other") return { outcome: "ignored" };
  // Quoting or forwarding a rejection must never move a card.
  if (email.sent && result.classification === "rejected") return { outcome: "ignored" };

  const cards = await tx.application.findMany();
  const query = { company: result.company, role: result.role, threadId: email.threadId };

  if (result.classification === "applied") {
    const existing = findExistingCard(cards, query);
    if (existing) {
      await touchCard(tx, existing, email);
      return { outcome: "linked", applicationId: existing.id };
    }
    if (!result.company) return { outcome: "missing_company" };

    const card = await tx.application.create({
      data: {
        company: result.company,
        role: result.role ?? UNKNOWN_ROLE,
        source: result.source,
        appliedAt: email.receivedAt,
        gmailThreadId: email.threadId,
        lastEmailAt: email.receivedAt,
      },
    });
    return { outcome: "created", applicationId: card.id };
  }

  const target = findRejectionTarget(cards, query);
  if (target.kind === "ambiguous") return { outcome: "ambiguous" };
  if (target.kind === "none") {
    return { outcome: result.company ? "no_match" : "missing_company" };
  }

  const { card } = target;
  if (card.status === "REJECTED") {
    await touchCard(tx, card, email);
    return { outcome: "already_rejected", applicationId: card.id };
  }
  if (card.manuallyMoved) {
    await touchCard(tx, card, email);
    return { outcome: "kept_manual", applicationId: card.id };
  }
  await touchCard(tx, card, email, { status: "REJECTED" });
  return { outcome: "moved", applicationId: card.id };
}

async function recordEmail(email: EmailMessage, result: ClassifyResult) {
  return db.$transaction(async (tx) => {
    const { outcome, applicationId } = await applyResult(tx, email, result);
    await tx.processedEmail.create({
      data: {
        messageId: email.messageId,
        threadId: email.threadId,
        subject: email.subject,
        sender: email.sender,
        receivedAt: email.receivedAt,
        classification: result?.classification ?? "unknown",
        company: result?.company,
        role: result?.role,
        outcome,
        applicationId,
      },
    });
    return outcome;
  });
}

/** The emails a sync would read. Only asks Gmail, so it costs nothing to call. */
export async function listNewMessageIds(
  deps: Pick<SyncDeps, "listMessageIds">,
  lastSyncAt: Date | null,
  now: Date,
) {
  const since = lastSyncAt
    ? new Date(lastSyncAt.getTime() - CURSOR_OVERLAP_MS)
    : initialSince(now);

  const listed = await deps.listMessageIds(since);
  const known = await db.processedEmail.findMany({
    where: { messageId: { in: listed } },
    select: { messageId: true },
  });
  const knownIds = new Set(known.map((email) => email.messageId));
  return listed.filter((id) => !knownIds.has(id));
}

/**
 * Emails are applied strictly oldest first, so an application is seen before
 * its rejection. If a call fails or the signal aborts, the sync stops there
 * without advancing the cursor; everything already recorded is kept and the
 * next sync resumes. An abort takes effect between chunks, because Claude calls
 * already sent are paid for either way.
 */
export async function runSync(
  deps: SyncDeps,
  lastSyncAt: Date | null,
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
) {
  const startedAt = new Date();
  const ids = await listNewMessageIds(deps, lastSyncAt, startedAt);

  const summary: SyncSummary = {
    scanned: 0,
    created: 0,
    rejected: 0,
    needsReview: 0,
    stopped: false,
  };
  onProgress(0, ids.length);

  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    if (signal?.aborted) return { ...summary, stopped: true };

    const emails = await Promise.all(ids.slice(i, i + CHUNK_SIZE).map(deps.fetchMessage));
    emails.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
    const results = await Promise.allSettled(emails.map(deps.classify));

    for (const [index, result] of results.entries()) {
      if (result.status === "rejected") throw result.reason;
      const outcome = await recordEmail(emails[index], result.value);
      summary.scanned += 1;
      if (outcome === "created") summary.created += 1;
      if (outcome === "moved") summary.rejected += 1;
      if (!["ignored", "created", "linked", "moved", "already_rejected"].includes(outcome)) {
        summary.needsReview += 1;
      }
      onProgress(summary.scanned, ids.length);
    }
  }

  // updateMany because Disconnect may have removed the account during the sync.
  await db.gmailAccount.updateMany({ where: { id: 1 }, data: { lastSyncAt: startedAt } });
  return summary;
}
