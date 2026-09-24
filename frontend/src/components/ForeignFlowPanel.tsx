"use client";

import { getForeignFlow } from "@/lib/api";
import { usePolling } from "@/lib/usePolling";
import { EMPTY, fmtNumber, fmtPercent, isNum } from "@/lib/format";
import { PanelSkeleton } from "@/components/ui/Skeleton";

const REFRESH_MS = 300_000; // 5 min

/**
 * Market-level foreign flow (khối ngoại) for the latest day — net buy/sell + share of
 * market. Research-only descriptive numbers. (CafeF has no per-stock leaderboard.)
 */
export default function ForeignFlowPanel() {
  const { data, error, loading } = usePolling(getForeignFlow, REFRESH_MS);

  if (loading && !data) return <PanelSkeleton rows={4} />;
  if (error && !data) return <p className="p-3 text-data-sm text-error">{error}</p>;
  if (!data || !data.available) {
    return (
      <p className="p-3 text-data-sm text-on-surface-variant">
        {data?.note ?? "Chưa lấy được dữ liệu khối ngoại."}
      </p>
    );
  }

  const net = data.net_val ?? null;
  const buy = data.buy_val ?? 0;
  const sell = data.sell_val ?? 0;
  const total = buy + sell || 1;
  const netUp = isNum(net) && net >= 0;

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
          {netUp ? "Mua ròng" : "Bán ròng"} · {data.index ?? "VN"} · {data.date ?? ""}
        </span>
        <span className={`font-data-lg text-data-lg tabular-nums ${netUp ? "text-secondary" : "text-error"}`}>
          {isNum(net) ? `${fmtNumber(Math.abs(net), 0)} tỷ` : EMPTY}
        </span>
      </div>

      {data.stale && (
        <p className="text-data-sm text-error/80">Dữ liệu cũ (chưa cập nhật được từ nguồn).</p>
      )}

      {/* Buy vs sell value bar */}
      <div
        role="img"
        aria-label={`Mua ${fmtNumber(buy, 0)} tỷ, Bán ${fmtNumber(sell, 0)} tỷ`}
        className="flex h-3 w-full overflow-hidden border border-outline-variant"
      >
        <div className="bg-secondary" style={{ width: `${(buy / total) * 100}%` }} title="Mua" />
        <div className="bg-error" style={{ width: `${(sell / total) * 100}%` }} title="Bán" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="border border-outline-variant p-2">
          <div className="font-label-caps text-label-caps uppercase text-secondary">Mua</div>
          <div className="font-data-md text-data-md text-on-surface tabular-nums">
            {fmtNumber(buy, 0)} tỷ
            <span className="ml-2 text-data-sm text-on-surface-variant">
              {isNum(data.pct_buy_val) ? fmtPercent(data.pct_buy_val, 1) : ""} TT
            </span>
          </div>
        </div>
        <div className="border border-outline-variant p-2">
          <div className="font-label-caps text-label-caps uppercase text-error">Bán</div>
          <div className="font-data-md text-data-md text-on-surface tabular-nums">
            {fmtNumber(sell, 0)} tỷ
            <span className="ml-2 text-data-sm text-on-surface-variant">
              {isNum(data.pct_sell_val) ? fmtPercent(data.pct_sell_val, 1) : ""} TT
            </span>
          </div>
        </div>
      </div>

      <p className="text-data-sm text-on-surface-variant opacity-60">
        Giao dịch khối ngoại toàn thị trường (giá trị tỷ VND, % giá trị thị trường) — nguồn CafeF,
        chỉ để nghiên cứu.
      </p>
    </div>
  );
}
