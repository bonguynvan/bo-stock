"use client";

import { getWorldMarkets } from "@/lib/api";
import { EMPTY, changeColor, fmtNumber, fmtPercent } from "@/lib/format";
import { usePolling } from "@/lib/usePolling";
import { PanelSkeleton } from "@/components/ui/Skeleton";

const REFRESH_MS = 60_000;

function groupOrder(group: string): number {
  const order = ["Chỉ số", "Hàng hóa", "Tiền tệ", "Crypto"];
  const i = order.indexOf(group);
  return i === -1 ? order.length : i;
}

/**
 * Global-context tile — world indices/commodities/FX/crypto from the free Yahoo
 * connector. Research-only: last price + day change, no advice. Self-refreshing.
 */
export default function WorldMarketsPanel() {
  const { data, error, loading } = usePolling(getWorldMarkets, REFRESH_MS);
  const quotes = data ?? [];

  if (loading && quotes.length === 0) {
    return <PanelSkeleton />;
  }
  if (error && quotes.length === 0) {
    return <p className="p-3 text-data-sm text-error">{error}</p>;
  }

  const sorted = [...quotes].sort((a, b) => groupOrder(a.group) - groupOrder(b.group));
  let lastGroup = "";

  return (
    <table className="w-full border-collapse">
      <tbody>
        {sorted.map((q) => {
          const showGroup = q.group !== lastGroup;
          lastGroup = q.group;
          return (
            <tr key={q.symbol} className="border-b border-outline-variant/50 hover:bg-surface-container-low">
              <td className="pl-3 py-1 w-8">
                {showGroup && (
                  <span className="font-label-caps text-label-caps uppercase text-on-surface-variant opacity-60">
                    {q.group.slice(0, 3)}
                  </span>
                )}
              </td>
              <td className="py-1">
                <span className="font-data-md text-data-md text-on-surface">{q.name}</span>
                <span className="ml-2 font-data-md text-data-sm text-on-surface-variant opacity-60">
                  {q.currency}
                </span>
              </td>
              <td className="py-1 text-right font-data-md text-data-md text-on-surface tabular-nums">
                {q.price === null ? EMPTY : fmtNumber(q.price, 2)}
              </td>
              <td className={`pr-3 py-1 text-right font-data-md text-data-md tabular-nums ${changeColor(q.change_pct)}`}>
                {fmtPercent(q.change_pct, 2, true)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
