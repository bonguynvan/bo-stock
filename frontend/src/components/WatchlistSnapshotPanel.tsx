"use client";

import { useEffect, useState } from "react";
import { getWatchlistMetrics, getWatchlists } from "@/lib/api";
import type { StockResult } from "@/types/stock";
import { EMPTY, changeColor, fmtNumber, fmtPercent } from "@/lib/format";
import { rowButtonProps } from "@/lib/a11y";
import { PanelSkeleton } from "@/components/ui/Skeleton";

interface WatchlistSnapshotPanelProps {
  onOpenSymbol: (symbol: string) => void;
}

/** Read-only snapshot of the first watchlist — quick glance on the dashboard. */
export default function WatchlistSnapshotPanel({ onOpenSymbol }: WatchlistSnapshotPanelProps) {
  const [rows, setRows] = useState<StockResult[]>([]);
  const [name, setName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getWatchlists()
      .then(async (lists) => {
        const first = lists[0];
        if (!first) return;
        if (!cancelled) setName(first.name);
        const metrics = await getWatchlistMetrics(first.id);
        if (!cancelled) setRows(metrics);
      })
      .catch(() => {
        /* empty state below */
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <PanelSkeleton />;
  if (rows.length === 0) {
    return (
      <p className="p-3 text-data-sm text-on-surface-variant">
        Chưa có danh mục theo dõi. Thêm mã bằng ngôi sao ở bảng lọc.
      </p>
    );
  }

  return (
    <>
      {name && (
        <div className="px-3 py-1 font-label-caps text-label-caps uppercase text-on-surface-variant opacity-70 border-b border-outline-variant/50">
          {name}
        </div>
      )}
      <table className="w-full border-collapse">
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
              <td className={`pr-3 py-1 text-right font-data-md text-data-md tabular-nums ${changeColor(s.change_pct)}`}>
                {fmtPercent(s.change_pct, 2, true)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
