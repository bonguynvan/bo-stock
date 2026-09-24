"use client";

import { useEffect, useState } from "react";
import type { SymbolForeign } from "@/types/stock";
import { getSymbolForeign } from "@/lib/api";
import { EMPTY, fmtNumber, isNum } from "@/lib/format";
import { PanelSkeleton } from "@/components/ui/Skeleton";

/**
 * Per-stock foreign (khối ngoại) flow for the latest session — net buy/sell + ownership
 * room, from the VCI price board. Self-fetches per symbol. Research-only descriptive
 * numbers, no advice. Renders a note when the source is unreachable.
 */
export default function ForeignStockPanel({ symbol }: { symbol: string }) {
  const [data, setData] = useState<SymbolForeign | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    getSymbolForeign(symbol)
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
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
          {netUp ? "Mua ròng" : "Bán ròng"} (phiên gần nhất)
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

      <div className="grid grid-cols-3 gap-2">
        <div className="border border-outline-variant p-2">
          <div className="font-label-caps text-label-caps uppercase text-secondary">Mua</div>
          <div className="font-data-md text-data-md text-on-surface tabular-nums">{fmtNumber(buy, 1)} tỷ</div>
        </div>
        <div className="border border-outline-variant p-2">
          <div className="font-label-caps text-label-caps uppercase text-error">Bán</div>
          <div className="font-data-md text-data-md text-on-surface tabular-nums">{fmtNumber(sell, 1)} tỷ</div>
        </div>
        <div className="border border-outline-variant p-2">
          <div className="font-label-caps text-label-caps uppercase text-on-surface-variant">Room đã dùng</div>
          <div className="font-data-md text-data-md text-on-surface tabular-nums">
            {isNum(data.room_used_pct) ? `${data.room_used_pct}%` : EMPTY}
          </div>
        </div>
      </div>

      <p className="text-data-sm text-on-surface-variant opacity-60">
        Giao dịch khối ngoại theo mã (giá trị tỷ VND, phiên gần nhất) — nguồn VCI, chỉ để nghiên cứu.
      </p>
    </div>
  );
}
