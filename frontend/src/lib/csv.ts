import type { StockResult } from "@/types/stock";

const HEADERS: { key: keyof StockResult; label: string }[] = [
  { key: "symbol", label: "Ticker" },
  { key: "company_name", label: "Company" },
  { key: "exchange", label: "Exchange" },
  { key: "industry", label: "Industry" },
  { key: "close_price", label: "Price" },
  { key: "change_pct", label: "Change %" },
  { key: "market_cap", label: "Market Cap (B)" },
  { key: "pe", label: "P/E" },
  { key: "pb", label: "P/B" },
  { key: "roe", label: "ROE %" },
  { key: "roa", label: "ROA %" },
  { key: "net_margin", label: "NPM %" },
  { key: "dividend_yield", label: "Div Yield %" },
  { key: "debt_equity", label: "Debt/Equity" },
  { key: "quant_score", label: "Quant Score" },
  { key: "quant_grade", label: "Quant Grade" },
];

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsv(rows: StockResult[]): string {
  const headerLine = HEADERS.map((h) => escapeCell(h.label)).join(",");
  const bodyLines = rows.map((row) =>
    HEADERS.map((h) => escapeCell(row[h.key])).join(","),
  );
  return [headerLine, ...bodyLines].join("\n");
}

// Client-only: trigger a CSV download in the browser.
export function downloadCsv(rows: StockResult[], filename: string): void {
  const csv = buildCsv(rows);
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
