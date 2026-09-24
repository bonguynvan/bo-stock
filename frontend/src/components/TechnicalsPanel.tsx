"use client";

import { useEffect, useState } from "react";
import type { Technicals } from "@/types/stock";
import { getTechnicals } from "@/lib/api";
import { EMPTY, fmtDecimal, fmtNumber, isNum } from "@/lib/format";

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="bg-surface-container p-2 border border-outline-variant">
      <div className="font-label-caps text-label-caps text-on-surface-variant uppercase">{label}</div>
      <div className="font-data-md text-data-md text-on-surface mt-0.5">{value}</div>
      {note && <div className="text-data-sm text-on-surface-variant opacity-70 mt-0.5">{note}</div>}
    </div>
  );
}

/** A 0–100 gauge (RSI, 52w position) with the value marked. */
function Gauge({ value, lo = 0, hi = 100 }: { value: number; lo?: number; hi?: number }) {
  const pct = Math.max(0, Math.min(100, ((value - lo) / (hi - lo)) * 100));
  return (
    <div className="relative h-1.5 w-full bg-surface-container-high mt-1">
      <div className="absolute top-0 h-full w-0.5 bg-primary" style={{ left: `${pct}%` }} />
    </div>
  );
}

/**
 * Technical indicators for a symbol — SMA/RSI/MACD/Bollinger/ATR/52w. Research-only:
 * descriptive numbers with neutral context, never buy/sell signals.
 */
export default function TechnicalsPanel({ symbol }: { symbol: string }) {
  const [data, setData] = useState<Technicals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getTechnicals(symbol)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Lỗi tải dữ liệu"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  if (loading) return <p className="p-3 text-data-sm text-on-surface-variant">Đang tính chỉ báo…</p>;
  if (error) return <p className="p-3 text-data-sm text-error">{error}</p>;
  if (!data || !data.available) {
    return (
      <p className="p-3 text-data-sm text-on-surface-variant">
        Chưa đủ dữ liệu giá để tính chỉ báo (cần OHLC).
      </p>
    );
  }

  const { price, sma20, sma50, rsi14, macd, bollinger, atr14, week52 } = data;
  const vsMa = (ma: number | null | undefined) =>
    isNum(price) && isNum(ma) ? (price >= ma ? "Giá ≥ đường" : "Giá < đường") : undefined;

  return (
    <div className="p-3 space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat label="Giá" value={isNum(price) ? fmtNumber(price, 2) : EMPTY} />
        <Stat label="SMA 20" value={isNum(sma20) ? fmtNumber(sma20, 2) : EMPTY} note={vsMa(sma20)} />
        <Stat label="SMA 50" value={isNum(sma50) ? fmtNumber(sma50, 2) : EMPTY} note={vsMa(sma50)} />
        <Stat label="ATR (14)" value={isNum(atr14) ? fmtNumber(atr14, 2) : EMPTY} note="biến động TB" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="bg-surface-container p-2 border border-outline-variant">
          <div className="font-label-caps text-label-caps text-on-surface-variant uppercase">
            RSI (14) · thang 0–100
          </div>
          <div className="font-data-md text-data-md text-on-surface mt-0.5">
            {isNum(rsi14) ? fmtDecimal(rsi14, 1) : EMPTY}
            <span className="ml-2 text-data-sm text-on-surface-variant opacity-70">
              &gt;70 thường gọi “quá mua”, &lt;30 “quá bán”
            </span>
          </div>
          {isNum(rsi14) && <Gauge value={rsi14} />}
        </div>

        <div className="bg-surface-container p-2 border border-outline-variant">
          <div className="font-label-caps text-label-caps text-on-surface-variant uppercase">
            Vị trí trong dải 52 tuần
          </div>
          <div className="font-data-md text-data-md text-on-surface mt-0.5">
            {isNum(week52?.position) ? `${fmtDecimal(week52!.position!, 0)}%` : EMPTY}
            <span className="ml-2 text-data-sm text-on-surface-variant opacity-70">
              {isNum(week52?.low) && isNum(week52?.high)
                ? `${fmtNumber(week52!.low!, 2)} – ${fmtNumber(week52!.high!, 2)}`
                : ""}
            </span>
          </div>
          {isNum(week52?.position) && <Gauge value={week52!.position!} />}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat label="MACD" value={isNum(macd?.line) ? fmtDecimal(macd!.line!, 3) : EMPTY} />
        <Stat label="Signal" value={isNum(macd?.signal) ? fmtDecimal(macd!.signal!, 3) : EMPTY} />
        <Stat
          label="MACD Hist"
          value={isNum(macd?.hist) ? fmtDecimal(macd!.hist!, 3) : EMPTY}
          note={isNum(macd?.hist) ? (macd!.hist! >= 0 ? "hist ≥ 0" : "hist < 0") : undefined}
        />
        <Stat
          label="Bollinger %B"
          value={isNum(bollinger?.percent_b) ? fmtDecimal(bollinger!.percent_b!, 2) : EMPTY}
          note={isNum(bollinger?.width) ? `width ${fmtDecimal(bollinger!.width!, 1)}%` : undefined}
        />
      </div>

      <p className="text-data-sm text-on-surface-variant opacity-60">
        Chỉ báo kỹ thuật là số liệu mô tả để bạn tự nghiên cứu — không phải tín hiệu mua/bán.
      </p>
    </div>
  );
}
