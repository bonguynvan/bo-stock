"use client";

import { useState } from "react";
import type { NewsSignal, NewsSignals } from "@/types/stock";
import { ApiError, postNewsSignals } from "@/lib/api";

const EVENT_LABEL: Record<string, string> = {
  business_update: "Hoạt động KD",
  earnings: "Kết quả KD",
  dividend: "Cổ tức",
  capital_raise: "Phát hành/Tăng vốn",
  insider_shareholder: "Nội bộ/Cổ đông lớn",
  management: "Nhân sự lãnh đạo",
  mna: "M&A/Thoái vốn",
  regulatory_legal: "Pháp lý/Xử phạt",
  macro_sector: "Vĩ mô/Ngành",
  other: "Khác",
};

const SENTIMENT_TONE: Record<string, string> = {
  positive: "text-secondary border-secondary/50",
  negative: "text-error border-error/50",
  neutral: "text-on-surface-variant border-outline-variant",
};
const NET_LABEL: Record<string, string> = {
  positive: "Tích cực", negative: "Tiêu cực", mixed: "Trái chiều", neutral: "Trung tính",
};

function SignalRow({ s }: { s: NewsSignal }) {
  const date = s.published ? s.published.slice(0, 10) : "";
  return (
    <li className={`border-l-2 ${SENTIMENT_TONE[s.sentiment]} pl-3 py-1`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`font-label-caps text-label-caps uppercase ${SENTIMENT_TONE[s.sentiment].split(" ")[0]}`}>
          {EVENT_LABEL[s.event_type] ?? s.event_type}
        </span>
        {s.source && <span className="text-data-sm text-on-surface-variant opacity-70">{s.source}</span>}
        {date && <span className="text-data-sm text-on-surface-variant opacity-50">{date}</span>}
      </div>
      {s.extract && <p className="text-body-md text-on-surface mt-0.5">{s.extract}</p>}
      {s.link ? (
        <a href={s.link} target="_blank" rel="noopener noreferrer"
          className="text-data-sm text-primary hover:underline break-words">
          {s.headline}
        </a>
      ) : (
        <span className="text-data-sm text-on-surface-variant break-words">{s.headline}</span>
      )}
    </li>
  );
}

/**
 * News signals — classify recent per-stock headlines into event type + sentiment via AI,
 * on an explicit button press (research-only: extracts what the unverified news says,
 * never recommends). Pairs with the Giai đoạn 1 flags: insider / regulatory / earnings
 * events here can corroborate a forensic red flag.
 */
export default function NewsSignalsPanel({ symbol }: { symbol: string }) {
  const [data, setData] = useState<NewsSignals | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await postNewsSignals(symbol));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 503
          ? "Tín hiệu tin tức cần ANTHROPIC_API_KEY trong backend."
          : err instanceof Error ? err.message : "Lỗi phân tích tin.",
      );
    } finally {
      setLoading(false);
    }
  };

  const summary = data?.summary;
  return (
    <div className="border border-outline-variant bg-surface-container-low p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-label-caps text-label-caps text-primary uppercase tracking-widest">
          Tín hiệu tin tức (AI)
        </span>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="shrink-0 px-3 py-1 bg-primary-container text-on-primary font-label-caps text-label-caps uppercase hover:brightness-110 transition disabled:opacity-50"
        >
          {loading ? "Đang phân tích…" : data ? "Phân tích lại" : "Phân tích tin gần đây"}
        </button>
      </div>

      {error && <p className="text-data-sm text-error">{error}</p>}

      {!data && !error && !loading && (
        <p className="text-data-sm text-on-surface-variant opacity-70">
          Phân loại các tin gần đây theo loại sự kiện & sắc thái (nội bộ, pháp lý, kết quả KD…).
          Chỉ chạy khi bạn bấm — tin CHƯA kiểm chứng, không phải khuyến nghị.
        </p>
      )}

      {data && !data.available && (
        <p className="text-data-sm text-on-surface-variant">{data.note ?? "Không có tin gần đây."}</p>
      )}

      {data && data.available && summary && (
        <>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-data-sm text-on-surface-variant">Sắc thái chung:</span>
            <span className={`font-data-md ${SENTIMENT_TONE[summary.net_sentiment === "mixed" ? "neutral" : summary.net_sentiment].split(" ")[0]}`}>
              {NET_LABEL[summary.net_sentiment]}
            </span>
            {summary.dominant_events.length > 0 && (
              <span className="text-data-sm text-on-surface-variant opacity-70">
                · {summary.dominant_events.map((e) => EVENT_LABEL[e] ?? e).join(", ")}
              </span>
            )}
            <span className="text-data-sm text-on-surface-variant opacity-50 ml-auto">
              {data.analyzed_count} tin
            </span>
          </div>

          {data.signals && data.signals.length > 0 ? (
            <ul className="space-y-2">
              {data.signals.map((s, i) => (
                <SignalRow key={i} s={s} />
              ))}
            </ul>
          ) : (
            <p className="text-data-sm text-on-surface-variant">Không có tin liên quan trực tiếp đến mã.</p>
          )}

          <p className="text-data-sm text-on-surface-variant opacity-60 border-t border-outline-variant pt-2">
            ⚠️ {summary.note || "Tin chưa kiểm chứng — chỉ để tham khảo, không phải khuyến nghị."}
          </p>
        </>
      )}
    </div>
  );
}
