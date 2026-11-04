"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import type { Status } from "@/generated/prisma/enums";
import { listMessageIds } from "@/lib/gmail";
import { estimateCost, MODEL } from "@/lib/model";
import { resolveReviewItem, type ReviewChoice } from "@/lib/review";
import { COLUMNS } from "@/lib/status";
import { listNewMessageIds } from "@/lib/sync";
import { requestStop } from "@/lib/sync-control";
import { describeError } from "@/lib/sync-errors";

export async function moveApplication(id: string, status: Status) {
  if (!COLUMNS.some((column) => column.status === status)) throw new Error("Unknown status");
  await db.application.update({ where: { id }, data: { status, manuallyMoved: true } });
  revalidatePath("/");
}

export async function saveNotes(id: string, notes: string) {
  await db.application.update({ where: { id }, data: { notes } });
  revalidatePath("/");
}

export async function deleteApplication(id: string) {
  await db.application.delete({ where: { id } });
  revalidatePath("/");
}

export async function dismissReview(messageId: string) {
  await db.processedEmail.update({ where: { messageId }, data: { reviewed: true } });
  revalidatePath("/");
}

export async function resolveReview(messageId: string, choice: ReviewChoice) {
  if (!COLUMNS.some((column) => column.status === choice.status)) throw new Error("Unknown status");
  await resolveReviewItem(messageId, choice);
  revalidatePath("/");
}

/** What a sync would read and roughly cost. Never calls Claude. */
export async function previewSync() {
  const account = await db.gmailAccount.findUnique({ where: { id: 1 } });
  if (!account) return { error: "Gmail is not connected" };

  try {
    const ids = await listNewMessageIds(
      { listMessageIds: (since) => listMessageIds(account.refreshToken, since) },
      account.lastSyncAt,
      new Date(),
    );
    return { count: ids.length, model: MODEL, cost: estimateCost(ids.length) };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function stopSync() {
  requestStop();
}

export async function disconnectGmail() {
  requestStop();
  await db.gmailAccount.deleteMany();
  revalidatePath("/");
}
