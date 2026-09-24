"use client";

import { useEffect, useState } from "react";
import type { FraudScores } from "@/types/stock";
import { getFraudScores } from "@/lib/api";

const BENEISH_TONE: Record<string, string> = {
  high_risk: "text-error border-error/50",
  medium_risk: "text-amber-400 border-amber-400/50",
  low_risk: "text-secondary border-secondary/40",
  insufficient_data: "text-on-surface-variant border-outline-variant",
};
const ZONE_TONE: Record<string, string> = {
  safe: "text-secondary border-secondary/40",
  grey: "text-amber-400 border-amber-400/50",
  distress: "text-error border-error/50",
  not_applicable: "text-on-surface-variant border-outline-variant",
  insufficient_data: "text-on-surface-variant border-outline-variant",
};
const FLAG_LABEL: Record<string, string> = {
  high_risk: "Rủi ro cao", medium_risk: "Cảnh báo TB",
  low_risk: "Rủi ro thấp", insufficient_data: "Thiếu dữ liệu",
};
const QOE_TONE: Record<string, string> = {
  strong: "text-secondary border-secondary/40",
  adequate: "text-amber-400 border-amber-400/50",
  weak: "text-error border-error/50",
  insufficient_data: "text-on-surface-variant border-outline-variant",
};
const QOE_LABEL: Record<string, string> = {
  strong: "Chất lượng tốt", adequate: "Chấp nhận được",
  weak: "Chất lượng thấp", insufficient_data: "Thiếu dữ liệu",
};

/** 0-100 sub-score → red (low) → green (high). */
function subScoreTone(v: number): string {
  return v >= 70 ? "text-secondary" : v >= 45 ? "text-amber-400" : "text-error";
}
const ZONE_LABEL: Record<string, string> = {
  safe: "An toàn", grey: "Cảnh báo", distress: "Nguy hiểm",
  not_applicable: "Không áp dụng", insufficient_data: "Thiếu dữ liệu",
};

function Card({ title, badge, tone, children }: {
  title: string; badge: string; tone: string; children: React.ReactNode;
}) {
  return (
    <div className={`border ${tone} bg-surface-container-low p-3 flex flex-col gap-1.5`}>
      <div className="flex items-center justify-between">
        <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">{title}</span>
        <span className={`font-label-caps text-label-caps uppercase ${tone.split(" ")[0]}`}>{badge}</span>
      </div>
      {children}
    </div>
  );
}

export default function FraudDetectionPanel({ symbol }: { symbol: string }) {
  const [data, setData] = useState<FraudScores | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "none">("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    getFraudScores(symbol)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setState(d ? "ready" : "none");
      })
      .catch(() => !cancelled && setState("none"));
    return () => { cancelled = true; };
  }, [symbol]);

  if (state === "loading") {
    return <p className="text-on-surface-variant font-data-md text-data-md animate-pulse">Đang tính điểm sàng lọc…</p>;
  }
  if (state === "none" || !data) {
    return (
      <p className="text-on-surface-variant text-body-md">
        Chưa đủ dữ liệu BCTC (cần ≥2 năm) để tính điểm sàng lọc định lượng.
      </p>
    );
  }

  const { beneish: b, altman: a, piotroski: p, earnings_quality: q } = data;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Beneish */}
        <Card title="Beneish M-Score" badge={FLAG_LABEL[b.flag]} tone={BENEISH_TONE[b.flag]}>
          <div className="font-display-sm text-display-sm">{b.score ?? "—"}</div>
          <p className="text-data-sm text-on-surface-variant">{b.interpretation}</p>
          <p className="text-data-sm text-on-surface-variant opacity-60">{b.variables_used}/8 biến</p>
          {b.top_contributors.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {b.top_contributors.map((t) => (
                <li key={t.variable} className="text-data-sm">
                  <span className={t.variable === "TATA" ? "text-primary font-bold" : "font-bold"}>
                    {t.variable}
                  </span>
                  <span className="text-on-surface-variant"> · {t.meaning}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Altman Z'' */}
        <Card title="Altman Z″ (thị trường mới nổi)" badge={ZONE_LABEL[a.zone]} tone={ZONE_TONE[a.zone]}>
          <div className="font-display-sm text-display-sm">{a.score ?? "—"}</div>
          <p className="text-data-sm text-on-surface-variant">{a.interpretation}</p>
          <p className="text-data-sm text-on-surface-variant opacity-60">
            Z gốc (US): {a.original.score ?? "—"} · {ZONE_LABEL[a.original.zone] ?? a.original.zone}
          </p>
        </Card>

        {/* Piotroski */}
        <Card title="Piotroski F-Score" badge={`${p.score}/${p.max_score}`}
          tone={p.score >= 7 ? "text-secondary border-secondary/40" : p.score <= 2 ? "text-error border-error/50" : "text-amber-400 border-amber-400/50"}>
          <div className="font-display-sm text-display-sm">{p.score}<span className="text-headline-sm text-on-surface-variant">/{p.max_score}</span></div>
          <ul className="mt-0.5 grid grid-cols-1 gap-0.5">
            {p.criteria.map((c) => (
              <li key={c.name} className="text-data-sm flex items-center gap-1">
                <span className={c.passed === null ? "text-on-surface-variant opacity-40" : c.passed ? "text-secondary" : "text-error"}>
                  {c.passed === null ? "–" : c.passed ? "✓" : "✗"}
                </span>
                <span className={c.passed === null ? "text-on-surface-variant opacity-40" : "text-on-surface-variant"}>{c.name}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Quality of Earnings — the "is profit backed by real cash?" lens. */}
      <Card
        title="Chất lượng lợi nhuận (QoE)"
        badge={q.score !== null ? `${QOE_LABEL[q.flag]} · ${q.score}/100` : QOE_LABEL[q.flag]}
        tone={QOE_TONE[q.flag]}
      >
        <p className="text-data-sm text-on-surface-variant">{q.interpretation}</p>
        {q.components.length > 0 ? (
          <ul className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">
            {q.components.map((c) => (
              <li key={c.name} className="text-data-sm flex items-start justify-between gap-2">
                <span className="text-on-surface-variant flex-1">{c.meaning}</span>
                <span className={`font-bold tabular-nums shrink-0 ${subScoreTone(c.sub_score)}`}>
                  {c.sub_score}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-data-sm text-on-surface-variant opacity-60">
            {q.components_used}/4 thành phần — chưa đủ để chấm điểm.
          </p>
        )}
      </Card>

      <p className="text-data-sm text-on-surface-variant opacity-70 border-t border-outline-variant pt-2">
        ⚠️ {data.disclaimer}
      </p>
    </div>
  );
}
