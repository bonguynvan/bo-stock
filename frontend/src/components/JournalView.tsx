"use client";

import { useCallback, useEffect, useState } from "react";
import type { JournalAction, JournalEntry } from "@/types/stock";
import {
  createJournalEntry,
  deleteJournalEntry,
  getJournalEntries,
  updateJournalEntry,
} from "@/lib/api";
import { fmtNumber } from "@/lib/format";

const ACTION_LABELS: Record<JournalAction, string> = {
  buy: "Mua",
  sell: "Bán",
  watch: "Theo dõi",
  note: "Ghi chú",
};

const ACTION_BADGE: Record<JournalAction, string> = {
  buy: "text-secondary border-secondary",
  sell: "text-error border-error",
  watch: "text-primary border-primary",
  note: "text-on-surface-variant border-outline",
};

const ACTIONS: readonly JournalAction[] = ["buy", "sell", "watch", "note"];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("vi-VN");
}

interface JournalViewProps {
  prefillSymbol?: string | null;
  onToast: (message: string) => void;
}

export default function JournalView({ prefillSymbol, onToast }: JournalViewProps) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [symbol, setSymbol] = useState("");
  const [action, setAction] = useState<JournalAction>("buy");
  const [thesis, setThesis] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [catalyst, setCatalyst] = useState("");

  useEffect(() => {
    if (prefillSymbol) setSymbol(prefillSymbol);
  }, [prefillSymbol]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await getJournalEntries());
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Lỗi khi tải nhật ký");
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSubmit = useCallback(async () => {
    if (!thesis.trim()) {
      onToast("Cần nhập luận điểm (thesis)");
      return;
    }
    setSubmitting(true);
    try {
      await createJournalEntry({
        symbol: symbol.trim() || null,
        action,
        thesis: thesis.trim(),
        target_price: targetPrice ? Number(targetPrice) : null,
        catalyst: catalyst.trim() || null,
      });
      setThesis("");
      setTargetPrice("");
      setCatalyst("");
      await refresh();
      onToast("Đã ghi nhật ký");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Lỗi khi ghi nhật ký");
    } finally {
      setSubmitting(false);
    }
  }, [symbol, action, thesis, targetPrice, catalyst, refresh, onToast]);

  const handleReview = useCallback(
    async (entry: JournalEntry) => {
      const note = window.prompt(
        "Đánh giá lại (kết quả so với luận điểm ban đầu):",
        entry.review_note ?? "",
      );
      if (note === null) return;
      try {
        await updateJournalEntry(entry.id, {
          status: "closed",
          review_note: note.trim() || null,
        });
        await refresh();
        onToast("Đã lưu đánh giá");
      } catch (err) {
        onToast(err instanceof Error ? err.message : "Lỗi khi lưu đánh giá");
      }
    },
    [refresh, onToast],
  );

  const handleDelete = useCallback(
    async (id: number) => {
      if (!window.confirm("Xóa mục nhật ký này?")) return;
      try {
        await deleteJournalEntry(id);
        await refresh();
        onToast("Đã xóa");
      } catch (err) {
        onToast(err instanceof Error ? err.message : "Lỗi khi xóa");
      }
    },
    [refresh, onToast],
  );

  const inputClass =
    "w-full bg-surface-container-high border border-outline-variant text-body-md p-2 focus:border-primary-container outline-none";

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* New-entry form */}
      <aside className="w-80 shrink-0 bg-surface-container-lowest border-r border-outline-variant overflow-y-auto custom-scrollbar p-4 flex flex-col gap-4">
        <h3 className="font-label-caps text-label-caps text-primary uppercase tracking-widest">
          Ghi nhận định mới
        </h3>
        <div>
          <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1">
            Mã (tùy chọn)
          </label>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="VD: FPT"
            className={inputClass}
          />
        </div>
        <div>
          <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1">
            Hành động
          </label>
          <div className="grid grid-cols-4 gap-1">
            {ACTIONS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAction(a)}
                className={
                  action === a
                    ? "py-1 text-data-sm border border-primary-container bg-primary/10 text-primary"
                    : "py-1 text-data-sm border border-outline-variant hover:border-primary transition-colors"
                }
              >
                {ACTION_LABELS[a]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1">
            Luận điểm (thesis)
          </label>
          <textarea
            value={thesis}
            onChange={(e) => setThesis(e.target.value)}
            rows={4}
            placeholder="Vì sao mua/bán/theo dõi?"
            className={`${inputClass} resize-none`}
          />
        </div>
        <div>
          <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1">
            Giá kỳ vọng
          </label>
          <input
            type="number"
            value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)}
            placeholder="VD: 85000"
            className={inputClass}
          />
        </div>
        <div>
          <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1">
            Catalyst
          </label>
          <textarea
            value={catalyst}
            onChange={(e) => setCatalyst(e.target.value)}
            rows={2}
            placeholder="Yếu tố xúc tác (KQKD, hợp đồng...)"
            className={`${inputClass} resize-none`}
          />
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-auto py-2 bg-primary-container text-on-primary font-bold text-body-md hover:brightness-110 transition-colors disabled:opacity-40"
        >
          Lưu nhật ký
        </button>
      </aside>

      {/* Entries list */}
      <section className="flex-1 overflow-y-auto custom-scrollbar p-4">
        {loading && (
          <p className="text-on-surface-variant font-data-md text-data-md">Đang tải…</p>
        )}
        {!loading && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: "32px" }}>
              menu_book
            </span>
            <p className="text-on-surface-variant font-data-md text-data-md">
              Chưa có nhật ký. Ghi nhận định đầu tiên ở bên trái.
            </p>
          </div>
        )}
        <div className="flex flex-col gap-3">
          {entries.map((e) => (
            <article
              key={e.id}
              className={`border border-outline-variant bg-surface-container-low p-4 ${
                e.status === "closed" ? "opacity-70" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 border font-label-caps text-label-caps uppercase ${ACTION_BADGE[e.action]}`}
                  >
                    {ACTION_LABELS[e.action]}
                  </span>
                  {e.symbol && (
                    <span className="font-bold text-primary text-data-md">{e.symbol}</span>
                  )}
                  {e.status === "closed" && (
                    <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                      · Đã đóng
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-data-sm text-data-sm text-on-surface-variant">
                    {fmtDate(e.created_at)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleReview(e)}
                    title="Đánh giá lại"
                    aria-label={`Đánh giá lại mục ${e.id}`}
                    className="text-on-surface-variant hover:text-primary transition-colors"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                      rate_review
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(e.id)}
                    title="Xóa"
                    aria-label={`Xóa mục ${e.id}`}
                    className="text-on-surface-variant hover:text-error transition-colors"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                      delete
                    </span>
                  </button>
                </div>
              </div>
              <p className="text-body-md text-on-surface mt-2 whitespace-pre-wrap">
                {e.thesis}
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 font-data-sm text-data-sm text-on-surface-variant">
                {e.target_price != null && (
                  <span>
                    Giá kỳ vọng:{" "}
                    <span className="text-on-surface">{fmtNumber(e.target_price)}</span>
                  </span>
                )}
                {e.price_at_entry != null && (
                  <span>
                    Giá lúc ghi:{" "}
                    <span className="text-on-surface">{fmtNumber(e.price_at_entry)}</span>
                  </span>
                )}
              </div>
              {e.catalyst && (
                <p className="text-body-md text-on-surface-variant mt-2">
                  <span className="font-label-caps text-label-caps uppercase">Catalyst: </span>
                  {e.catalyst}
                </p>
              )}
              {e.review_note && (
                <div className="mt-3 pt-3 border-t border-outline-variant">
                  <span className="font-label-caps text-label-caps text-primary uppercase">
                    Đánh giá lại
                  </span>
                  <p className="text-body-md text-on-surface mt-1 whitespace-pre-wrap">
                    {e.review_note}
                  </p>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
