import type { Application } from "@/generated/prisma/client";
import type { ReviewOutcome } from "@/lib/status";

export type Card = Application & { threadUrl: string | null };

export interface ReviewItem {
  messageId: string;
  subject: string;
  sender: string;
  company: string | null;
  role: string | null;
  outcome: ReviewOutcome;
  classification: string;
  /** Cards this email could belong to. */
  cards: { id: string; label: string }[];
  /** The card it is already linked to, if any. */
  cardId: string | null;
  threadUrl: string;
}

export const formatDate = (date: Date) =>
  date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
