import type { StockResult } from "@/types/stock";

export type MetricDir = "up" | "down" | "none";

// Keys of StockResult whose value is a number (COMPARE_METRICS lists only these).
export type NumericStockKey = {
  [K in keyof StockResult]-?: NonNullable<StockResult[K]> extends number ? K : never;
}[keyof StockResult];

export interface CompareMetric {
  key: NumericStockKey;
  label: string;
  dir: MetricDir; // which direction is "better" (drives best/worst highlight)
  kind: "num" | "dec1" | "dec2" | "pct";
}

/** Read a metric value as a number, or null — no unsafe cast, runtime-guarded. */
export function metricValue(row: StockResult | undefined, key: NumericStockKey): number | null {
  const v = row?.[key];
  return typeof v === "number" ? v : null;
}

// Rows of the compare table. Price/change/market-cap are neutral (no better/worse).
export const COMPARE_METRICS: readonly CompareMetric[] = [
  { key: "close_price", label: "Giá", dir: "none", kind: "num" },
  { key: "change_pct", label: "% Ngày", dir: "none", kind: "pct" },
  { key: "market_cap", label: "Vốn hóa (tỷ)", dir: "none", kind: "num" },
  { key: "pe", label: "P/E", dir: "down", kind: "dec1" },
  { key: "pb", label: "P/B", dir: "down", kind: "dec1" },
  { key: "roe", label: "ROE %", dir: "up", kind: "dec1" },
  { key: "roa", label: "ROA %", dir: "up", kind: "dec1" },
  { key: "net_margin", label: "Biên LN %", dir: "up", kind: "dec1" },
  { key: "revenue_growth", label: "Tăng DT %", dir: "up", kind: "dec1" },
  { key: "debt_equity", label: "Nợ/VCSH", dir: "down", kind: "dec2" },
  { key: "dividend_yield", label: "Cổ tức %", dir: "up", kind: "dec1" },
  { key: "quant_score", label: "Quant", dir: "up", kind: "num" },
];

/**
 * Best/worst column indices for a metric row, honoring its direction. Returns nulls
 * when the metric is neutral, has <2 comparable values, or all values are equal.
 */
export function rankRow(
  values: readonly (number | null | undefined)[],
  dir: MetricDir,
): { best: number | null; worst: number | null } {
  if (dir === "none") return { best: null, worst: null };
  const present = values
    .map((v, i) => ({ v, i }))
    .filter((x): x is { v: number; i: number } => typeof x.v === "number" && Number.isFinite(x.v));
  if (present.length < 2) return { best: null, worst: null };
  const sorted = [...present].sort((a, b) => a.v - b.v);
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  if (lo.v === hi.v) return { best: null, worst: null };
  return dir === "up" ? { best: hi.i, worst: lo.i } : { best: lo.i, worst: hi.i };
}
