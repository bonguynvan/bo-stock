"use client";

import { getFxMarkets } from "@/lib/api";
import { EMPTY, changeColor, fmtNumber, fmtPercent, isNum } from "@/lib/format";
import { usePolling } from "@/lib/usePolling";
import { PanelSkeleton } from "@/components/ui/Skeleton";

const REFRESH_MS = 60_000;

// FX rates span very different magnitudes (26,330 vs 1.14) → adapt precision.
function fmtRate(value: number | null): string {
  if (!isNum(value)) return EMPTY;
  return fmtNumber(value, value >= 100 ? 0 : 4);
}

/** Major FX pairs (USD/VND first) — last rate + day change. Research-only. */
export default function FxPanel() {
  const { data, error, loading } = usePolling(getFxMarkets, REFRESH_MS);
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
              {fmtRate(q.price)}
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
