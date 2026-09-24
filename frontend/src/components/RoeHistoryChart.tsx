"use client";

import type { RoeHistory } from "@/types/stock";

const TREND_LABEL: Record<RoeHistory["trend"], string> = {
  rising: "Xu hướng tăng",
  stable: "Đi ngang",
  falling: "Xu hướng giảm",
};

// Color the bars by ROE level — a visual scale, not a buy/sell signal.
function barColor(roe: number): string {
  if (roe >= 20) return "bg-secondary";
  if (roe >= 10) return "bg-primary";
  if (roe > 0) return "bg-on-surface-variant";
  return "bg-error";
}

/**
 * Real multi-year ROE history (bar chart). Sourced from VCI's yearly ratio series
 * (metric_history) — available without a BCTC. Research-only: numbers + neutral
 * framing, no recommendation.
 */
export default function RoeHistoryChart({ data }: { data: RoeHistory }) {
  const max = Math.max(...data.series.map((p) => p.roe), 1);
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="font-label-caps text-label-caps text-on-surface uppercase tracking-wide">
          ROE {data.n} năm
        </h3>
        <span className="text-data-sm text-on-surface-variant">
          {TREND_LABEL[data.trend]} · TB 3 năm {data.avg_recent.toFixed(1)}%
        </span>
      </div>

      <div className="flex items-end gap-1 h-24" role="img" aria-label={`Lịch sử ROE ${data.n} năm`}>
        {data.series.map((p) => (
          <div key={p.year} className="flex flex-1 flex-col items-center gap-1 group">
            <span className="text-data-sm text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity">
              {p.roe.toFixed(1)}
            </span>
            <div
              className={`w-full ${barColor(p.roe)} transition-all`}
              style={{ height: `${Math.max((Math.max(p.roe, 0) / max) * 72, 2)}px` }}
              title={`${p.year}: ROE ${p.roe.toFixed(1)}%`}
            />
            <span className="text-data-sm text-on-surface-variant opacity-60">
              {`'${String(p.year).slice(2)}`}
            </span>
          </div>
        ))}
      </div>

      {data.is_spike && (
        <p className="text-data-sm text-primary border-l-2 border-primary pl-2">
          ROE năm gần nhất cao bất thường ({data.spike_factor?.toFixed(1)}× TB các năm trước) —
          nên xem kỹ nguồn lợi nhuận trước khi kết luận.
        </p>
      )}
    </section>
  );
}
