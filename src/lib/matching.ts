import { UNKNOWN_ROLE } from "./status";

export interface MatchableCard {
  id: string;
  company: string;
  role: string;
  status: string;
  gmailThreadId: string | null;
}

export interface MatchQuery {
  company: string | null;
  role: string | null;
  threadId: string;
}

export type MatchResult<T> =
  | { kind: "match"; card: T }
  | { kind: "ambiguous" }
  | { kind: "none" };

const COMPANY_SUFFIXES =
  /\b(inc|incorporated|llc|ltd|limited|gmbh|ag|bv|plc|corp|corporation|co|company|sa|sas|srl|pty)\b/g;

const words = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#]+/gu, " ")
    .trim();

export function normalizeCompany(company: string) {
  return words(company).replace(COMPANY_SUFFIXES, " ").replace(/\s+/g, " ").trim();
}

/** "Stripe, Inc." = "Stripe", and "Meta" = "Meta Platforms". */
export function sameCompany(a: string, b: string) {
  const [x, y] = [normalizeCompany(a), normalizeCompany(b)];
  if (!x || !y) return false;
  return x === y || x.startsWith(`${y} `) || y.startsWith(`${x} `);
}

export function sameRole(a: string, b: string) {
  return words(a) === words(b);
}

/** Exact, or one title contains all the words of the other. */
export function similarRole(a: string, b: string) {
  const [x, y] = [new Set(words(a).split(" ")), new Set(words(b).split(" "))];
  const [small, large] = x.size <= y.size ? [x, y] : [y, x];
  return small.size > 0 && [...small].every((word) => large.has(word));
}

function byThread<T extends MatchableCard>(cards: T[], query: MatchQuery) {
  // A shared no-reply address can thread two companies together, so a
  // conflicting company name overrides the thread.
  return cards.find(
    (card) =>
      card.gmailThreadId === query.threadId &&
      (!query.company || sameCompany(card.company, query.company)),
  );
}

/** Applied: does a card already exist for this company and role? */
export function findExistingCard<T extends MatchableCard>(cards: T[], query: MatchQuery): T | null {
  const threadCard = byThread(cards, query);
  if (threadCard) return threadCard;
  if (!query.company) return null;

  const atCompany = cards.filter((card) => sameCompany(card.company, query.company!));
  if (!query.role) return atCompany[0] ?? null;
  return (
    atCompany.find((card) => sameRole(card.role, query.role!)) ??
    atCompany.find((card) => card.role === UNKNOWN_ROLE) ??
    null
  );
}

/**
 * Rejected: which card is this about? Deliberately conservative. Moving the
 * wrong card is worse than asking, so anything unclear returns ambiguous/none.
 */
export function findRejectionTarget<T extends MatchableCard>(
  cards: T[],
  query: MatchQuery,
): MatchResult<T> {
  const threadCard = byThread(cards, query);
  if (threadCard) return { kind: "match", card: threadCard };
  if (!query.company) return { kind: "none" };

  const atCompany = cards.filter((card) => sameCompany(card.company, query.company!));
  const open = atCompany.filter((card) => card.status !== "REJECTED");

  const pick = (pool: T[]): MatchResult<T> | null => {
    if (pool.length === 1) return { kind: "match", card: pool[0] };
    if (pool.length > 1) return { kind: "ambiguous" };
    return null;
  };

  if (!query.role) {
    return pick(open) ?? pick(atCompany) ?? { kind: "none" };
  }

  const role = query.role;
  const exact = (pool: T[]) => pool.filter((card) => sameRole(card.role, role));
  const similar = (pool: T[]) =>
    pool.filter((card) => card.role === UNKNOWN_ROLE || similarRole(card.role, role));

  return (
    pick(exact(open)) ??
    pick(similar(open)) ??
    pick(exact(atCompany)) ??
    pick(similar(atCompany)) ?? { kind: "none" }
  );
}
