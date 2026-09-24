"use client";

import { useEffect, useState } from "react";
import type { InvestmentLens, LensCriterion } from "@/types/stock";
import { getLenses } from "@/lib/api";
import { EMPTY, fmtDecimal, isNum } from "@/lib/format";

const STATUS: Record<LensCriterion["status"], { icon: string; cls: string }> = {
  pass: { icon: "check_circle", cls: "text-secondary" },
  fail: { icon: "cancel", cls: "text-error" },
  na: { icon: "remove", cls: "text-on-surface-variant opacity-50" },
};

function LensCard({ lens }: { lens: InvestmentLens }) {
  const ratio = lens.total > 0 ? lens.met / lens.total : 0;
  const tone = ratio >= 0.7 ? "text-secondary" : ratio <= 0.3 ? "text-on-surface-variant" : "text-on-surface";
  return (
    <div className="border border-outline-variant bg-surface-container-lowest">
      <div className="flex items-center gap-2 px-3 h-9 border-b border-outline-variant bg-surface-container-low">
        <span className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface">
          {lens.name}
        </span>
        <span className={`ml-auto font-data-md text-data-md ${tone}`}>
          {lens.total > 0 ? `${lens.met}/${lens.total}` : EMPTY}
        </span>
      </div>
      <div className="p-3 space-y-1.5">
        <p className="text-data-sm text-on-surface-variant opacity-70">{lens.description}</p>
        <ul className="space-y-1">
          {lens.criteria.map((c) => {
            const s = STATUS[c.status];
            return (
              <li key={c.label} className="flex items-center gap-2">
                <span className={`material-symbols-outlined ${s.cls}`} style={{ fontSize: "16px" }}>
                  {s.icon}
                </span>
                <span className="font-data-md text-data-md text-on-surface flex-1">{c.label}</span>
                <span className="font-data-md text-data-sm text-on-surface-variant tabular-nums">
                  {isNum(c.detail) ? fmtDecimal(c.detail, 2) : EMPTY}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/**
 * Investment "lenses" — criteria checklists per school (Graham/Lynch/Quality) on the
 * stock's metrics. Descriptive: which criteria are met, never a buy/sell verdict.
 */
export default function LensesPanel({ symbol }: { symbol: string }) {
  const [lenses, setLenses] = useState<InvestmentLens[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getLenses(symbol)
      .then((l) => !cancelled && setLenses(l))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Lỗi tải dữ liệu"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  if (loading) return <p className="p-3 text-data-sm text-on-surface-variant">Đang đánh giá…</p>;
  if (error) return <p className="p-3 text-data-sm text-error">{error}</p>;
  if (lenses.length === 0)
    return <p className="p-3 text-data-sm text-on-surface-variant">Chưa có dữ liệu chỉ số.</p>;

  return (
    <div className="p-3 space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
        {lenses.map((l) => (
          <LensCard key={l.key} lens={l} />
        ))}
      </div>
      <p className="text-data-sm text-on-surface-variant opacity-60">
        Số tiêu chí đạt theo từng trường phái — mô tả để bạn tự nghiên cứu, không phải khuyến nghị.
        “—” = thiếu dữ liệu, không tính vào tổng.
      </p>
    </div>
  );
}
