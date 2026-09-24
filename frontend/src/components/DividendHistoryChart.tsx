"use client";

import type { DividendHistory } from "@/types/stock";

/**
 * Per-year dividend-yield history (bars) + a reliability summary. Sourced from the
 * yearly ratio series (metric_history.dividend_yield). Research-only: describes
 * income reliability, not a recommendation.
 */
export default function DividendHistoryChart({ data }: { data: DividendHistory }) {
  const max = Math.max(...data.series.map((p) => p.dividend_yield), 1);
  const noPay = data.years_paid === 0;

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="font-label-caps text-label-caps text-on-surface uppercase tracking-wide">
          Cổ tức {data.n} năm
        </h3>
        <span className="text-data-sm text-on-surface-variant">
          {noPay
            ? "Không trả cổ tức"
            : `Trả ${data.years_paid}/${data.n} năm · TB ${data.avg_yield.toFixed(1)}%`}
        </span>
      </div>

      <div
        className="flex items-end gap-1 h-16"
        role="img"
        aria-label={`Lịch sử cổ tức ${data.n} năm`}
      >
        {data.series.map((p) => (
          <div key={p.year} className="flex flex-1 flex-col items-center gap-1 group">
            <div
              className={`w-full transition-all ${
                p.dividend_yield > 0 ? "bg-primary" : "bg-outline"
              }`}
              style={{
                height: `${Math.max((p.dividend_yield / max) * 44, p.dividend_yield > 0 ? 3 : 1)}px`,
              }}
              title={`${p.year}: ${p.dividend_yield.toFixed(2)}%`}
            />
            <span className="text-data-sm text-on-surface-variant opacity-60">
              {`'${String(p.year).slice(2)}`}
            </span>
          </div>
        ))}
      </div>

      {noPay && (
        <p className="text-data-sm text-on-surface-variant opacity-70">
          Không trả cổ tức tiền mặt gần đây — có thể do tái đầu tư (thường gặp ở cổ phiếu
          tăng trưởng); không phải tín hiệu tốt/xấu tự thân.
        </p>
      )}
    </section>
  );
}
