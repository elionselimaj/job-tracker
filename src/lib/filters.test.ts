import { describe, expect, it } from "vitest";
import { filterCards } from "./filters";

const NOW = Date.UTC(2026, 10, 4);
const DAY = 24 * 60 * 60 * 1000;
const card = (company: string, role: string, daysAgo: number, source: string | null = null, notes = "") => ({
  company,
  role,
  source,
  notes,
  appliedAt: new Date(NOW - daysAgo * DAY),
});
const cards = [
  card("Acme", "Backend Engineer", 0.5, "LinkedIn"),
  card("Globex", "Product Designer", 5, "Email", "met Dana at a meetup"),
  card("Initech", "Data Engineer", 20),
];
const names = (found: typeof cards) => found.map((c) => c.company);

describe("filterCards", () => {
  it("returns everything with no filters", () => {
    expect(filterCards(cards, "  ", null)).toHaveLength(3);
  });
  it("searches company and role, ignoring case", () => {
    expect(names(filterCards(cards, "GLOBEX", null))).toEqual(["Globex"]);
    expect(names(filterCards(cards, "engineer", null))).toEqual(["Acme", "Initech"]);
  });
  it("searches source and notes", () => {
    expect(names(filterCards(cards, "linkedin", null))).toEqual(["Acme"]);
    expect(names(filterCards(cards, "dana", null))).toEqual(["Globex"]);
  });
  it("needs every word to match, in any field", () => {
    expect(names(filterCards(cards, "engineer acme", null))).toEqual(["Acme"]);
    expect(filterCards(cards, "acme designer", null)).toEqual([]);
  });
  it("keeps only cards applied to within the range", () => {
    expect(names(filterCards(cards, "", NOW - DAY))).toEqual(["Acme"]);
    expect(names(filterCards(cards, "", NOW - 7 * DAY))).toEqual(["Acme", "Globex"]);
  });
  it("combines search and range", () => {
    expect(names(filterCards(cards, "engineer", NOW - 7 * DAY))).toEqual(["Acme"]);
  });
});
