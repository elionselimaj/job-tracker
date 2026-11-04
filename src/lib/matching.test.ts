import { describe, expect, it } from "vitest";
import { findExistingCard, findRejectionTarget, sameCompany, similarRole } from "./matching";

const card = (id: string, company: string, role: string, status = "APPLIED", thread?: string) => ({
  id,
  company,
  role,
  status,
  gmailThreadId: thread ?? null,
});

describe("sameCompany", () => {
  it("ignores legal suffixes, case and punctuation", () => {
    expect(sameCompany("Stripe, Inc.", "stripe")).toBe(true);
    expect(sameCompany("Acme GmbH", "ACME")).toBe(true);
    expect(sameCompany("Meta Platforms", "Meta")).toBe(true);
  });
  it("does not confuse different companies", () => {
    expect(sameCompany("Meta", "Metabase")).toBe(false);
    expect(sameCompany("Inc", "Stripe")).toBe(false);
  });
});

describe("similarRole", () => {
  it("accepts a title that contains the other", () => {
    expect(similarRole("Software Engineer", "Software Engineer - Payments")).toBe(true);
  });
  it("rejects different titles", () => {
    expect(similarRole("Frontend Engineer", "Backend Engineer")).toBe(false);
  });
});

describe("findExistingCard", () => {
  it("treats a different role at the same company as a new application", () => {
    const cards = [card("1", "Acme", "Designer")];
    expect(findExistingCard(cards, { company: "Acme", role: "Engineer", threadId: "t" })).toBeNull();
  });
  it("ignores a thread match when the company conflicts", () => {
    const cards = [card("1", "Acme", "Designer", "APPLIED", "t")];
    expect(findExistingCard(cards, { company: "Globex", role: "Designer", threadId: "t" })).toBeNull();
  });
});

describe("findRejectionTarget", () => {
  it("prefers the thread even if the email gives no names", () => {
    const cards = [card("1", "Acme", "Engineer", "APPLIED", "t"), card("2", "Acme", "Designer")];
    const result = findRejectionTarget(cards, { company: null, role: null, threadId: "t" });
    expect(result).toMatchObject({ kind: "match", card: { id: "1" } });
  });
  it("uses the only open card when the role is not stated", () => {
    const cards = [card("1", "Acme", "Engineer"), card("2", "Acme", "Designer", "REJECTED")];
    const result = findRejectionTarget(cards, { company: "Acme", role: null, threadId: "x" });
    expect(result).toMatchObject({ kind: "match", card: { id: "1" } });
  });
  it("refuses to guess between several open cards", () => {
    const cards = [card("1", "Acme", "Engineer"), card("2", "Acme", "Designer")];
    const result = findRejectionTarget(cards, { company: "Acme", role: null, threadId: "x" });
    expect(result.kind).toBe("ambiguous");
  });
  it("does not move a card for a different role", () => {
    const cards = [card("1", "Acme", "Designer")];
    const result = findRejectionTarget(cards, { company: "Acme", role: "Engineer", threadId: "x" });
    expect(result.kind).toBe("none");
  });
});
