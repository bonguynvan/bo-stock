"use client";

import { useEffect, useState } from "react";
import type { SymbolProp } from "@/types/stock";
import { getSymbolProp } from "@/lib/api";
import { EMPTY, fmtNumber, isNum } from "@/lib/format";
import { PanelSkeleton } from "@/components/ui/Skeleton";

/**
 * Per-stock proprietary-desk (tự doanh) flow for the latest session — net buy/sell by
 * securities firms, from CafeF. A second organizational-flow lens alongside khối ngoại.
 * Self-fetches per symbol. Research-only descriptive numbers, no advice.
 */
export default function PropTradingPanel({ symbol }: { symbol: string }) {
  const [data, setData] = useState<SymbolProp | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    getSymbolProp(symbol)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setState("ready");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  if (state === "loading") return <PanelSkeleton rows={3} />;
  if (state === "error" || !data || !data.available) {
    return (
      <p className="text-data-sm text-on-surface-variant">
        {data?.note ?? "Chưa lấy được dữ liệu tự doanh."}
      </p>
    );
  }

  const net = data.net_val ?? null;
  const buy = data.buy_val ?? 0;
  const sell = data.sell_val ?? 0;
  const total = buy + sell || 1;
  const netUp = isNum(net) && net >= 0;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
          {netUp ? "Mua ròng" : "Bán ròng"}
          {data.date ? ` (${data.date})` : " (phiên gần nhất)"}
        </span>
        <span className={`font-data-lg text-data-lg tabular-nums ${netUp ? "text-secondary" : "text-error"}`}>
          {isNum(net) ? `${fmtNumber(Math.abs(net), 1)} tỷ` : EMPTY}
        </span>
      </div>

      {/* Buy vs sell value bar */}
      <div
        role="img"
        aria-label={`Mua ${fmtNumber(buy, 1)} tỷ, Bán ${fmtNumber(sell, 1)} tỷ`}
        className="flex h-3 w-full overflow-hidden border border-outline-variant"
      >
        <div className="bg-secondary" style={{ width: `${(buy / total) * 100}%` }} title="Mua" />
        <div className="bg-error" style={{ width: `${(sell / total) * 100}%` }} title="Bán" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="border border-outline-variant p-2">
          <div className="font-label-caps text-label-caps uppercase text-secondary">Mua</div>
          <div className="font-data-md text-data-md text-on-surface tabular-nums">{fmtNumber(buy, 1)} tỷ</div>
        </div>
        <div className="border border-outline-variant p-2">
          <div className="font-label-caps text-label-caps uppercase text-error">Bán</div>
          <div className="font-data-md text-data-md text-on-surface tabular-nums">{fmtNumber(sell, 1)} tỷ</div>
        </div>
      </div>

      <p className="text-data-sm text-on-surface-variant opacity-60">
        Giao dịch tự doanh của CTCK theo mã (giá trị tỷ VND, phiên gần nhất) — nguồn CafeF, chỉ để nghiên cứu.
      </p>
    </div>
  );
}
