"use client";

import { useEffect, useState } from "react";
import type { PortfolioRisk } from "@/types/stock";
import { getPortfolioRisk } from "@/lib/api";
import { EMPTY, fmtDecimal, fmtPercent, isNum } from "@/lib/format";

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-surface-container p-3 border border-outline-variant">
      <div className="font-label-caps text-label-caps text-on-surface-variant uppercase">{label}</div>
      <div className="font-data-md text-data-md text-on-surface mt-0.5">{value}</div>
      {hint && <div className="text-data-sm text-on-surface-variant opacity-60 mt-0.5">{hint}</div>}
    </div>
  );
}

/** Correlation colour: green (diversifying, low/negative) → red (concentrated, high). */
function corrBg(c: number | null): string {
  if (!isNum(c)) return "transparent";
  const t = Math.max(0, Math.min(1, (c + 1) / 2)); // -1→0, +1→1
  return `rgba(239,68,68,${(0.1 + 0.5 * t).toFixed(3)})`;
}

/**
 * Portfolio risk statistics (volatility/Sharpe/drawdown/VaR) + a holding correlation
 * list. Research-only: descriptive numbers, no advice. Degrades to a note when price
 * history is thin.
 */
export default function PortfolioRiskPanel() {
  const [data, setData] = useState<PortfolioRisk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getPortfolioRisk()
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Lỗi tải dữ liệu"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p className="text-data-sm text-on-surface-variant">Đang tính rủi ro…</p>;
  if (error) return <p className="text-data-sm text-error">{error}</p>;
  if (!data) return null;

  if (!data.available || !data.metrics) {
    return (
      <p className="text-data-sm text-on-surface-variant border border-outline-variant border-dashed p-3">
        {data.note ?? "Chưa đủ dữ liệu để tính rủi ro danh mục."}
      </p>
    );
  }

  const m = data.metrics;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Metric
          label="Biến động (năm)"
          value={isNum(m.annual_volatility) ? fmtPercent(m.annual_volatility * 100, 1) : EMPTY}
          hint={`${m.days} phiên`}
        />
        <Metric label="Sharpe (rf=0)" value={isNum(m.sharpe) ? fmtDecimal(m.sharpe, 2) : EMPTY} />
        <Metric
          label="Sụt giảm tối đa"
          value={isNum(m.max_drawdown) ? fmtPercent(m.max_drawdown * 100, 1) : EMPTY}
        />
        <Metric
          label="VaR 95% (1 ngày)"
          value={isNum(m.var_95) ? fmtPercent(m.var_95 * 100, 2) : EMPTY}
          hint="mức lỗ ngày ước tính"
        />
      </div>

      {data.correlations && data.correlations.length > 0 && (
        <div>
          <div className="font-label-caps text-label-caps uppercase text-on-surface-variant mb-1">
            Tương quan giữa các mã (thấp = phân tán rủi ro tốt hơn)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.correlations.map((c) => (
              <span
                key={`${c.a}-${c.b}`}
                style={{ backgroundColor: corrBg(c.corr) }}
                className="px-2 py-1 border border-outline-variant font-data-md text-data-sm text-on-surface"
              >
                {c.a}·{c.b}: {isNum(c.corr) ? fmtDecimal(c.corr, 2) : EMPTY}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="text-data-sm text-on-surface-variant opacity-60">{data.note}</p>
    </div>
  );
}
