"use client";

import { useEffect, useMemo, useState } from "react";
import type { StockResult } from "@/types/stock";
import { getCompare, downloadCompareReport } from "@/lib/api";
import { COMPARE_METRICS, metricValue, rankRow, type CompareMetric } from "@/lib/compareMetrics";
import { EMPTY, changeColor, fmtDecimal, fmtNumber, fmtPercent, isNum } from "@/lib/format";

const STORAGE_KEY = "vios.compareSymbols";
const CAP = 12;

function loadSymbols(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function fmtCell(value: number | null | undefined, kind: CompareMetric["kind"]): string {
  if (!isNum(value)) return EMPTY;
  if (kind === "pct") return fmtPercent(value, 2, true);
  if (kind === "dec1") return fmtDecimal(value, 1);
  if (kind === "dec2") return fmtDecimal(value, 2);
  return fmtNumber(value);
}

interface ComparisonViewProps {
  onOpenSymbol?: (symbol: string) => void;
}

export default function ComparisonView({ onOpenSymbol }: ComparisonViewProps) {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<StockResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    setSymbols(loadSymbols());
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols));
    } catch {
      /* non-fatal */
    }
    if (symbols.length === 0) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getCompare(symbols)
      .then((data) => !cancelled && setRows(data))
      .catch(() => !cancelled && setRows([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [symbols]);

  const bySymbol = useMemo(() => {
    const m = new Map<string, StockResult>();
    for (const r of rows) m.set(r.symbol, r);
    return m;
  }, [rows]);

  const addSymbols = (raw: string) => {
    const toAdd = raw
      .split(/[,\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (toAdd.length === 0) return;
    setSymbols((cur) => {
      const next = [...cur];
      for (const s of toAdd) if (!next.includes(s) && next.length < CAP) next.push(s);
      return next;
    });
    setInput("");
  };

  const remove = (sym: string) => setSymbols((cur) => cur.filter((s) => s !== sym));

  const exportPdf = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await downloadCompareReport(symbols);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Lỗi xuất báo cáo");
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <header className="p-4 border-b border-outline-variant bg-surface-container-low">
        <h1 className="font-headline-md text-headline-md text-on-surface">So sánh cổ phiếu</h1>
        <p className="text-on-surface-variant font-body-md text-body-md mt-1">
          Đặt các mã cạnh nhau theo từng chỉ số. Ô <span className="text-secondary">xanh</span> = tốt nhất,
          <span className="text-error"> đỏ</span> = kém nhất trong nhóm. Chỉ mô tả, không khuyến nghị.
        </p>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addSymbols(input);
            }}
            className="flex items-center gap-1"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Thêm mã (VD: FPT, VCB)…"
              aria-label="Thêm mã so sánh"
              className="bg-surface-container-high border border-outline-variant px-2 py-1 font-data-md text-data-md text-on-surface outline-none focus:border-primary w-48"
            />
            <button
              type="submit"
              className="px-2 py-1 border border-primary text-primary font-label-caps text-label-caps uppercase hover:bg-primary/10 transition-colors"
            >
              Thêm
            </button>
          </form>
          {symbols.map((s) => (
            <span
              key={s}
              className="flex items-center gap-1 px-2 py-0.5 border border-outline-variant font-data-md text-data-md text-on-surface"
            >
              {s}
              <button
                type="button"
                onClick={() => remove(s)}
                aria-label={`Bỏ ${s}`}
                className="text-on-surface-variant hover:text-error"
              >
                <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>close</span>
              </button>
            </span>
          ))}
          {symbols.length > 0 && (
            <button
              type="button"
              onClick={exportPdf}
              disabled={exporting}
              title="Xuất báo cáo so sánh (PDF)"
              className="ml-auto shrink-0 px-2.5 py-1 border border-primary text-primary font-label-caps text-label-caps uppercase hover:bg-primary/10 transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>picture_as_pdf</span>
              {exporting ? "Đang tạo…" : "Xuất PDF"}
            </button>
          )}
        </div>
        {exportError && <p className="mt-1 text-data-sm text-error">{exportError}</p>}
      </header>

      <div className="flex-1 overflow-auto custom-scrollbar p-4">
        {symbols.length === 0 ? (
          <p className="text-on-surface-variant font-data-md text-data-md py-8 text-center border border-outline-variant border-dashed">
            Thêm ít nhất 2 mã để so sánh.
          </p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-outline-variant">
                <th className="text-left py-2 pr-3 font-label-caps text-label-caps uppercase text-on-surface-variant sticky left-0 bg-background">
                  Chỉ số
                </th>
                {symbols.map((s) => {
                  const r = bySymbol.get(s);
                  return (
                    <th key={s} className="text-right py-2 px-3 min-w-[92px]">
                      <button
                        type="button"
                        onClick={() => onOpenSymbol?.(s)}
                        className="font-data-md text-data-md font-bold text-primary hover:underline"
                      >
                        {s}
                      </button>
                      <div className="font-data-md text-data-sm text-on-surface-variant opacity-60 truncate max-w-[120px] ml-auto">
                        {loading && !r ? "…" : r?.company_name ?? EMPTY}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {COMPARE_METRICS.map((metric) => {
                const values = symbols.map((s) => metricValue(bySymbol.get(s), metric.key));
                const { best, worst } = rankRow(values, metric.dir);
                return (
                  <tr key={metric.key} className="border-b border-outline-variant/50">
                    <td className="py-1.5 pr-3 font-data-md text-data-md text-on-surface-variant sticky left-0 bg-background">
                      {metric.label}
                    </td>
                    {values.map((v, i) => {
                      const highlight =
                        i === best
                          ? "bg-secondary/15 text-secondary font-bold"
                          : i === worst
                            ? "bg-error/10 text-error"
                            : metric.dir === "none" && metric.kind === "pct"
                              ? changeColor(v)
                              : "text-on-surface";
                      return (
                        <td
                          key={symbols[i]}
                          className={`py-1.5 px-3 text-right font-data-md text-data-md tabular-nums ${highlight}`}
                        >
                          {fmtCell(v, metric.kind)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
