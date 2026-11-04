import { describe, expect, it } from "vitest";
import { estimateCost } from "./model";

describe("estimateCost", () => {
  it("gives a range matching a real 495-email Opus sync of about $6", () => {
    expect(estimateCost(495, "claude-opus-5-5")).toBe("$3.37–$6.93");
  });

  it("prices Haiku far lower", () => {
    expect(estimateCost(523, "claude-haiku-5-5")).toBe("$0.09–$0.18");
  });

  it("does not show a meaningless range for tiny syncs", () => {
    expect(estimateCost(3, "claude-haiku-5-5")).toBe("under 1¢");
    expect(estimateCost(40, "claude-haiku-5-5")).toBe("up to $0.01");
  });

  it("admits when it does not know a model's price", () => {
    expect(estimateCost(10, "some-future-model")).toBeNull();
  });
});
