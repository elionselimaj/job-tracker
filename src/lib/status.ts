import type { Status } from "@/generated/prisma/enums";

export const COLUMNS: { status: Status; title: string; dot: string }[] = [
  { status: "APPLIED", title: "Applied", dot: "bg-sky-500" },
  { status: "IN_PROGRESS", title: "In progress", dot: "bg-amber-500" },
  { status: "INTERVIEW", title: "Interview", dot: "bg-violet-500" },
  { status: "OFFER", title: "Offer", dot: "bg-emerald-500" },
  { status: "REJECTED", title: "Rejected", dot: "bg-rose-500" },
  { status: "CLOSE_HOLD", title: "Close/Hold", dot: "bg-slate-500" },
];

export const UNKNOWN_ROLE = "Unknown role";

/** Sync outcomes that need a human decision, with how to describe them. */
export const REVIEW_OUTCOMES = {
  kept_manual: "Rejection email, but you moved this card by hand, so it stayed put",
  no_match: "Rejection email with no matching card",
  ambiguous: "Rejection email that could match several cards",
  missing_company: "Looks job-related, but no company could be identified",
  unreadable: "Claude could not classify this email",
} as const;

export type ReviewOutcome = keyof typeof REVIEW_OUTCOMES;
