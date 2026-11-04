import { db } from "./db";
import type { Status } from "@/generated/prisma/enums";
import { UNKNOWN_ROLE } from "./status";

export interface ReviewChoice {
  status: Status;
  /** The card this email belongs to, or null to create one. */
  cardId: string | null;
  company: string;
  role: string;
}

/** Applies the user's decision on a Needs review email and clears it from the list. */
export async function resolveReviewItem(messageId: string, choice: ReviewChoice) {
  const company = choice.company.trim();
  if (!choice.cardId && !company) throw new Error("A new card needs a company");

  await db.$transaction(async (tx) => {
    const email = await tx.processedEmail.findUniqueOrThrow({ where: { messageId } });
    const card = choice.cardId
      ? await tx.application.update({
          where: { id: choice.cardId },
          data: { status: choice.status, manuallyMoved: true },
        })
      : await tx.application.create({
          data: {
            company,
            role: choice.role.trim() || UNKNOWN_ROLE,
            status: choice.status,
            // Left false in Applied, so a later rejection email can still move it.
            manuallyMoved: choice.status !== "APPLIED",
            appliedAt: email.receivedAt,
            gmailThreadId: email.threadId,
            lastEmailAt: email.receivedAt,
          },
        });
    await tx.processedEmail.update({
      where: { messageId },
      data: { reviewed: true, applicationId: card.id },
    });
  });
}
