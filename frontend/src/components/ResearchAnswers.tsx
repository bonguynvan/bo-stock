"use client";

import { useMemo, useState } from "react";
import type { ResearchAnswer, ResearchQuestion, ResearchSearchResult } from "@/types/stock";
import { researchSearch } from "@/lib/api";

const STATUS: Record<string, { icon: string; label: string; cls: string }> = {
  found: { icon: "✅", label: "Tìm thấy", cls: "text-success" },
  partial: { icon: "⚠️", label: "Tìm thấy một phần", cls: "text-secondary" },
  not_found: { icon: "❓", label: "Chưa tìm thấy", cls: "text-on-surface-variant" },
};

function ManualLinks({ symbol }: { symbol: string }) {
  const s = symbol.toUpperCase();
  return (
    <div className="text-data-sm text-on-surface-variant mt-1 flex flex-wrap gap-x-3 gap-y-1">
      <span className="opacity-60">Tìm thủ công:</span>
      <a className="text-primary hover:underline" target="_blank" rel="noreferrer"
         href={`https://cafef.vn/${s.toLowerCase()}-ctck.chn`}>CafeF</a>
      <a className="text-primary hover:underline" target="_blank" rel="noreferrer"
         href={`https://finance.vietstock.vn/${s}/tin-tuc-su-kien.htm`}>Vietstock</a>
      <a className="text-primary hover:underline" target="_blank" rel="noreferrer"
         href={`https://news.google.com/search?q=${encodeURIComponent(s + " công bố thông tin")}&hl=vi`}>Google News</a>
    </div>
  );
}

function Findings({ answer, symbol }: { answer: ResearchAnswer; symbol: string }) {
  if (answer.status === "not_found" || answer.findings.length === 0) {
    return (
      <div className="mt-1">
        <p className="text-data-sm text-on-surface-variant opacity-70">
          Chưa tìm được tin liên quan — thử tìm thủ công tại nguồn CBTT của mã.
        </p>
        <ManualLinks symbol={symbol} />
      </div>
    );
  }
  return (
    <ul className="mt-1.5 space-y-1.5">
      {answer.findings.map((f, i) => (
        <li key={i} className="border-l-2 border-primary/40 pl-2">
          <a href={f.url} target="_blank" rel="noreferrer"
             className="font-data-md text-data-md text-primary hover:underline">
            {f.relevance === "high" ? "● " : "○ "}
            {f.title}
          </a>
          <div className="text-data-sm text-on-surface-variant opacity-70">
            {f.source}
            {f.published_date ? ` · ${f.published_date}` : ""}
          </div>
        </li>
      ))}
      {answer.status === "partial" && <li><ManualLinks symbol={symbol} /></li>}
    </ul>
  );
}

interface ResearchAnswersProps {
  symbol: string;
  questions: ResearchQuestion[];
}

export default function ResearchAnswers({ symbol, questions }: ResearchAnswersProps) {
  const [result, setResult] = useState<ResearchSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byQuestion = useMemo(() => {
    const m = new Map<string, ResearchAnswer>();
    result?.answers.forEach((a) => m.set(a.question, a));
    return m;
  }, [result]);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await researchSearch(symbol, questions));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tìm kiếm");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border-t border-outline-variant pt-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-label-caps text-label-caps text-on-surface uppercase tracking-wide">
          Câu hỏi cần tự trả lời trước khi quyết định
        </h3>
        {questions.length > 0 && (
          <button
            type="button"
            onClick={run}
            disabled={loading}
            className="px-2.5 py-1 border border-primary text-primary font-label-caps text-label-caps uppercase hover:bg-primary/10 transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "15px" }}>search</span>
            {loading ? "Đang tìm…" : "Tìm câu trả lời tự động"}
          </button>
        )}
      </div>

      {loading && (
        <p className="text-data-sm text-on-surface-variant animate-pulse">
          Đang tìm kiếm trên CafeF, Vietstock, VnEconomy…
        </p>
      )}
      {error && <p className="text-data-sm text-error">{error}</p>}

      <ul className="space-y-3 text-body-md text-on-surface">
        {questions.map((q, i) => {
          const a = byQuestion.get(q.question);
          const st = a ? STATUS[a.status] : null;
          return (
            <li key={i}>
              <div className="flex items-start gap-2">
                <span className="text-on-surface-variant">•</span>
                <div className="flex-1">
                  <span>{q.question}</span>
                  {st && (
                    <span className={`ml-2 font-label-caps text-label-caps uppercase ${st.cls}`}>
                      {st.icon} {st.label}
                    </span>
                  )}
                  {a && <Findings answer={a} symbol={symbol} />}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
