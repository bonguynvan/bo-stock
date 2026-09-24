"use client";

import { getCryptoMarkets } from "@/lib/api";
import { EMPTY, changeColor, fmtNumber, fmtPercent, isNum } from "@/lib/format";
import { usePolling } from "@/lib/usePolling";
import { PanelSkeleton } from "@/components/ui/Skeleton";

const REFRESH_MS = 60_000;

function fmtCap(value: number | null): string {
  if (!isNum(value)) return EMPTY;
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(0)}M`;
  return fmtNumber(value, 0);
}

/** Crypto basket (CoinGecko) — last price, 24h change, market cap. Research-only. */
export default function CryptoPanel() {
  const { data, error, loading } = usePolling(getCryptoMarkets, REFRESH_MS);
  const rows = data ?? [];

  if (loading && rows.length === 0) return <PanelSkeleton />;
  if (error && rows.length === 0) return <p className="p-3 text-data-sm text-error">{error}</p>;

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="text-on-surface-variant border-b border-outline-variant">
          <th className="pl-3 py-1 text-left font-label-caps text-label-caps uppercase">Coin</th>
          <th className="py-1 text-right font-label-caps text-label-caps uppercase">Giá (USD)</th>
          <th className="py-1 text-right font-label-caps text-label-caps uppercase">24h</th>
          <th className="pr-3 py-1 text-right font-label-caps text-label-caps uppercase">Vốn hóa</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.symbol} className="border-b border-outline-variant/50 hover:bg-surface-container-low">
            <td className="pl-3 py-1">
              <span className="font-data-md text-data-md font-bold text-primary">{c.symbol}</span>
              <span className="ml-2 font-data-md text-data-sm text-on-surface-variant opacity-60">{c.name}</span>
            </td>
            <td className="py-1 text-right font-data-md text-data-md text-on-surface tabular-nums">
              {c.price === null ? EMPTY : fmtNumber(c.price, 2)}
            </td>
            <td className={`py-1 text-right font-data-md text-data-md tabular-nums ${changeColor(c.change_pct)}`}>
              {fmtPercent(c.change_pct, 2, true)}
            </td>
            <td className="pr-3 py-1 text-right font-data-md text-data-md text-on-surface-variant tabular-nums">
              {fmtCap(c.market_cap)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
