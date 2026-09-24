"use client";

import { useEffect, useState } from "react";
import { screenerFilter } from "@/lib/api";
import type { StockResult } from "@/types/stock";
import { EMPTY, changeColor, fmtDecimal, fmtNumber, fmtPercent } from "@/lib/format";
import { rowButtonProps } from "@/lib/a11y";
import { PanelSkeleton } from "@/components/ui/Skeleton";

interface MarketMoversPanelProps {
  onOpenSymbol: (symbol: string) => void;
  limit?: number;
}

/**
 * Top names by Quant score (a transparent screening rank, not advice). Reuses the
 * existing screener endpoint — no new backend surface.
 */
export default function MarketMoversPanel({ onOpenSymbol, limit = 14 }: MarketMoversPanelProps) {
  const [rows, setRows] = useState<StockResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    screenerFilter({ sort_by: "quant_score", sort_order: "desc", limit })
      .then((res) => !cancelled && setRows(res.data))
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Lỗi tải dữ liệu");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [limit]);

  if (loading) return <PanelSkeleton rows={8} />;
  if (error) return <p className="p-3 text-data-sm text-error">{error}</p>;

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="text-on-surface-variant border-b border-outline-variant">
          <th className="pl-3 py-1 text-left font-label-caps text-label-caps uppercase">Mã</th>
          <th className="py-1 text-right font-label-caps text-label-caps uppercase">Giá</th>
          <th className="py-1 text-right font-label-caps text-label-caps uppercase">%</th>
          <th className="pr-3 py-1 text-right font-label-caps text-label-caps uppercase">Quant</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => (
          <tr
            key={s.symbol}
            {...rowButtonProps(() => onOpenSymbol(s.symbol), `Mở ${s.symbol}`)}
            className="border-b border-outline-variant/50 hover:bg-surface-container-low cursor-pointer focus:outline focus:outline-1 focus:outline-primary"
          >
            <td className="pl-3 py-1">
              <span className="font-data-md text-data-md font-bold text-primary">{s.symbol}</span>
            </td>
            <td className="py-1 text-right font-data-md text-data-md text-on-surface tabular-nums">
              {s.close_price === null ? EMPTY : fmtNumber(s.close_price, 2)}
            </td>
            <td className={`py-1 text-right font-data-md text-data-md tabular-nums ${changeColor(s.change_pct)}`}>
              {fmtPercent(s.change_pct, 2, true)}
            </td>
            <td className="pr-3 py-1 text-right font-data-md text-data-md text-on-surface tabular-nums">
              {s.quant_score === null ? EMPTY : fmtDecimal(s.quant_score, 0)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
