"use client";

import { useEffect, useState } from "react";
import type { Note } from "@/types/stock";
import { createNote, deleteNote, getNotes } from "@/lib/api";
import { fmtTime } from "@/lib/format";

/** Free-form research notes for a symbol — add / list / delete. Research-only. */
export default function SymbolNotesPanel({
  symbol,
  onToast,
}: {
  symbol: string;
  onToast?: (m: string) => void;
}) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getNotes(symbol)
      .then((n) => !cancelled && setNotes(n))
      .catch(() => onToast?.("Lỗi tải ghi chú"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content || saving) return;
    setSaving(true);
    try {
      const created = await createNote(content, symbol);
      setNotes((cur) => [created, ...cur]);
      setDraft("");
    } catch {
      onToast?.("Lỗi lưu ghi chú");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await deleteNote(id);
      setNotes((cur) => cur.filter((n) => n.id !== id));
    } catch {
      onToast?.("Lỗi xóa ghi chú");
    }
  };

  return (
    <div className="p-3 space-y-3">
      <form onSubmit={add} className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder={`Ghi chú nhanh về ${symbol}…`}
          aria-label={`Ghi chú về ${symbol}`}
          className="w-full resize-none bg-surface-container-high border border-outline-variant px-2 py-1.5 font-data-md text-data-md text-on-surface outline-none focus:border-primary"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || !draft.trim()}
            className="px-3 py-1 bg-primary-container text-on-primary font-label-caps text-label-caps uppercase hover:brightness-110 transition disabled:opacity-50"
          >
            {saving ? "Đang lưu…" : "Thêm ghi chú"}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-data-sm text-on-surface-variant">Đang tải…</p>
      ) : notes.length === 0 ? (
        <p className="text-data-sm text-on-surface-variant">Chưa có ghi chú cho mã này.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="border border-outline-variant bg-surface-container-lowest p-2">
              <div className="flex items-start gap-2">
                <p className="flex-1 font-data-md text-data-md text-on-surface whitespace-pre-wrap">
                  {n.content}
                </p>
                <button
                  type="button"
                  onClick={() => remove(n.id)}
                  aria-label={`Xóa ghi chú ${n.id}`}
                  className="text-on-surface-variant hover:text-error shrink-0"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>delete</span>
                </button>
              </div>
              <div className="text-data-sm text-on-surface-variant opacity-50 mt-1">
                {fmtTime(n.created_at)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
