"use client";

import { getCommodities } from "@/lib/api";
import { EMPTY, changeColor, fmtNumber, fmtPercent, isNum } from "@/lib/format";
import { usePolling } from "@/lib/usePolling";
import { PanelSkeleton } from "@/components/ui/Skeleton";

const REFRESH_MS = 60_000;

function fmtPrice(value: number | null): string {
  if (!isNum(value)) return EMPTY;
  return fmtNumber(value, value >= 1000 ? 0 : 2);
}

/** Commodities basket (metals/energy/gas) — last price + day change. Research-only. */
export default function CommoditiesPanel() {
  const { data, error, loading } = usePolling(getCommodities, REFRESH_MS);
  const rows = data ?? [];

  if (loading && rows.length === 0) return <PanelSkeleton />;
  if (error && rows.length === 0) return <p className="p-3 text-data-sm text-error">{error}</p>;

  return (
    <table className="w-full border-collapse">
      <tbody>
        {rows.map((q) => (
          <tr key={q.symbol} className="border-b border-outline-variant/50 hover:bg-surface-container-low">
            <td className="pl-3 py-1 font-data-md text-data-md text-on-surface">{q.name}</td>
            <td className="py-1 text-right font-data-md text-data-md text-on-surface tabular-nums">
              {fmtPrice(q.price)}
              <span className="ml-1 text-data-sm text-on-surface-variant opacity-60">{q.currency}</span>
            </td>
            <td className={`pr-3 py-1 text-right font-data-md text-data-md tabular-nums ${changeColor(q.change_pct)}`}>
              {fmtPercent(q.change_pct, 2, true)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
