"use client";

import { useEffect, useState } from "react";
import type { Compass, CompassHorizon } from "@/types/stock";
import { getCompass } from "@/lib/api";
import RoeHistoryChart from "@/components/RoeHistoryChart";
import DividendHistoryChart from "@/components/DividendHistoryChart";

const HORIZONS: { key: keyof Pick<Compass, "short_term" | "mid_term" | "long_term">; label: string; sub: string }[] = [
  { key: "short_term", label: "Ngắn hạn", sub: "1–3 tháng · Động lượng" },
  { key: "mid_term", label: "Trung hạn", sub: "6–12 tháng · Tăng trưởng + Định giá" },
  { key: "long_term", label: "Dài hạn", sub: "1 năm+ · Chất lượng" },
];

const BREAKDOWN_LABELS: Record<string, string> = {
  technical: "Kỹ thuật",
  valuation_pe_hist: "P/E vs lịch sử",
  valuation_relative: "Giá tương đối",
  catalyst: "Chất xúc tác",
  growth_consistency: "Tăng trưởng ổn định",
  valuation_fair: "Định giá hợp lý",
  roe_trend: "Xu hướng ROE",
  financial_quality: "Chất lượng tài chính",
  roe_quality: "Chất lượng ROE",
  dividend_consistency: "Cổ tức đều đặn",
};

// Color by band — NOT a buy/sell label, just a visual scale.
function bandColor(score: number | null): { bar: string; text: string } {
  if (score == null) return { bar: "bg-outline", text: "text-on-surface-variant" };
  if (score >= 65) return { bar: "bg-secondary", text: "text-secondary" };
  if (score >= 40) return { bar: "bg-primary", text: "text-primary" };
  return { bar: "bg-error", text: "text-error" };
}

function HorizonCard({
  label,
  sub,
  horizon,
  expanded,
  onToggle,
}: {
  label: string;
  sub: string;
  horizon: CompassHorizon;
  expanded: boolean;
  onToggle: () => void;
}) {
  const c = bandColor(horizon.score);
  return (
    <div className="border border-outline-variant bg-surface-container-low">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-4 hover:bg-surface-container transition-colors"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="font-label-caps text-label-caps text-on-surface uppercase">{label}</div>
            <div className="text-data-sm text-on-surface-variant opacity-70">{sub}</div>
          </div>
          <div className={`font-display-md text-display-md ${c.text}`}>
            {horizon.score != null ? horizon.score.toFixed(0) : "—"}
          </div>
        </div>
        <div className="mt-3 h-2 bg-surface-container-high rounded overflow-hidden">
          <div
            className={`h-2 ${c.bar} transition-all`}
            style={{ width: `${horizon.score ?? 0}%` }}
          />
        </div>
        <div className="mt-1 text-data-sm text-on-surface-variant opacity-60">
          {expanded ? "Thu gọn ▲" : "Xem chi tiết ▼"}
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-outline-variant pt-3">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(horizon.breakdown).map(([k, v]) => (
              <div key={k} className="bg-surface-container p-2 border border-outline-variant">
                <div className="text-data-sm text-on-surface-variant">{BREAKDOWN_LABELS[k] ?? k}</div>
                <div className={`font-data-md text-data-md ${bandColor(v).text}`}>
                  {v != null ? v.toFixed(0) : "N/A"}
                </div>
              </div>
            ))}
          </div>
          <ul className="list-disc list-inside text-body-md text-on-surface space-y-0.5">
            {horizon.explanation.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function CompassPanel({ symbol }: { symbol: string }) {
  const [compass, setCompass] = useState<Compass | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getCompass(symbol)
      .then((d) => !cancelled && setCompass(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Lỗi Kim Chỉ Nam"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  if (loading) {
    return <p className="text-on-surface-variant font-data-md text-data-md">Đang tính Kim Chỉ Nam…</p>;
  }
  if (error || !compass) {
    return (
      <p className="text-on-surface-variant font-data-md text-data-md py-3 text-center border border-outline-variant border-dashed">
        {error ?? "Không có dữ liệu."}
      </p>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="font-label-caps text-label-caps text-primary uppercase tracking-widest">
        Kim Chỉ Nam
      </h2>
      <p className="text-on-surface-variant text-body-md opacity-80 border-l-2 border-primary pl-3">
        {compass.disclaimer}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {HORIZONS.map((h) => (
          <HorizonCard
            key={h.key}
            label={h.label}
            sub={h.sub}
            horizon={compass[h.key]}
            expanded={expanded === h.key}
            onToggle={() => setExpanded(expanded === h.key ? null : h.key)}
          />
        ))}
      </div>
      {(compass.roe_history || compass.dividend_history) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {compass.roe_history && (
            <div className="border border-outline-variant bg-surface-container-low p-4">
              <RoeHistoryChart data={compass.roe_history} />
            </div>
          )}
          {compass.dividend_history && (
            <div className="border border-outline-variant bg-surface-container-low p-4">
              <DividendHistoryChart data={compass.dividend_history} />
            </div>
          )}
        </div>
      )}
      {compass.data_gaps.length > 0 && (
        <div className="text-data-sm text-on-surface-variant opacity-70">
          <span className="font-label-caps text-label-caps uppercase">Thiếu dữ liệu:</span>{" "}
          {compass.data_gaps.join(" · ")}
        </div>
      )}
    </section>
  );
}
