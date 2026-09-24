import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { buildCsv, downloadCsv } from "@/lib/csv";
import type { StockResult } from "@/types/stock";

function makeStock(overrides: Partial<StockResult> = {}): StockResult {
  return {
    symbol: "AAA",
    company_name: "Company A",
    exchange: "HOSE",
    industry: "Tech",
    market_cap: 1000,
    close_price: 25,
    change_pct: 1.5,
    pe: 12.3,
    pb: 1.1,
    roe: 22,
    roa: 11,
    net_margin: 8,
    revenue_growth: 5,
    eps_growth: 4,
    debt_equity: 0.5,
    current_ratio: 1.8,
    dividend_yield: 3,
    avg_volume_30d: 100000,
    quant_score: 85,
    quant_grade: "A+",
    updated_at: null,
    ...overrides,
  };
}

const HEADER =
  "Ticker,Company,Exchange,Industry,Price,Change %,Market Cap (B),P/E,P/B,ROE %,ROA %,NPM %,Div Yield %,Debt/Equity,Quant Score,Quant Grade";

describe("buildCsv", () => {
  it("emits only the header row when there are no rows", () => {
    expect(buildCsv([])).toBe(HEADER);
  });

  it("emits a header line plus one body line per row", () => {
    const csv = buildCsv([makeStock(), makeStock({ symbol: "BBB" })]);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(HEADER);
    expect(lines[1].startsWith("AAA,")).toBe(true);
    expect(lines[2].startsWith("BBB,")).toBe(true);
  });

  it("renders null cells as empty strings", () => {
    const csv = buildCsv([
      makeStock({ industry: null, pe: null, quant_grade: null, market_cap: null }),
    ]);
    const cells = csv.split("\n")[1].split(",");
    // Industry (index 3) -> empty
    expect(cells[3]).toBe("");
  });

  it("quotes and escapes cells containing commas, quotes and newlines", () => {
    const csv = buildCsv([
      makeStock({ company_name: 'A, "B" Corp' }),
    ]);
    const line = csv.split("\n")[1];
    expect(line).toContain('"A, ""B"" Corp"');
  });

  it("wraps a value containing a newline in quotes", () => {
    const csv = buildCsv([makeStock({ company_name: "Line1\nLine2" })]);
    expect(csv).toContain('"Line1\nLine2"');
  });

  it("stringifies numeric and boolean-ish values without quoting", () => {
    const csv = buildCsv([makeStock({ close_price: 25, market_cap: 1000 })]);
    const cells = csv.split("\n")[1].split(",");
    expect(cells[0]).toBe("AAA");
    expect(cells[4]).toBe("25");
  });
});

describe("downloadCsv", () => {
  beforeEach(() => {
    // jsdom does not implement these; stub them for the download flow.
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = vi
      .fn()
      .mockReturnValue("blob:mock");
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prepends a UTF-8 BOM and triggers a click on a temporary anchor", () => {
    const blobs: Blob[] = [];
    const OriginalBlob = globalThis.Blob;
    const blobSpy = vi
      .spyOn(globalThis, "Blob")
      .mockImplementation((parts?: BlobPart[], options?: BlobPropertyBag) => {
        const blob = new OriginalBlob(parts, options);
        blobs.push(blob);
        return blob;
      });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    downloadCsv([makeStock()], "stocks.csv");

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(blobSpy).toHaveBeenCalledTimes(1);
    const parts = blobSpy.mock.calls[0][0] as string[];
    // BOM (﻿) must be the first character of the blob content.
    expect(parts[0].charCodeAt(0)).toBe(0xfeff);
    expect(parts[0]).toContain(HEADER);
  });

  it("removes the temporary anchor from the document after clicking", () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    downloadCsv([makeStock()], "stocks.csv");
    expect(document.querySelectorAll("a")).toHaveLength(0);
  });
});
