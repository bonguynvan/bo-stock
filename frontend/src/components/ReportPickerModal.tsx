"use client";

import { useEffect, useState } from "react";
import type { ReportItem } from "@/types/stock";
import { getAvailableReports } from "@/lib/api";

interface ReportPickerModalProps {
  symbol: string;
  onClose: () => void;
  onPick: (report: ReportItem) => void;
  fetchingUrl: string | null; // url currently being downloaded (spinner)
}

/**
 * Lists the BCTC reports Vietstock has for a symbol so the user can pull specific
 * years (for multi-year analysis). Already-downloaded years are marked. Research-only.
 */
export default function ReportPickerModal({
  symbol,
  onClose,
  onPick,
  fetchingUrl,
}: ReportPickerModalProps) {
  const [reports, setReports] = useState<ReportItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    getAvailableReports(symbol)
      .then((d) => !cancelled && setReports(d.reports))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Lỗi tải danh sách"));
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Chọn BCTC của ${symbol}`}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-container border border-outline w-full max-w-lg max-h-[80vh] overflow-y-auto custom-scrollbar p-5"
      >
        <div className="flex items-center justify-between border-b border-outline-variant pb-3">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">
            BCTC của {symbol} · Vietstock
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <p className="text-data-sm text-on-surface-variant opacity-70 mt-3">
          Tải từng năm để phân tích. Phân tích nhiều năm sẽ gộp thành chuỗi dài hơn cho định giá.
          Việc phân tích AI là bước riêng, cần bạn xác nhận.
        </p>

        {error && <p className="text-error font-data-md text-data-md py-4">{error}</p>}
        {!reports && !error && (
          <p className="text-on-surface-variant font-data-md text-data-md py-6 text-center">
            Đang lấy danh sách từ Vietstock…
          </p>
        )}

        <ul className="mt-3 space-y-2">
          {reports?.map((r) => (
            <li
              key={r.url}
              className="flex items-center justify-between gap-3 border border-outline-variant bg-surface-container-low p-3"
            >
              <div className="min-w-0">
                <div className="font-data-md text-data-md text-on-surface truncate flex items-center gap-1.5">
                  {r.title || `BCTC ${r.year ?? "?"}`}
                  {r.period === "annual" && (
                    <span className="shrink-0 text-data-sm uppercase font-label-caps text-secondary border border-secondary/40 px-1 leading-tight">
                      Năm
                    </span>
                  )}
                </div>
                <div className="text-data-sm text-on-surface-variant opacity-60">
                  {r.date ?? ""}
                  {r.kind === "zip" && (
                    <span className="ml-1 opacity-80">· nén (tự giải nén PDF)</span>
                  )}
                </div>
              </div>
              {r.in_system ? (
                <span className="text-data-sm text-secondary font-label-caps uppercase shrink-0">
                  Đã có
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onPick(r)}
                  disabled={fetchingUrl === r.url}
                  className="px-3 py-1 border border-primary text-primary font-label-caps text-label-caps uppercase hover:bg-primary/10 transition disabled:opacity-50 shrink-0"
                >
                  {fetchingUrl === r.url ? "Đang tải…" : "Tải về"}
                </button>
              )}
            </li>
          ))}
          {reports?.length === 0 && (
            <li className="text-on-surface-variant font-data-md text-data-md py-6 text-center">
              Vietstock không có BCTC dạng PDF cho mã này.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
