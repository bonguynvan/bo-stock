"use client";

import { useEffect, useState } from "react";
import type { ConvictionProfile, NewsSignals, PillarStatus } from "@/types/stock";
import { ApiError, getConviction, postNewsSignals } from "@/lib/api";

const NEWS_EVENT_LABEL: Record<string, string> = {
  business_update: "Hoạt động KD", earnings: "Kết quả KD", dividend: "Cổ tức",
  capital_raise: "Phát hành", insider_shareholder: "Nội bộ/CĐ lớn", management: "Nhân sự",
  mna: "M&A", regulatory_legal: "Pháp lý", macro_sector: "Vĩ mô", other: "Khác",
};
const NET_SENTIMENT: Record<string, { label: string; tone: string }> = {
  positive: { label: "Tích cực", tone: "text-secondary" },
  negative: { label: "Tiêu cực", tone: "text-error" },
  mixed: { label: "Trái chiều", tone: "text-amber-400" },
  neutral: { label: "Trung tính", tone: "text-on-surface-variant" },
};

const STATUS_DOT: Record<PillarStatus, string> = {
  good: "bg-secondary",
  neutral: "bg-amber-400",
  risk: "bg-error",
  unknown: "bg-outline-variant",
};
const STATUS_TEXT: Record<PillarStatus, string> = {
  good: "text-secondary",
  neutral: "text-amber-400",
  risk: "text-error",
  unknown: "text-on-surface-variant",
};

// Overall read → tone + Vietnamese label. Descriptive, never a buy/sell verdict.
const OVERALL: Record<ConvictionProfile["overall"], { label: string; tone: string }> = {
  solid: { label: "Tích cực đồng thuận", tone: "text-secondary border-secondary/50" },
  mixed: { label: "Hỗn hợp", tone: "text-amber-400 border-amber-400/50" },
  watch: { label: "Cần theo dõi", tone: "text-amber-400 border-amber-400/50" },
  elevated_risk: { label: "Rủi ro cần lưu ý", tone: "text-error border-error/50" },
  insufficient: { label: "Thiếu dữ liệu", tone: "text-on-surface-variant border-outline-variant" },
};

/**
 * Financial-trust profile — the Giai đoạn 1 synthesis: forensic (Beneish/Altman/Piotroski)
 * + Quality of Earnings + sector-relative valuation as one set of quality/risk pillars,
 * plus where independent signals corroborate. Self-fetches; renders nothing when there is
 * nothing to synthesize. Research-only: describes axes, never recommends.
 */
