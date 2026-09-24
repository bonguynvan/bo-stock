"use client";

import type { MarketBreadth, MoverRow } from "@/types/stock";
import { EMPTY, changeColor, fmtNumber, fmtPercent, isNum } from "@/lib/format";
import { rowButtonProps } from "@/lib/a11y";

export function fmtVol(v: number | null): string {
  if (!isNum(v)) return EMPTY;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return fmtNumber(v);
}

/** Net organizational flow (tỷ VND) — green mua ròng, red bán ròng. Reused for
 *  khối ngoại (foreign) and tự doanh (proprietary desk). */
function NetCell({ v, title }: { v: number | null | undefined; title: string }) {
  if (!isNum(v)) return <td className="pr-3 py-1 text-right text-on-surface-variant opacity-40">{EMPTY}</td>;
  const up = v >= 0;
  return (
    <td
      className={`pr-3 py-1 text-right font-data-md text-data-sm tabular-nums ${up ? "text-secondary" : "text-error"}`}
      title={title}
    >
      {up ? "+" : "−"}
      {fmtNumber(Math.abs(v), 1)}
    </td>
  );
}

/** Advancers vs decliners proportion bar + counts. */
export function BreadthBar({ breadth }: { breadth: MarketBreadth }) {
  const { advancers, decliners, unchanged, total } = breadth;
  if (total === 0) {
    return (
      <p className="text-data-sm text-on-surface-variant">
        Chưa có % thay đổi — cần đồng bộ giá ngày để đo độ rộng thị trường.
      </p>
    );
  }
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="space-y-1">
      <div className="flex h-3 w-full overflow-hidden border border-outline-variant">
        <div className="bg-secondary" style={{ width: pct(advancers) }} />
        <div className="bg-on-surface-variant/30" style={{ width: pct(unchanged) }} />
        <div className="bg-error" style={{ width: pct(decliners) }} />
      </div>
      <div className="flex justify-between font-data-md text-data-sm">
        <span className="text-secondary">▲ {advancers} tăng</span>
        <span className="text-on-surface-variant">{unchanged} đứng</span>
        <span className="text-error">{decliners} giảm ▼</span>
      </div>
    </div>
  );
}

interface MoverListProps {
  rows: MoverRow[];
  onOpenSymbol?: (symbol: string) => void;
  mode?: "change" | "volume";
  emptyLabel?: string;
}

/** Compact symbol list: price + day change, or 30d volume. */
export function MoverList({ rows, onOpenSymbol, mode = "change", emptyLabel }: MoverListProps) {
  if (rows.length === 0) {
    return (
      <p className="px-3 py-2 text-data-sm text-on-surface-variant">
        {emptyLabel ?? "Không có dữ liệu."}
      </p>
    );
  }
  return (
    <table className="w-full border-collapse">
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.symbol}
            {...(onOpenSymbol ? rowButtonProps(() => onOpenSymbol(r.symbol), `Mở ${r.symbol}`) : {})}
            className={`border-b border-outline-variant/50 hover:bg-surface-container-low ${
              onOpenSymbol ? "cursor-pointer focus:outline focus:outline-1 focus:outline-primary" : ""
            }`}
          >
            <td className="pl-3 py-1 font-data-md text-data-md font-bold text-primary">{r.symbol}</td>
            <td className="py-1 text-right font-data-md text-data-md text-on-surface tabular-nums">
              {r.close_price === null ? EMPTY : fmtNumber(r.close_price, 2)}
            </td>
            {mode === "change" ? (
              <td className={`py-1 text-right font-data-md text-data-md tabular-nums ${changeColor(r.change_pct)}`}>
                {fmtPercent(r.change_pct, 2, true)}
              </td>
            ) : (
              <td className="py-1 text-right font-data-md text-data-md text-on-surface-variant tabular-nums">
                {fmtVol(r.avg_volume_30d)}
              </td>
            )}
            <NetCell v={r.foreign_net} title="Khối ngoại mua/bán ròng (tỷ VND, phiên gần nhất)" />
            <NetCell v={r.prop_net} title="Tự doanh mua/bán ròng (tỷ VND, phiên gần nhất)" />
          </tr>
        ))}
      </tbody>
    </table>
  );
}
