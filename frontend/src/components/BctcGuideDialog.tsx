"use client";

import { useEffect } from "react";

/** Reading-order guide for the BCTC AI analysis — how to read it, which reports to
 * read, and what questions to answer. Research-only framing (no buy/sell). */
export default function BctcGuideDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Hướng dẫn đọc phân tích BCTC"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-container border border-outline w-full max-w-2xl max-h-[88vh] overflow-y-auto custom-scrollbar"
      >
        <div className="sticky top-0 bg-surface-container flex items-center justify-between border-b border-outline-variant p-5">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">
            📖 Hướng dẫn đọc phân tích BCTC
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

        <div className="p-5 space-y-5 text-body-md text-on-surface">
          <p className="border-l-2 border-primary bg-primary/10 p-3">
            Đọc BCTC là để hiểu <strong>xu hướng qua thời gian</strong>, không phải một tấm ảnh
            chụp một năm. Một năm tốt không nói lên gì — 4–5 năm tốt liên tiếp mới có ý nghĩa. Hãy
            đọc theo đúng thứ tự dưới đây.
          </p>

          {/* Step 1 */}
          <section className="space-y-2">
            <h3 className="font-headline-sm text-headline-sm text-primary">
              Bước 1 — BCTC kiểm toán 3–5 năm gần nhất (đọc theo chuỗi)
            </h3>
            <p className="text-on-surface-variant">
              <strong>Mục đích:</strong> hiểu xu hướng, không phải snapshot. Trong app, tải &amp;
              phân tích vài <span className="text-secondary font-bold">BCTC “Năm”</span> (kiểm toán)
              — mục “Xu hướng nhiều năm” sẽ gộp thành chuỗi dài.
            </p>
            <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">
              Câu hỏi cần trả lời từ chuỗi lịch sử:
            </p>
            <ul className="list-disc list-inside space-y-1 text-on-surface">
              <li>Doanh thu tăng đều hay giật cục?</li>
              <li>Biên lợi nhuận gộp có ổn định không, hay đang bị squeeze?</li>
              <li>ROE có bền vững hay chỉ 1–2 năm đột biến?</li>
              <li>Dòng tiền HĐKD có luôn dương không?</li>
              <li>Nợ đang tăng hay giảm theo thời gian?</li>
            </ul>
          </section>

          {/* Step 2 */}
          <section className="space-y-1">
            <h3 className="font-headline-sm text-headline-sm text-primary">
              Bước 2 — BCTC kiểm toán năm gần nhất
            </h3>
            <p className="text-on-surface-variant">
              <strong>Mục đích:</strong> xác nhận xu hướng vẫn đang tiếp tục, không có gì thay đổi
              đột ngột.
            </p>
          </section>

          {/* Step 3 */}
          <section className="space-y-1">
            <h3 className="font-headline-sm text-headline-sm text-primary">
              Bước 3 — BCTC quý gần nhất (chưa kiểm toán)
            </h3>
            <p className="text-on-surface-variant">
              <strong>Mục đích:</strong> kiểm tra hiện tại — quý này so với cùng kỳ năm trước có
              đang đi đúng hướng không? Có red flag nào mới xuất hiện không? (Báo cáo{" "}
              <span className="text-primary font-bold">“Quý”</span> chỉ dùng để cập nhật hiện trạng,
              không dùng cho định giá đa niên.)
            </p>
          </section>

          {/* How to read the AI output */}
          <section className="space-y-2 border-t border-outline-variant pt-4">
            <h3 className="font-label-caps text-label-caps text-on-surface uppercase tracking-wide">
              Đọc kết quả AI theo thứ tự nào
            </h3>
            <ul className="space-y-1.5">
              <li>
                <strong>Tóm tắt để cân nhắc</strong> — đọc đầu tiên: điểm mạnh, điểm cần cân nhắc
                (có bằng chứng số liệu), và <em>câu hỏi cần tự trả lời</em>.
              </li>
              <li>
                <strong>Xu hướng nhiều năm</strong> — nhìn chuỗi doanh thu / LNST / ROE / dòng tiền
                để trả lời 5 câu hỏi ở Bước 1.
              </li>
              <li>
                <strong>Chỉ số &amp; So sánh ngành</strong> — mã này so với trung vị ngành: vượt
                trội ở đâu, kém ở đâu.
              </li>
              <li>
                <strong>Dòng tiền</strong> — lợi nhuận có chuyển thành tiền thật không (HĐKD dương,
                khớp với LNST).
              </li>
              <li>
                <strong>Cảnh báo (risk flags)</strong> — lợi nhuận bất thường, phải thu tăng nhanh,
                nợ, giao dịch bên liên quan…
              </li>
              <li>
                <strong>Kim Chỉ Nam</strong> — điểm tổng hợp Ngắn/Trung/Dài hạn (mô tả, không phải
                khuyến nghị).
              </li>
            </ul>
          </section>

          <p className="text-data-sm text-on-surface-variant opacity-70 border-t border-outline-variant pt-3">
            AI chỉ trích xuất &amp; tóm tắt số liệu từ báo cáo — <strong>không đưa khuyến nghị
            mua/bán</strong>. Luôn tự kiểm chứng số liệu quan trọng với báo cáo gốc trước khi quyết định.
          </p>
        </div>
      </div>
    </div>
  );
}
