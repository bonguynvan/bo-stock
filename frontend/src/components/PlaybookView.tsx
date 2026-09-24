"use client";

import { useEffect, useState } from "react";
import { getPlaybook, savePlaybook } from "@/lib/api";
import { renderMarkdown } from "@/lib/simpleMarkdown";

interface PlaybookViewProps {
  onToast: (message: string) => void;
}

export default function PlaybookView({ onToast }: PlaybookViewProps) {
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPlaybook()
      .then((p) => {
        if (!cancelled) {
          setDraft(p.content);
          setDirty(false);
        }
      })
      .catch((e) => onToast(e instanceof Error ? e.message : "Lỗi tải quy trình"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [onToast]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await savePlaybook(draft);
      setDirty(false);
      onToast("Đã lưu quy trình");
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Lỗi khi lưu");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4 max-w-3xl">
      <header className="border-b border-outline-variant pb-4 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-headline-md text-headline-md text-on-surface">Quy Trình Đầu Tư</h1>
          <p className="text-on-surface-variant font-body-md text-body-md mt-1">
            Ghi chú quy trình lọc cổ phiếu của riêng bạn — sửa tự do, lưu lại để đọc trước mỗi lần ra quyết định.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setPreview((v) => !v)}
            className="px-3 py-1.5 border border-outline-variant font-label-caps text-label-caps uppercase hover:bg-surface-container transition-colors"
          >
            {preview ? "Sửa" : "Xem trước"}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="px-4 py-1.5 bg-primary-container text-on-primary font-bold font-label-caps text-label-caps uppercase hover:brightness-110 transition disabled:opacity-40"
          >
            {saving ? "Đang lưu…" : dirty ? "Lưu" : "Đã lưu"}
          </button>
        </div>
      </header>

      {loading ? (
        <p className="text-on-surface-variant font-data-md text-data-md">Đang tải…</p>
      ) : preview ? (
        <div className="bg-surface-container-low border border-outline-variant p-4">
          {renderMarkdown(draft)}
        </div>
      ) : (
        <textarea
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setDirty(true);
          }}
          spellCheck={false}
          className="w-full min-h-[60vh] bg-surface-container-low border border-outline-variant p-4 font-data-md text-data-md text-on-surface focus:border-primary outline-none resize-y"
        />
      )}
      <p className="text-data-sm text-on-surface-variant opacity-60">
        Hỗ trợ markdown đơn giản: <code>## Tiêu đề</code>, <code>- gạch đầu dòng</code>. Dùng nút “Checklist”
        trên Screener để xem các mục “- …” dưới dạng danh sách kiểm tra nhanh.
      </p>
    </div>
  );
}
