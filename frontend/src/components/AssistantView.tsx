"use client";

import { useEffect, useRef, useState } from "react";
import {
  askAssistant,
  getAssistantStatus,
  type AssistantAnswer,
  type AssistantTurn,
} from "@/lib/api";
import { ApiError } from "@/lib/api";
import { renderMarkdown } from "@/lib/simpleMarkdown";

interface Turn {
  question: string;
  symbol: string | null;
  answer: AssistantAnswer | null;
  error: string | null;
}

/**
 * AI research assistant — grounded Q&A over the app's own data. Research-only:
 * the model explains/compares numbers, never recommends. Runs only on submit.
 */
export default function AssistantView() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [question, setQuestion] = useState("");
  const [symbol, setSymbol] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getAssistantStatus()
      .then(setConfigured)
      .catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [turns, loading]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;
    const sym = symbol.trim().toUpperCase() || null;
    setQuestion("");
    setLoading(true);
    const idx = turns.length;
    // Prior completed exchanges → conversation memory for follow-ups.
    const history: AssistantTurn[] = turns.flatMap((t) =>
      t.answer
        ? [
            { role: "user" as const, content: t.question },
            { role: "assistant" as const, content: t.answer.answer },
          ]
        : [],
    );
    setTurns((t) => [...t, { question: q, symbol: sym, answer: null, error: null }]);
    try {
      const answer = await askAssistant(q, sym ?? undefined, history);
      setTurns((t) => t.map((x, i) => (i === idx ? { ...x, answer } : x)));
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 503
          ? "Trợ lý AI chưa bật — cần ANTHROPIC_API_KEY trong backend."
          : err instanceof Error
            ? err.message
            : "Lỗi gọi trợ lý.";
      setTurns((t) => t.map((x, i) => (i === idx ? { ...x, error: msg } : x)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <header className="p-4 border-b border-outline-variant bg-surface-container-low flex items-start justify-between gap-3">
        <div>
          <h1 className="font-headline-md text-headline-md text-on-surface">Trợ lý nghiên cứu (AI)</h1>
          <p className="text-on-surface-variant font-body-md text-body-md mt-1">
            Hỏi về dữ liệu của một mã (chỉ số, sàng lọc gian lận, La bàn, so sánh ngành) — AI trích
            xuất & giải thích số liệu, nhớ ngữ cảnh để hỏi tiếp. Không khuyến nghị mua/bán.
          </p>
        </div>
        {turns.length > 0 && (
          <button
            type="button"
            onClick={() => setTurns([])}
            className="shrink-0 px-2 py-1 border border-outline-variant text-on-surface-variant font-label-caps text-label-caps uppercase hover:border-primary hover:text-primary transition-colors flex items-center gap-1"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>delete_sweep</span>
            Xóa hội thoại
          </button>
        )}
      </header>

      {configured === false && (
        <div className="mx-4 mt-3 p-3 border border-outline-variant bg-surface-container-lowest text-data-sm text-on-surface-variant">
          Trợ lý AI chưa bật. Đặt <code className="text-primary">ANTHROPIC_API_KEY</code> trong{" "}
          <code>backend/.env</code> rồi khởi động lại backend.
        </div>
      )}

      <div className="flex-1 overflow-auto custom-scrollbar p-4 space-y-4">
        {turns.length === 0 && (
          <p className="text-on-surface-variant font-data-md text-data-md py-8 text-center border border-outline-variant border-dashed">
            Ví dụ: “ROE và đòn bẩy của FPT nói lên điều gì về chất lượng nền tảng?” (nhập mã FPT).
          </p>
        )}
        {turns.map((t, i) => (
          <div key={i} className="space-y-2">
            <div className="flex justify-end">
              <div className="max-w-[80%] bg-primary-container text-on-primary px-3 py-2 font-data-md text-data-md">
                {t.symbol && <span className="font-bold mr-1.5">[{t.symbol}]</span>}
                {t.question}
              </div>
            </div>
            <div className="max-w-[85%] border border-outline-variant bg-surface-container-lowest px-3 py-2">
              {t.error ? (
                <p className="text-data-sm text-error">{t.error}</p>
              ) : t.answer ? (
                <>
                  <div className="text-body-md text-on-surface space-y-2">
                    {renderMarkdown(t.answer.answer)}
                  </div>
                  <div className="mt-2 pt-2 border-t border-outline-variant/50 flex flex-wrap items-center gap-2">
                    {t.answer.sources.map((s) => (
                      <span
                        key={s}
                        className="font-label-caps text-label-caps uppercase text-on-surface-variant border border-outline-variant px-1.5 py-0.5"
                      >
                        {s}
                      </span>
                    ))}
                    <span className="text-data-sm text-on-surface-variant opacity-60 ml-auto">
                      {t.answer.disclaimer}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-data-sm text-on-surface-variant">Đang suy nghĩ…</p>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="p-3 border-t border-outline-variant bg-surface-container-low flex items-end gap-2">
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="Mã"
          aria-label="Mã cổ phiếu (tùy chọn)"
          className="w-20 bg-surface-container-high border border-outline-variant px-2 py-2 font-data-md text-data-md text-on-surface outline-none focus:border-primary uppercase"
        />
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) submit(e);
          }}
          rows={1}
          placeholder="Hỏi về dữ liệu của mã… (Enter để gửi)"
          aria-label="Câu hỏi"
          className="flex-1 resize-none bg-surface-container-high border border-outline-variant px-3 py-2 font-data-md text-data-md text-on-surface outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="px-3 py-2 bg-primary-container text-on-primary font-label-caps text-label-caps uppercase hover:brightness-110 transition disabled:opacity-50"
        >
          {loading ? "…" : "Gửi"}
        </button>
      </form>
    </>
  );
}
