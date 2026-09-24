"use client";

import { useEffect, useState } from "react";
import type { SectorValuation } from "@/types/stock";
import { getSectorValuation } from "@/lib/api";

const vnd = (v: number | null | undefined): string =>
  v == null ? "—" : `${v.toLocaleString("vi-VN")}đ`;

/** Positive premium = pricier than the sector median (red); negative = cheaper (green). */
function premiumTone(pct: number | null): string {
  if (pct == null) return "text-on-surface-variant";
  return pct > 15 ? "text-error" : pct < -15 ? "text-secondary" : "text-amber-400";
}

const METHOD_LABEL: Record<string, string> = {
  pe_relative: "Theo P/E ngành",
  pb_relative: "Theo P/B ngành",
};

/**
 * Relative valuation vs same-industry peers (sector-median P/E & P/B). Self-fetches so
 * it can render even when the intrinsic valuation has no history. Research-only: it
 * describes where the stock sits against its sector, never a buy/sell call. Renders
 * nothing when the sector data is unavailable (too few peers, no industry).
 */
export default function SectorValuationCard({ symbol }: { symbol: string }) {
  const [data, setData] = useState<SectorValuation | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "none">("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    getSectorValuation(symbol)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setState(d ? "ready" : "none");
      })
      .catch(() => !cancelled && setState("none"));
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  if (state === "loading" || state === "none" || !data) return null;

  const { methods, valuation_range: rng, avg_premium_pct } = data;
  return (
    <div className="border border-outline-variant bg-surface-container-low p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="font-label-caps text-label-caps text-primary uppercase tracking-widest">
          Định giá theo ngành{data.industry ? ` · ${data.industry}` : ""}
        </span>
        <span className="text-data-sm text-on-surface-variant">{data.peer_count} mã cùng ngành</span>
      </div>

      <p className="text-body-md text-on-surface">
        {data.relative_position}
        {avg_premium_pct != null && (
          <span className={`ml-1 font-data-md ${premiumTone(avg_premium_pct)}`}>
            ({avg_premium_pct > 0 ? "+" : ""}
            {avg_premium_pct}% vs trung vị ngành)
          </span>
        )}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(["pe_relative", "pb_relative"] as const).map((key) => {
          const m = methods[key];
          return (
            <div key={key} className="bg-surface-container p-3 border border-outline-variant">
              <div className="flex items-center justify-between">
                <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                  {METHOD_LABEL[key]}
                </span>
                {m.premium_pct != null && (
                  <span className={`font-data-sm tabular-nums ${premiumTone(m.premium_pct)}`}>
                    {m.premium_pct > 0 ? "+" : ""}
                    {m.premium_pct}%
                  </span>
                )}
              </div>
              <div className={`font-data-md text-data-md mt-1 ${m.value != null ? "text-on-surface" : "text-on-surface-variant"}`}>
                {m.value != null ? vnd(m.value) : "Không tính được"}
                {m.own_multiple != null && m.sector_multiple != null && (
                  <span className="ml-2 text-data-sm text-on-surface-variant">
                    ({m.own_multiple} vs {m.sector_multiple})
                  </span>
                )}
              </div>
              <p className="text-data-sm text-on-surface-variant opacity-70 mt-1">{m.note}</p>
            </div>
          );
        })}
      </div>

      {rng.median != null && (
        <p className="text-body-md text-on-surface">
          Vùng giá theo bội số ngành: <strong>{vnd(rng.low)}</strong> – <strong>{vnd(rng.high)}</strong>{" "}
          (trung vị {vnd(rng.median)}). {data.vs_current_price.interpretation}
        </p>
      )}

      {data.notes.length > 0 && (
        <ul className="text-data-sm text-on-surface-variant opacity-80 list-disc pl-4">
          {data.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      <p className="text-data-sm text-on-surface-variant opacity-60 border-t border-outline-variant pt-2">
        So sánh tương đối với mặt bằng ngành (không áp dụng biên an toàn) — mô tả, không phải khuyến nghị.
      </p>
    </div>
  );
}