export default function ConvictionCard({ symbol }: { symbol: string }) {
  const [data, setData] = useState<ConvictionProfile | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "none">("loading");
  const [news, setNews] = useState<NewsSignals | null>(null);
  const [newsState, setNewsState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [newsErr, setNewsErr] = useState<string | null>(null);

  const runNews = async () => {
    setNewsState("loading");
    setNewsErr(null);
    try {
      setNews(await postNewsSignals(symbol));
      setNewsState("ready");
    } catch (err) {
      setNewsState("error");
      setNewsErr(
        err instanceof ApiError && err.status === 503
          ? "Cần ANTHROPIC_API_KEY trong backend."
          : err instanceof Error ? err.message : "Lỗi phân tích tin.",
      );
    }
  };

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setNews(null);          // reset the on-demand news pulse when the symbol changes
    setNewsState("idle");
    setNewsErr(null);
    getConviction(symbol)
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

  const o = OVERALL[data.overall];
  return (
    <section className={`border ${o.tone} bg-surface-container-low p-4 space-y-3`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-label-caps text-label-caps text-primary uppercase tracking-widest">
          Hồ sơ tin cậy tài chính
        </h2>
        <span className={`font-label-caps text-label-caps uppercase ${o.tone.split(" ")[0]}`}>
          {o.label}
        </span>
      </div>
      <p className="text-body-md text-on-surface">{data.overall_text}</p>

      {/* Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
        {data.pillars.map((p) => (
          <div key={p.key} className="flex items-start gap-2">
            <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[p.status]}`} />
            <div>
              <div className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                {p.label}
              </div>
              <div className={`text-data-sm ${STATUS_TEXT[p.status]}`}>{p.headline}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Cross-signal corroboration — the point of the synthesis */}
      {data.cross_signals.length > 0 && (
        <div className="border-t border-outline-variant pt-2 space-y-1">
          <div className="font-label-caps text-label-caps text-on-surface-variant uppercase">
            Tín hiệu đồng thuận
          </div>
          <ul className="list-disc pl-4 space-y-0.5">
            {data.cross_signals.map((c, i) => (
              <li key={i} className="text-data-sm text-on-surface">{c}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Organizational flow — insider / foreign / tự doanh net direction (corroboration) */}
      {data.flow_signals && data.flow_signals.length > 0 && (
        <div className="border-t border-outline-variant pt-2 space-y-1">
          <div className="font-label-caps text-label-caps text-on-surface-variant uppercase">
            Dòng tiền tổ chức
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {data.flow_signals.map((f) => (
              <div key={f.key} className="flex items-center gap-1.5 text-data-sm">
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    f.direction === "buy"
                      ? "bg-secondary"
                      : f.direction === "sell"
                        ? "bg-error"
                        : "bg-outline-variant"
                  }`}
                />
                <span
                  className={
                    f.direction === "buy"
                      ? "text-secondary"
                      : f.direction === "sell"
                        ? "text-error"
                        : "text-on-surface-variant"
                  }
                >
                  {f.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* On-demand news pulse — overlays Giai đoạn 2 signals onto the trust view. */}
      <div className="border-t border-outline-variant pt-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
            Tín hiệu tin tức
          </span>
          {newsState !== "ready" && (
            <button
              type="button"
              onClick={runNews}
              disabled={newsState === "loading"}
              className="px-2.5 py-0.5 border border-outline-variant text-on-surface-variant hover:text-on-surface hover:border-primary/50 font-label-caps text-label-caps uppercase transition disabled:opacity-50"
            >
              {newsState === "loading" ? "Đang phân tích…" : "Phân tích tin (AI)"}
            </button>
          )}
        </div>

        {newsState === "error" && <p className="text-data-sm text-error mt-1">{newsErr}</p>}

        {newsState === "ready" && news && (
          !news.available || !news.summary ? (
            <p className="text-data-sm text-on-surface-variant mt-1">
              {news.note ?? "Không có tin gần đây."}
            </p>
          ) : (
            <div className="mt-1 space-y-1">
              <div className="flex items-baseline gap-2 flex-wrap text-data-sm">
                <span className="text-on-surface-variant">Sắc thái:</span>
                <span className={`font-bold ${(NET_SENTIMENT[news.summary.net_sentiment] ?? NET_SENTIMENT.neutral).tone}`}>
                  {(NET_SENTIMENT[news.summary.net_sentiment] ?? NET_SENTIMENT.neutral).label}
                </span>
                {news.summary.dominant_events.length > 0 && (
                  <span className="text-on-surface-variant opacity-70">
                    · {news.summary.dominant_events.map((e) => NEWS_EVENT_LABEL[e] ?? e).join(", ")}
                  </span>
                )}
                <span className="text-on-surface-variant opacity-50 ml-auto">{news.analyzed_count} tin</span>
              </div>
              {news.summary.net_sentiment === "negative" &&
                (data.overall === "elevated_risk" || data.overall === "watch") && (
                  <p className="text-data-sm text-error">
                    ⚠ Tin tức gần đây tiêu cực — củng cố cảnh báo rủi ro cơ bản ở trên.
                  </p>
                )}
              <p className="text-data-sm text-on-surface-variant opacity-60">
                Chi tiết từng tin ở mục “Tín hiệu tin tức” bên dưới. Tin chưa kiểm chứng.
              </p>
            </div>
          )
        )}
      </div>

      <p className="text-data-sm text-on-surface-variant opacity-60 border-t border-outline-variant pt-2">
        ⚠️ {data.disclaimer}
      </p>
    </section>
  );
}
