"use client";

import { useEffect, useState } from "react";
import type { InsiderDeal, SymbolInsider } from "@/types/stock";
import { getSymbolInsider } from "@/lib/api";
import { EMPTY, fmtNumber, isNum } from "@/lib/format";
import { PanelSkeleton } from "@/components/ui/Skeleton";

const SHOWN = 12;

/** Share count → compact M/K (unsigned; direction shown via color). */
function fmtShares(v: number | null | undefined): string {
  if (!isNum(v)) return EMPTY;
  const a = Math.abs(v);
  if (a >= 1e6) return `${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(a / 1e3).toFixed(0)}K`;
  return String(Math.round(a));
}

const ACTION_TONE: Record<string, string> = {
  Mua: "text-secondary",
  Bán: "text-error",
  Thưởng: "text-on-surface-variant",
};

function DealRow({ d }: { d: InsiderDeal }) {
  const tone = ACTION_TONE[d.action ?? ""] ?? "text-on-surface-variant";
  return (
    <tr className="border-b border-outline-variant/50">
      <td className="py-1 pr-2 align-top tabular-nums text-on-surface-variant whitespace-nowrap">
        {d.public_date ?? EMPTY}
      </td>
      <td className="py-1 px-2 align-top">
        <div className="text-on-surface">{d.trader ?? EMPTY}</div>
        {d.position && (
          <div className="text-data-sm text-on-surface-variant opacity-60">{d.position}</div>
        )}
      </td>
      <td className={`py-1 px-2 align-top font-bold ${tone}`}>{d.action ?? EMPTY}</td>
      <td className={`py-1 px-2 text-right align-top tabular-nums ${tone}`}>
        {fmtShares(d.transacted_shares)}
      </td>
      <td className="py-1 pl-2 text-right align-top tabular-nums text-on-surface-variant">
        {d.status === "registered" ? (
          <span className="text-data-sm opacity-70">Đăng ký</span>
        ) : isNum(d.ownership_after_pct) ? (
          `${fmtNumber(d.ownership_after_pct, 2)}%`
        ) : (
          EMPTY
        )}
      </td>
    </tr>
  );
}

/**
 * Per-stock insider transactions (giao dịch nội bộ) — filed deals by board/exec insiders,
 * plus a net-direction summary over the last ~6 months. From VCI. Research-only: describes
 * who traded and the resulting ownership; not a buy/sell signal.
 */
export default function InsiderPanel({ symbol }: { symbol: string }) {
  const [data, setData] = useState<SymbolInsider | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    getSymbolInsider(symbol)
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

  if (state === "loading") return <PanelSkeleton rows={4} />;
  if (state === "error" || !data || !data.available) {
    return (
      <p className="text-data-sm text-on-surface-variant">
        {data?.note ?? "Chưa lấy được dữ liệu giao dịch nội bộ."}
      </p>
    );
  }

  const s = data.summary;
  const netUp = s ? s.net_shares > 0 : false;
  const netTone = s && s.direction === "buy" ? "text-secondary" : s && s.direction === "sell" ? "text-error" : "text-on-surface-variant";
  const deals = data.deals ?? [];

  return (
    <div className="space-y-3">
      {s && (
        <div className="flex items-baseline justify-between gap-4">
          <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
            Nội bộ {s.direction === "buy" ? "mua ròng" : s.direction === "sell" ? "bán ròng" : "trung lập"} · {s.window_days} ngày
          </span>
          <span className={`font-data-lg text-data-lg tabular-nums ${netTone}`}>
            {s.net_shares !== 0 ? `${netUp ? "+" : "−"}${fmtShares(s.net_shares)} cp` : EMPTY}
          </span>
        </div>
      )}
      {s && (
        <div className="text-data-sm text-on-surface-variant">
          {s.buy_count} lượt mua · {s.sell_count} lượt bán (đã thực hiện, trong kỳ)
        </div>
      )}

      <table className="w-full border-collapse font-data-md text-data-md">
        <thead>
          <tr className="border-b border-outline-variant text-left">
            <th className="py-1 pr-2 font-label-caps text-label-caps uppercase text-on-surface-variant">Ngày</th>
            <th className="py-1 px-2 font-label-caps text-label-caps uppercase text-on-surface-variant">Người GD</th>
            <th className="py-1 px-2 font-label-caps text-label-caps uppercase text-on-surface-variant">HĐ</th>
            <th className="py-1 px-2 text-right font-label-caps text-label-caps uppercase text-on-surface-variant">KL</th>
            <th className="py-1 pl-2 text-right font-label-caps text-label-caps uppercase text-on-surface-variant">% sau</th>
          </tr>
        </thead>
        <tbody>
          {deals.slice(0, SHOWN).map((d, i) => (
            <DealRow key={`${d.public_date}-${d.trader}-${i}`} d={d} />
          ))}
        </tbody>
      </table>

      <p className="text-data-sm text-on-surface-variant opacity-60">
        {data.count} giao dịch nội bộ đã công bố (hiển thị {Math.min(SHOWN, deals.length)} gần nhất) — nguồn VCI, chỉ để nghiên cứu.
      </p>
    </div>
  );
}
