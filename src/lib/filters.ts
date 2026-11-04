const HOUR = 60 * 60 * 1000;

export const DATE_RANGES = [
  { value: "all", label: "Any time", ms: null },
  { value: "24h", label: "Last 24 hours", ms: 24 * HOUR },
  { value: "7d", label: "Last 7 days", ms: 7 * 24 * HOUR },
  { value: "14d", label: "Last 2 weeks", ms: 14 * 24 * HOUR },
  { value: "30d", label: "Last 30 days", ms: 30 * 24 * HOUR },
] as const;

interface Filterable {
  company: string;
  role: string;
  source: string | null;
  notes: string;
  appliedAt: Date;
}

/** Every word must appear somewhere, so "acme engineer" finds that role at Acme. */
export function filterCards<T extends Filterable>(cards: T[], query: string, since: number | null) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return cards.filter((card) => {
    if (since !== null && card.appliedAt.getTime() < since) return false;
    const text = [card.company, card.role, card.source, card.notes].join(" ").toLowerCase();
    return words.every((word) => text.includes(word));
  });
}
