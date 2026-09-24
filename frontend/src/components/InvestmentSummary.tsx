"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  BenchMetric,
  ConcernPoint,
  ConsiderationSummary,
  IndustryComparison,
  StrengthPoint,
} from "@/types/stock";
import { generateConsiderationSummary, getConsiderationSummary } from "@/lib/api";
import ResearchAnswers from "./ResearchAnswers";

function fmt(v: number | null): string {
  return v == null ? "—" : v.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

/** Real same-industry comparison (from our DB): value vs median + percentile. */
function IndustrySection({ data }: { data: IndustryComparison }) {
  // "Outperforms" = above median when higher-is-better, else below median.
  const beats = (m: BenchMetric) =>
    m.value == null || m.median == null
      ? null
      : m.higher_is_better
        ? m.value >= m.median
        : m.value <= m.median;
  return (
    <div className="border-t border-outline-variant pt-3 space-y-2">
      <h3 className="font-label-caps text-label-caps text-on-surface uppercase tracking-wide">
        So sánh ngành · {data.industry} ({data.peer_count} mã)
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left font-data-md text-data-md">
          <thead className="font-label-caps text-label-caps text-on-surface-variant uppercase border-b border-outline-variant">
            <tr>
              <th className="py-1.5 pr-2">Chỉ số</th>
              <th className="py-1.5 px-2 text-right">Mã này</th>
              <th className="py-1.5 px-2 text-right">TB ngành</th>
              <th className="py-1.5 pl-2 text-right">Xếp hạng</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {data.metrics.map((m) => {
              const b = beats(m);
              const tone = b == null ? "" : b ? "text-secondary" : "text-error";
              return (
                <tr key={m.key}>
                  <td className="py-1.5 pr-2 text-on-surface-variant">{m.label}</td>
                  <td className={`py-1.5 px-2 text-right font-bold ${tone}`}>{fmt(m.value)}</td>
                  <td className="py-1.5 px-2 text-right text-on-surface-variant">{fmt(m.median)}</td>
                  <td className="py-1.5 pl-2 text-right text-on-surface-variant">
                    {m.percentile == null ? "—" : `top ${100 - m.percentile}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data.peers.length > 0 && (
        <p className="text-data-sm text-on-surface-variant opacity-70">
          Cùng ngành:{" "}
          {data.peers
            .map((p) => `${p.symbol} (ROE ${p.roe == null ? "—" : p.roe}%)`)
            .join(" · ")}
        </p>
      )}
      <p className="text-data-sm text-on-surface-variant opacity-50">
        Xanh = tốt hơn trung vị ngành, đỏ = kém hơn. Số liệu từ dữ liệu đã đồng bộ, không phải khuyến nghị.
      </p>
    </div>
  );
}

/** One expandable point (strength or concern). */
function PointCard({
  point,
  evidence,
  detail,
  detailLabel,
  tone,
}: {
  point: string;
  evidence: string;
  detail: string;
  detailLabel: string;
  tone: "good" | "warn";
}) {
  const [open, setOpen] = useState(false);
  const accent = tone === "good" ? "border-l-secondary" : "border-l-primary";
  return (
    <li className={`border border-outline-variant border-l-2 ${accent} bg-surface-container-low`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left p-3 flex items-start gap-2 hover:bg-surface-container transition-colors"
      >
        <span
          className="material-symbols-outlined shrink-0"
          style={{ fontSize: "18px" }}
          aria-hidden
        >
          {tone === "good" ? "check_circle" : "warning"}
        </span>
        <span className="font-data-md text-data-md text-on-surface flex-1">{point}</span>
        <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: "18px" }}>
          {open ? "expand_less" : "expand_more"}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 pl-9 space-y-2 text-body-md">
          {evidence && (
            <p className="text-on-surface-variant">
              <span className="font-label-caps text-label-caps uppercase text-on-surface-variant opacity-70">
                Bằng chứng:{" "}
              </span>
              {evidence}
            </p>
          )}
          {detail && (
            <p className="text-on-surface">
              <span className="font-label-caps text-label-caps uppercase text-on-surface-variant opacity-70">
                {detailLabel}:{" "}
              </span>
              {detail}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

interface InvestmentSummaryProps {
  symbol: string;
  /** Bump to force a fresh generation (e.g. right after a BCTC analysis). */
  generateSignal: number;
}

export default function InvestmentSummary({ symbol, generateSignal }: InvestmentSummaryProps) {
  const [summary, setSummary] = useState<ConsiderationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load any stored summary on mount / symbol change (no AI).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSummary(null);
    getConsiderationSummary(symbol)
      .then((s) => !cancelled && setSummary(s))
      .catch(() => !cancelled && setSummary(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const regenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const s = await generateConsiderationSummary(symbol, true);
      setSummary(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi tạo tóm tắt");
    } finally {
      setGenerating(false);
    }
  }, [symbol]);

  // Auto-generate after an analysis (parent bumps generateSignal).
  useEffect(() => {
    if (generateSignal > 0) regenerate();
  }, [generateSignal, regenerate]);

  // Nothing analyzed yet and nothing generating → don't render the section at all.
  if (loading || (!summary && !generating && !error)) return null;

  return (
    <section className="space-y-3 border border-outline-variant bg-surface-container p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-headline-sm text-headline-sm text-on-surface">
            📋 Tóm tắt để cân nhắc
          </h2>
          <p className="text-data-sm text-on-surface-variant opacity-70">
            Phân tích khách quan tổng hợp từ BCTC · Định giá · Kim Chỉ Nam — không phải khuyến nghị đầu tư.
          </p>
        </div>
        {summary && (
          <button
            type="button"
            onClick={regenerate}
            disabled={generating}
            title="Tạo lại tóm tắt (dùng thêm 1 lượt AI)"
            className="text-on-surface-variant hover:text-primary transition-colors shrink-0 disabled:opacity-50"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>
              refresh
            </span>
          </button>
        )}
      </div>

      {generating && (
        <p className="text-on-surface-variant font-data-md text-data-md py-4 text-center">
          Đang tổng hợp tóm tắt…
        </p>
      )}
      {error && !generating && <p className="text-error font-data-md text-data-md">{error}</p>}

      {summary && !generating && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <h3 className="font-label-caps text-label-caps text-secondary uppercase tracking-wide">
                Điểm mạnh
              </h3>
              <ul className="space-y-2">
                {summary.strengths.map((s: StrengthPoint, i) => (
                  <PointCard
                    key={i}
                    point={s.point}
                    evidence={s.evidence}
                    detail={s.significance}
                    detailLabel="Ý nghĩa"
                    tone="good"
                  />
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="font-label-caps text-label-caps text-primary uppercase tracking-wide">
                Điểm cần cân nhắc
              </h3>
              <ul className="space-y-2">
                {summary.concerns.map((c: ConcernPoint, i) => (
                  <PointCard
                    key={i}
                    point={c.point}
                    evidence={c.evidence}
                    detail={c.implication}
                    detailLabel="Ảnh hưởng"
                    tone="warn"
                  />
                ))}
              </ul>
            </div>
          </div>

          {summary.valuation_context && (
            <div className="border-t border-outline-variant pt-3 space-y-1.5">
              <h3 className="font-label-caps text-label-caps text-on-surface uppercase tracking-wide">
                Bối cảnh định giá
              </h3>
              <p className="text-body-md text-on-surface">{summary.valuation_context.summary}</p>
              <p className="text-body-md text-on-surface-variant">
                <span className="opacity-70">Thị trường đang hàm ý: </span>
                {summary.valuation_context.what_market_implies}
              </p>
              <p className="text-body-md text-on-surface-variant">
                <span className="opacity-70">Ẩn số then chốt: </span>
                {summary.valuation_context.key_uncertainty}
              </p>
            </div>
          )}

          {summary.industry_comparison && (
            <IndustrySection data={summary.industry_comparison} />
          )}

          {summary.questions_to_answer.length > 0 && (
            <ResearchAnswers symbol={symbol} questions={summary.questions_to_answer} />
          )}

          {summary.recent_developments.length > 0 && (
            <div className="border-t border-outline-variant pt-3 space-y-2">
              <h3 className="font-label-caps text-label-caps text-on-surface uppercase tracking-wide">
                Diễn biến gần đây · cần kiểm chứng
              </h3>
              <p className="text-data-sm text-on-surface-variant opacity-60">
                Từ tiêu đề tin gần đây (chưa xác minh) — để bạn tự kiểm tra, không phải sự thật đã xác nhận.
              </p>
              <ul className="space-y-1.5">
                {summary.recent_developments.map((d, i) => (
                  <li key={i} className="border-l-2 border-primary/40 pl-2">
                    <div className="font-data-md text-data-md text-on-surface">{d.headline}</div>
                    {d.note && <div className="text-body-md text-on-surface-variant">{d.note}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.compass_interpretation && (
            <div className="border-t border-outline-variant pt-3">
              <h3 className="font-label-caps text-label-caps text-on-surface uppercase tracking-wide mb-1">
                Diễn giải Kim Chỉ Nam
              </h3>
              <p className="text-body-md text-on-surface-variant">
                {summary.compass_interpretation}
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
