import { describe, expect, it } from "vitest";
import { rankRow } from "@/lib/compareMetrics";

describe("rankRow", () => {
  it("returns nulls for neutral metrics", () => {
    expect(rankRow([1, 2, 3], "none")).toEqual({ best: null, worst: null });
  });

  it("up: highest is best, lowest is worst", () => {
    expect(rankRow([10, 30, 20], "up")).toEqual({ best: 1, worst: 0 });
  });

  it("down: lowest is best, highest is worst", () => {
    expect(rankRow([10, 30, 20], "down")).toEqual({ best: 0, worst: 1 });
  });

  it("skips null/undefined values when ranking", () => {
    expect(rankRow([null, 5, undefined, 9], "up")).toEqual({ best: 3, worst: 1 });
  });

  it("no highlight with <2 comparable values", () => {
    expect(rankRow([null, 7, null], "up")).toEqual({ best: null, worst: null });
  });

  it("no highlight when all equal", () => {
    expect(rankRow([5, 5, 5], "down")).toEqual({ best: null, worst: null });
  });
});
