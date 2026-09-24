import { describe, expect, it } from "vitest";
import { heatColor, tileWeight } from "@/lib/heatmap";

describe("heatColor", () => {
  it("is transparent for null / zero / non-finite", () => {
    expect(heatColor(null)).toBe("transparent");
    expect(heatColor(0)).toBe("transparent");
    expect(heatColor(Infinity)).toBe("transparent");
  });

  it("greens gains, reds losses", () => {
    expect(heatColor(1)).toMatch(/^rgba\(34,197,94,/);
    expect(heatColor(-1)).toMatch(/^rgba\(239,68,68,/);
  });

  it("scales alpha with magnitude and clamps at ±3%", () => {
    const a1 = Number(heatColor(1)!.match(/,([\d.]+)\)$/)![1]);
    const a3 = Number(heatColor(3)!.match(/,([\d.]+)\)$/)![1]);
    const a10 = Number(heatColor(10)!.match(/,([\d.]+)\)$/)![1]);
    expect(a1).toBeLessThan(a3);
    expect(a3).toBeCloseTo(0.7, 3); // 0.15 + 0.55
    expect(a10).toBe(a3); // clamped
  });
});

describe("tileWeight", () => {
  it("floors at 1 for missing/zero data", () => {
    expect(tileWeight(null, 100)).toBe(1);
    expect(tileWeight(50, 0)).toBe(1);
  });

  it("grows with market cap (max cap = heaviest)", () => {
    expect(tileWeight(100, 100)).toBeCloseTo(5, 5); // 1 + 4*sqrt(1)
    expect(tileWeight(25, 100)).toBeCloseTo(3, 5); // 1 + 4*sqrt(0.25)
    expect(tileWeight(0, 100)).toBe(1);
  });
});
