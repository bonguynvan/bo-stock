"use client";

import { useState } from "react";
import type { ScreenerFilterBody } from "@/types/stock";
import { ApiError, nlScreener } from "@/lib/api";

interface NlScreenerBarProps {
  onApply: (filter: ScreenerFilterBody) => void;
  onToast: (message: string) => void;
}

/**
 * Natural-language screener input — describe the filter in words and let the AI build
 * a screener filter. Research-only: it only sets the filter, nothing is recommended.
 */
export default function NlScreenerBar({ onApply, onToast }: NlScreenerBarProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    try {
      const filter = await nlScreener(q);
      if (Object.keys(filter).length === 0) {
        onToast("Không nhận ra tiêu chí lọc từ mô tả — thử cụ thể hơn.");
      } else {
        onApply(filter);
        onToast("Đã tạo bộ lọc từ mô tả.");
      }
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 503
          ? "Lọc bằng lời cần ANTHROPIC_API_KEY trong backend."
          : err instanceof Error
            ? err.message
            : "Lỗi tạo bộ lọc.";
      onToast(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="px-4 py-2 border-b border-outline-variant bg-surface-container-lowest flex items-center gap-2"
    >
      <span className="material-symbols-outlined text-primary" style={{ fontSize: "18px" }}>
        auto_awesome
      </span>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        maxLength={300}
        placeholder="Lọc bằng lời: “ngân hàng ROE trên 18, P/B dưới 1.5, cổ tức trên 5%”…"
        aria-label="Lọc bằng lời"
        className="flex-1 bg-transparent outline-none font-data-md text-data-md text-on-surface placeholder:text-on-surface-variant/60"
      />
      <button
        type="submit"
        disabled={loading || !query.trim()}
        className="shrink-0 px-3 py-1 bg-primary-container text-on-primary font-label-caps text-label-caps uppercase hover:brightness-110 transition disabled:opacity-50"
      >
        {loading ? "Đang tạo…" : "Tạo bộ lọc"}
      </button>
    </form>
  );
}
