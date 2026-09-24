"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DocumentMeta, ReportItem } from "@/types/stock";
import {
  analyzeDocument,
  deleteDocument,
  fetchReport,
  getDocuments,
  uploadDocument,
} from "@/lib/api";
import FinancialCharts from "./FinancialCharts";
import AnalysisDetails from "./AnalysisDetails";
import ConfirmModal from "./ConfirmModal";
import ReportPickerModal from "./ReportPickerModal";
import BctcGuideDialog from "./BctcGuideDialog";

interface BctcReaderProps {
  symbol: string;
  onToast: (message: string) => void;
  /** Fired after a successful AI analysis (parent regenerates its summary). */
  onAnalyzed?: () => void;
  /** Reports whether any document currently has analysis (gates valuation). */
  onHasAnalyzedChange?: (hasAnalyzed: boolean) => void;
}

/**
 * BCTC (financial-report) reader: fetch/upload PDFs, run research-only AI analysis
 * (extract/summarize — never buy/sell advice), and render the results. Extracted
 * from StockDetailView to keep that view focused; owns all document state here.
 */
export default function BctcReader({
  symbol,
  onToast,
  onAnalyzed,
  onHasAnalyzedChange,
}: BctcReaderProps) {
  const [docs, setDocs] = useState<DocumentMeta[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fetchingUrl, setFetchingUrl] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [confirmAnalyze, setConfirmAnalyze] = useState<DocumentMeta | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const refreshDocs = useCallback(async () => {
    try {
      const list = await getDocuments(symbol);
      setDocs(list);
      onHasAnalyzedChange?.(list.some((d) => d.analysis));
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Lỗi khi tải danh sách BCTC");
    }
  }, [symbol, onToast, onHasAnalyzedChange]);

  useEffect(() => {
    refreshDocs();
  }, [refreshDocs]);

  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        await uploadDocument(file, symbol);
        await refreshDocs();
        onToast(`Đã tải lên ${file.name}`);
      } catch (err) {
        onToast(err instanceof Error ? err.message : "Lỗi khi tải lên");
      } finally {
        setUploading(false);
        if (fileInput.current) fileInput.current.value = "";
      }
    },
    [symbol, refreshDocs, onToast],
  );

  const handlePickReport = useCallback(
    async (report: ReportItem) => {
      setFetchingUrl(report.url);
      try {
        const doc = await fetchReport(symbol, report.url);
        await refreshDocs();
        onToast(`Đã tải về ${doc.filename} — bấm "Phân tích AI" để phân tích.`);
        setPickerOpen(false);
      } catch (err) {
        onToast(err instanceof Error ? err.message : "Lỗi khi lấy BCTC");
      } finally {
        setFetchingUrl(null);
      }
    },
    [symbol, refreshDocs, onToast],
  );

  const handleAnalyze = useCallback(
    async (id: number, force: boolean) => {
      setAnalyzingId(id);
      onToast(force ? "Đang phân tích lại bằng AI…" : "Đang phân tích BCTC bằng AI…");
      try {
        await analyzeDocument(id, force);
        await refreshDocs();
        onToast("Đã phân tích xong — đang tổng hợp tóm tắt…");
        onAnalyzed?.();
      } catch (err) {
        onToast(err instanceof Error ? err.message : "Lỗi khi phân tích");
      } finally {
        setAnalyzingId(null);
      }
    },
    [refreshDocs, onToast, onAnalyzed],
  );

  const handleDelete = useCallback(
    async (id: number) => {
      if (!window.confirm("Xóa tài liệu này?")) return;
      try {
        await deleteDocument(id);
        await refreshDocs();
        onToast("Đã xóa tài liệu");
      } catch (err) {
        onToast(err instanceof Error ? err.message : "Lỗi khi xóa");
      }
    },
    [refreshDocs, onToast],
  );

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-label-caps text-label-caps text-primary uppercase tracking-widest">
          Báo cáo tài chính (BCTC) & Phân tích AI
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-label-caps text-label-caps uppercase hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>menu_book</span>
            Hướng dẫn đọc
          </button>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="px-3 py-1.5 bg-primary-container text-on-primary font-label-caps text-label-caps uppercase cursor-pointer hover:brightness-110 transition flex items-center gap-2"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
              cloud_download
            </span>
            Tải BCTC (Vietstock)
          </button>
          <label className="px-3 py-1.5 border border-primary text-primary font-label-caps text-label-caps uppercase cursor-pointer hover:bg-primary/10 transition-colors flex items-center gap-2">
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
              upload_file
            </span>
            {uploading ? "Đang tải…" : "Tải file"}
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
            />
          </label>
        </div>
      </div>
      <p className="text-on-surface-variant text-body-md opacity-70">
        Bấm “Tải BCTC (Vietstock)” để tự động lấy báo cáo mới nhất, hoặc tải file PDF của bạn.
        AI chỉ trích xuất & tóm tắt số liệu khi bạn chủ động phân tích — không đưa khuyến nghị mua/bán.
      </p>

      {docs.length === 0 && (
        <p className="text-on-surface-variant font-data-md text-data-md py-6 text-center border border-outline-variant border-dashed">
          Chưa có BCTC. Bấm “Tải BCTC (Vietstock)” để tự động lấy, hoặc tải file PDF.
        </p>
      )}

      <div className="space-y-3">
        {docs.map((doc) => (
          <article key={doc.id} className="border border-outline-variant bg-surface-container-low">
            <div className="flex items-center justify-between p-3 border-b border-outline-variant">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: "18px" }}>
                  picture_as_pdf
                </span>
                <span className="font-data-md text-data-md truncate">{doc.filename}</span>
                {doc.report_period && doc.report_period !== "annual" && (
                  <span
                    title="Báo cáo kỳ (không dùng cho định giá đa niên)"
                    className="shrink-0 text-data-sm uppercase font-label-caps text-primary border border-primary/40 px-1.5 py-0.5"
                  >
                    {doc.report_period === "quarterly" ? "Quý" : "Bán niên"}
                  </span>
                )}
                {doc.report_period === "annual" && (
                  <span className="shrink-0 text-data-sm uppercase font-label-caps text-secondary border border-secondary/40 px-1.5 py-0.5">
                    Năm
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setConfirmAnalyze(doc)}
                  disabled={analyzingId === doc.id}
                  className="px-3 py-1 bg-primary-container text-on-primary font-label-caps text-label-caps uppercase hover:brightness-110 transition disabled:opacity-50"
                >
                  {analyzingId === doc.id
                    ? "Đang phân tích…"
                    : doc.analysis
                      ? "Phân tích lại"
                      : "Phân tích AI"}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(doc.id)}
                  title="Xóa"
                  aria-label={`Xóa tài liệu ${doc.id}`}
                  className="text-on-surface-variant hover:text-error transition-colors"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                    delete
                  </span>
                </button>
              </div>
            </div>

            {doc.analysis && (
              <div className="p-4 space-y-4">
                {doc.analysis.key_figures.length > 0 && (
                  <div>
                    <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2">
                      Số liệu chính
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {doc.analysis.key_figures.map((f, i) => (
                        <div key={i} className="bg-surface-container p-2 border border-outline-variant">
                          <div className="text-data-sm text-on-surface-variant">{f.label}</div>
                          <div className="font-data-md text-data-md">
                            {f.value}
                            {f.unit && !f.value.includes(f.unit) ? ` ${f.unit}` : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {doc.analysis.summary && (
                  <div>
                    <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-1">
                      Tóm tắt
                    </h3>
                    <p className="text-body-md text-on-surface whitespace-pre-wrap">
                      {doc.analysis.summary}
                    </p>
                  </div>
                )}
                {doc.analysis.yoy_changes.length > 0 && (
                  <div>
                    <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-1">
                      Biến động YoY
                    </h3>
                    <ul className="list-disc list-inside text-body-md text-on-surface space-y-0.5">
                      {doc.analysis.yoy_changes.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {doc.analysis.risk_flags.length > 0 && (
                  <div>
                    <h3 className="font-label-caps text-label-caps text-error uppercase mb-1">
                      Điểm cần lưu ý
                    </h3>
                    <ul className="list-disc list-inside text-body-md text-on-surface space-y-0.5">
                      {doc.analysis.risk_flags.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <FinancialCharts analysis={doc.analysis} />
                <AnalysisDetails analysis={doc.analysis} />

                {doc.analysis_model && (
                  <p className="text-data-sm text-on-surface-variant opacity-60">
                    Phân tích bởi {doc.analysis_model}
                  </p>
                )}
              </div>
            )}
          </article>
        ))}
      </div>

      {confirmAnalyze && (
        <ConfirmModal
          title="Phân tích BCTC bằng AI"
          message={
            (confirmAnalyze.analysis != null
              ? `Phân tích LẠI "${confirmAnalyze.filename}" sẽ chạy AI lần nữa và dùng thêm 1 lượt (tốn credit).\n`
              : `Phân tích "${confirmAnalyze.filename}" sẽ dùng 1 lượt AI (tốn credit).\n`) +
            "AI chỉ trích xuất & tóm tắt số liệu — không đưa khuyến nghị mua/bán.\n\n" +
            "Xác nhận sử dụng?"
          }
          confirmLabel="Phân tích (dùng credit)"
          onCancel={() => setConfirmAnalyze(null)}
          onConfirm={() => {
            const { id, analysis } = confirmAnalyze;
            setConfirmAnalyze(null);
            handleAnalyze(id, analysis != null); // force re-analyze if already analyzed
          }}
        />
      )}

      {pickerOpen && (
        <ReportPickerModal
          symbol={symbol}
          fetchingUrl={fetchingUrl}
          onClose={() => setPickerOpen(false)}
          onPick={handlePickReport}
        />
      )}

      {guideOpen && <BctcGuideDialog onClose={() => setGuideOpen(false)} />}
    </section>
  );
}
