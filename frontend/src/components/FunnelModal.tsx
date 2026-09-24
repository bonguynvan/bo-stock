"use client";

import { useEffect } from "react";
import type { FunnelRow } from "@/types/stock";
import { FLAG_INFO } from "@/lib/funnel";
import { fmtDecimal, fmtNumber } from "@/lib/format";

interface FunnelModalProps {
  rows: FunnelRow[];
  tier1Count: number;
  droppedIlliquid: number;
  unknownLiquidity: number;
  onClose: () => void;
  onOpenDetail: (symbol: string) => void;
}

function shortColor(s: number | null): string {
  if (s == null) return "text-on-surface-variant";
  if (s > 70) return "text-secondary";
  if (s >= 40) return "text-primary";
  return "text-error";
}

export default function FunnelModal({
  rows,
  tier1Count,
  droppedIlliquid,
  unknownLiquidity,
  onClose,
  onOpenDetail,
}: FunnelModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Phễu lọc 4 tầng"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-container border border-outline w-full max-w-4xl max-h-[85vh] overflow-y-auto custom-scrollbar p-5"
      >
        <div className="flex items-center justify-between border-b border-outline-variant pb-3">
          <h2 className="font-headline-md text-headline-md text-on-surface">
            Phễu lọc 4 tầng — {rows.length} mã qua Tầng 1–3
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

        <div className="mt-3 border-l-2 border-primary bg-primary/10 p-3 text-body-md text-on-surface">
          Đã qua <strong>Tầng 1–3</strong> (lọc cứng → earnings quality → kỹ thuật/Compass) từ {tier1Count} mã
          Tầng 1. <strong>Tầng 4</strong> (hiểu công ty, ngành theo dõi được) cần bạn tự đánh giá — đây là bước
          máy không thay bạn quyết định được. Chọn 3–5 mã hiểu rõ nhất → mở chi tiết → tải BCTC để phân tích sâu.
        </div>

        {rows.length === 0 ? (
          <p className="text-on-surface-variant font-data-md text-data-md py-6 text-center">
            Không có mã nào qua Tầng 1.
          </p>
        ) : (
          <table className="w-full text-left mt-4 font-data-md text-data-md">
            <thead className="font-label-caps text-label-caps text-on-surface-variant uppercase border-b border-outline-variant">
              <tr>
                <th className="py-2 pr-2">Mã</th>
                <th className="py-2 pr-2">Công ty</th>
                <th className="py-2 px-2 text-right">ROE%</th>
                <th className="py-2 px-2 text-right">P/E</th>
                <th className="py-2 px-2 text-right">Vốn hóa</th>
                <th className="py-2 px-2 text-right">Compass NH</th>
                <th className="py-2 pl-2">Cảnh báo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {rows.map((r) => (
                <tr
                  key={r.symbol}
                  onClick={() => onOpenDetail(r.symbol)}
                  className="hover:bg-surface-container-high cursor-pointer"
                >
                  <td className="py-2 pr-2 font-bold text-primary">{r.symbol}</td>
                  <td className="py-2 pr-2 text-on-surface-variant truncate max-w-[200px]">
                    {r.company_name}
                  </td>
                  <td className="py-2 px-2 text-right">{fmtDecimal(r.roe, 1)}</td>
                  <td className="py-2 px-2 text-right">{fmtDecimal(r.pe, 1)}</td>
                  <td className="py-2 px-2 text-right">{fmtNumber(r.market_cap)}</td>
                  <td className={`py-2 px-2 text-right font-bold ${shortColor(r.shortTerm)}`}>
                    {r.shortTerm != null ? Math.round(r.shortTerm) : "—"}
                  </td>
                  <td className="py-2 pl-2">
                    {r.flags.map((f) => (
                      <span
                        key={f}
                        title={FLAG_INFO[f].tip}
                        className="inline-flex items-center gap-0.5 text-error mr-2"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "15px" }}>
                          warning
                        </span>
                        <span className="text-data-sm">{FLAG_INFO[f].label}</span>
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="text-data-sm text-on-surface-variant opacity-60 mt-4">
          Tầng 1: ROE&gt;15, PE&lt;20, vốn hóa&gt;1.000 tỷ, sàn HOSE. Lọc thanh khoản: loại{" "}
          {droppedIlliquid} mã có KLGD TB 30 phiên &lt; 500k.
          {unknownLiquidity > 0 && (
            <>
              {" "}
              {unknownLiquidity} mã chưa có dữ liệu khối lượng (giữ lại) — chạy đồng bộ giá/khối
              lượng để lọc thanh khoản đầy đủ.
            </>
          )}{" "}
          Không gọi AI ở bất kỳ tầng nào.
        </p>
      </div>
    </div>
  );
}
