import { describe, expect, it } from "vitest";
import {
  EMPTY,
  changeColor,
  fmtDecimal,
  fmtNumber,
  fmtPercent,
  fmtTime,
  isNum,
  roeColor,
  scoreWidth,
} from "@/lib/format";

describe("isNum", () => {
  it("returns true for finite numbers including 0 and negatives", () => {
    expect(isNum(0)).toBe(true);
    expect(isNum(-5)).toBe(true);
    expect(isNum(12.34)).toBe(true);
  });

  it("returns false for null, undefined, NaN and Infinity", () => {
    expect(isNum(null)).toBe(false);
    expect(isNum(undefined)).toBe(false);
    expect(isNum(NaN)).toBe(false);
    expect(isNum(Infinity)).toBe(false);
  });
});

describe("fmtNumber", () => {
  it("returns em-dash for null/undefined", () => {
    expect(fmtNumber(null)).toBe(EMPTY);
    expect(fmtNumber(undefined)).toBe(EMPTY);
  });

  it("formats with thousands separators and no fraction by default", () => {
    expect(fmtNumber(1234567)).toBe("1,234,567");
    expect(fmtNumber(0)).toBe("0");
  });

  it("respects the requested fraction digits", () => {
    expect(fmtNumber(1234.5, 2)).toBe("1,234.50");
  });

  it("formats negative numbers", () => {
    expect(fmtNumber(-1000)).toBe("-1,000");
  });
});

describe("fmtDecimal", () => {
  it("returns em-dash for null/undefined", () => {
    expect(fmtDecimal(null)).toBe(EMPTY);
    expect(fmtDecimal(undefined)).toBe(EMPTY);
  });

  it("formats with one fraction digit by default", () => {
    expect(fmtDecimal(3.14159)).toBe("3.1");
    expect(fmtDecimal(0)).toBe("0.0");
  });

  it("respects the requested fraction digits", () => {
    expect(fmtDecimal(3.14159, 3)).toBe("3.142");
  });
});

describe("fmtPercent", () => {
  it("returns em-dash for null/undefined", () => {
    expect(fmtPercent(null)).toBe(EMPTY);
    expect(fmtPercent(undefined)).toBe(EMPTY);
  });

  it("appends a percent sign with two digits by default", () => {
    expect(fmtPercent(12.345)).toBe("12.35%");
    expect(fmtPercent(0)).toBe("0.00%");
  });

  it("adds a leading + only for positive values when withSign is true", () => {
    expect(fmtPercent(5, 2, true)).toBe("+5.00%");
    expect(fmtPercent(-5, 2, true)).toBe("-5.00%");
    expect(fmtPercent(0, 2, true)).toBe("0.00%");
  });

  it("does not add a sign when withSign is false", () => {
    expect(fmtPercent(5, 1)).toBe("5.0%");
  });
});

describe("changeColor", () => {
  it("returns neutral for null, undefined and exactly 0", () => {
    expect(changeColor(null)).toBe("text-on-surface-variant");
    expect(changeColor(undefined)).toBe("text-on-surface-variant");
    expect(changeColor(0)).toBe("text-on-surface-variant");
  });

  it("returns green for positive and red for negative", () => {
    expect(changeColor(1.2)).toBe("text-secondary");
    expect(changeColor(-1.2)).toBe("text-error");
  });
});

describe("roeColor", () => {
  it("returns neutral variant for null/undefined", () => {
    expect(roeColor(null)).toBe("text-on-surface-variant");
    expect(roeColor(undefined)).toBe("text-on-surface-variant");
  });

  it("returns green above 20", () => {
    expect(roeColor(20.1)).toBe("text-secondary");
  });

  it("returns red below 10", () => {
    expect(roeColor(9.9)).toBe("text-error");
  });

  it("returns neutral on-surface between 10 and 20 inclusive of boundaries", () => {
    expect(roeColor(10)).toBe("text-on-surface");
    expect(roeColor(20)).toBe("text-on-surface");
    expect(roeColor(15)).toBe("text-on-surface");
  });
});

describe("scoreWidth", () => {
  it("returns 0 for null/undefined", () => {
    expect(scoreWidth(null)).toBe(0);
    expect(scoreWidth(undefined)).toBe(0);
  });

  it("passes through values within range", () => {
    expect(scoreWidth(42)).toBe(42);
  });

  it("clamps to the 0-100 range", () => {
    expect(scoreWidth(150)).toBe(100);
    expect(scoreWidth(-10)).toBe(0);
  });
});

describe("fmtTime", () => {
  it("returns em-dash for null/undefined/empty", () => {
    expect(fmtTime(null)).toBe(EMPTY);
    expect(fmtTime(undefined)).toBe(EMPTY);
    expect(fmtTime("")).toBe(EMPTY);
  });

  it("returns em-dash for an unparseable date", () => {
    expect(fmtTime("not-a-date")).toBe(EMPTY);
  });

  it("formats a valid ISO date as HH:MM:SS DD/MM/YYYY", () => {
    // Construct from explicit local-time parts so the assertion is timezone-stable.
    const iso = new Date(2024, 0, 5, 9, 3, 7).toISOString();
    expect(fmtTime(iso)).toBe("09:03:07 05/01/2024");
  });
});
