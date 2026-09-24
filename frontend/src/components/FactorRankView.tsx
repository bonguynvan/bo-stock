"use client";

import { useEffect, useMemo, useState } from "react";
import type { FactorRow } from "@/types/stock";
import { getFactorRanking } from "@/lib/api";
import { EMPTY, fmtDecimal, isNum } from "@/lib/format";
import { rowButtonProps } from "@/lib/a11y";

const CAP = 150;
type FactorKey = "composite" | "value" | "quality" | "growth";
const COLS: { key: FactorKey; label: string }[] = [
  { key: "composite", label: "Tổng hợp" },
  { key: "value", label: "Giá trị" },
  { key: "quality", label: "Chất lượng" },
  { key: "growth", label: "Tăng trưởng" },
];

/** 0-100 score → red (low) → neutral (50) → green (high). */
function scoreBg(v: number | null): string {
  if (!isNum(v)) return "transparent";
  const t = Math.max(-1, Math.min(1, (v - 50) / 50));
  if (t >= 0) return `rgba(34,197,94,${(0.08 + 0.45 * t).toFixed(3)})`;
  return `rgba(239,68,68,${(0.08 + 0.45 * -t).toFixed(3)})`;
}

interface FactorRankViewProps {
  onOpenSymbol?: (symbol: string) => void;
}

export default function FactorRankView({ onOpenSymbol }: FactorRankViewProps) {
  const [rows, setRows] = useState<FactorRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<FactorKey>("composite");

  useEffect(() => {
    let cancelled = false;
    getFactorRanking()
      .then((d) => !cancelled && setRows(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Lỗi tải dữ liệu"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const sorted = useMemo(() => {
    return [...rows]
      .sort((a, b) => (b[sortBy] ?? -Infinity) - (a[sortBy] ?? -Infinity))
      .slice(0, CAP);
  }, [rows, sortBy]);

  return (
    <>
      <header className="p-4 border-b border-outline-variant bg-surface-container-low">
        <h1 className="font-headline-md text-headline-md text-on-surface">Xếp hạng yếu tố</h1>
        <p className="text-on-surface-variant font-body-md text-body-md mt-1">
          Xếp hạng phân vị toàn thị trường theo Giá trị / Chất lượng / Tăng trưởng (thang 0–100,
          cao = tốt hơn tương đối). Số liệu mô tả, không phải khuyến nghị.
        </p>
      </header>

      <div className="flex-1 overflow-auto custom-scrollbar p-4">
        {loading ? (
          <p className="text-data-sm text-on-surface-variant">Đang tính xếp hạng…</p>
        ) : error ? (
          <p className="text-data-sm text-error">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-data-sm text-on-surface-variant">Chưa có dữ liệu chỉ số.</p>
        ) : (
          <>
            <p className="text-data-sm text-on-surface-variant mb-2">
              {rows.length} mã · hiển thị top {Math.min(CAP, rows.length)} theo{" "}
              {COLS.find((c) => c.key === sortBy)?.label}
            </p>
            <table className="w-full border-collapse font-data-md text-data-md">
              <thead>
                <tr className="border-b border-outline-variant">
                  <th className="text-left py-2 pr-3 font-label-caps text-label-caps uppercase text-on-surface-variant">
                    Mã
                  </th>
                  {COLS.map((c) => (
                    <th
                      key={c.key}
                      role="button"
                      tabIndex={0}
                      aria-sort={sortBy === c.key ? "descending" : "none"}
                      onClick={() => setSortBy(c.key)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSortBy(c.key);
                        }
                      }}
                      className={`py-2 px-3 text-right font-label-caps text-label-caps uppercase cursor-pointer select-none hover:text-primary focus:outline focus:outline-1 focus:outline-primary ${
                        sortBy === c.key ? "text-primary" : "text-on-surface-variant"
                      }`}
                    >
                      {c.label}
                      {sortBy === c.key && " ▼"}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr
                    key={r.symbol}
                    {...(onOpenSymbol ? rowButtonProps(() => onOpenSymbol(r.symbol), `Mở ${r.symbol}`) : {})}
                    className={`border-b border-outline-variant/50 hover:bg-surface-container-low ${
                      onOpenSymbol ? "cursor-pointer focus:outline focus:outline-1 focus:outline-primary" : ""
                    }`}
                  >
                    <td className="py-1 pr-3">
                      <span className="font-bold text-primary">{r.symbol}</span>
                      <span className="ml-2 text-data-sm text-on-surface-variant opacity-60 truncate">
                        {r.industry ?? ""}
                      </span>
                    </td>
                    {COLS.map((c) => (
                      <td
                        key={c.key}
                        style={{ backgroundColor: scoreBg(r[c.key]) }}
                        className="py-1 px-3 text-right tabular-nums text-on-surface"
                      >
                        {isNum(r[c.key]) ? fmtDecimal(r[c.key], 0) : EMPTY}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </>
  );
}
