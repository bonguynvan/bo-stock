"use client";

import type { StockDetail } from "@/types/stock";
import { changeColor, fmtDecimal, fmtNumber, fmtPercent, isNum } from "@/lib/format";

interface DetailPanelProps {
  detail: StockDetail | null;
  loading: boolean;
  error: string | null;
  selectedSymbol: string | null;
  onJournal?: (symbol: string) => void;
  onOpenDetail?: (symbol: string) => void;
}

function HealthCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="bg-surface-container p-2 border border-outline-variant">
      <div className="text-data-sm text-on-surface-variant">{label}</div>
      <div className={`font-data-md text-data-md ${tone ?? "text-on-surface"}`}>
        {value}
      </div>
    </div>
  );
}

export default function DetailPanel({
  detail,
  loading,
  error,
  selectedSymbol,
  onJournal,
  onOpenDetail,
}: DetailPanelProps) {
  const shellClass =
    "w-80 bg-surface-container-lowest border-l border-outline-variant flex flex-col overflow-y-auto custom-scrollbar";

  if (!selectedSymbol) {
    return (
      <aside className={shellClass}>
        <div className="flex flex-col items-center justify-center h-full gap-2 p-6 text-center">
          <span
            className="material-symbols-outlined text-on-surface-variant"
            style={{ fontSize: "32px" }}
          >
            ads_click
          </span>
          <p className="text-on-surface-variant text-body-md">
            Chọn một mã cổ phiếu để xem chi tiết.
          </p>
        </div>
      </aside>
    );
  }

  if (loading) {
    return (
      <aside className={shellClass}>
        <div className="p-4 space-y-4 animate-pulse">
          <div className="h-8 w-24 bg-surface-container-highest" />
          <div className="h-4 w-40 bg-surface-container-highest" />
          <div className="grid grid-cols-2 gap-4 pt-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 bg-surface-container-highest" />
            ))}
          </div>
          <div className="h-32 bg-surface-container-highest" />
        </div>
      </aside>
    );
  }

  if (error || !detail) {
    return (
      <aside className={shellClass}>
        <div className="flex flex-col items-center justify-center h-full gap-2 p-6 text-center">
          <span className="material-symbols-outlined text-error" style={{ fontSize: "32px" }}>
            error
          </span>
          <p className="text-error font-data-md text-data-md">
            {error ?? `Không tìm thấy dữ liệu cho ${selectedSymbol}`}
          </p>
        </div>
      </aside>
    );
  }

  const maxProfit = detail.quarterly_profit.reduce(
    (max, q) => (q.value > max ? q.value : max),
    0,
  );
  const lastIndex = detail.quarterly_profit.length - 1;

  return (
    <aside className={shellClass}>
      <div className="p-4 border-b border-outline-variant bg-surface-container-high">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="font-display-lg text-display-lg text-primary">
              {detail.symbol}
            </h2>
            <p className="text-on-surface-variant text-body-md">{detail.company_name}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {detail.tags.map((tag) => (
              <span
                key={tag}
                className="bg-primary/10 text-primary border border-primary px-2 py-0.5 font-label-caps text-label-caps"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        <section>
          <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest mb-3">
            Fundamental Health
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <HealthCard
              label="Vốn điều lệ"
              value={isNum(detail.charter_capital) ? `${fmtNumber(detail.charter_capital)} B` : "—"}
            />
            <HealthCard label="EPS (Trailing)" value={fmtDecimal(detail.eps_trailing, 1)} />
            <HealthCard
              label="Tăng trưởng LN"
              value={fmtPercent(detail.profit_growth, 1, true)}
              tone={changeColor(detail.profit_growth)}
            />
            <HealthCard
              label="Tiền mặt"
              value={isNum(detail.cash) ? `${fmtNumber(detail.cash)} B` : "—"}
            />
          </div>
        </section>

        <section>
          <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest mb-3">
            Tăng trưởng Lợi nhuận Q/Q
          </h3>
          <div className="h-32 border border-outline-variant relative flex items-end justify-between p-2 pt-6 gap-1">
            <div className="absolute top-2 left-2 text-data-sm text-primary">
              Unit: VND Billion
            </div>
            <div className="absolute inset-x-0 top-0 bottom-0 pointer-events-none opacity-20">
              <div className="h-px bg-outline-variant mt-4 w-full" />
              <div className="h-px bg-outline-variant mt-8 w-full" />
              <div className="h-px bg-outline-variant mt-12 w-full" />
            </div>
            {detail.quarterly_profit.length === 0 && (
              <div className="w-full text-center text-on-surface-variant text-data-sm">
                Không có dữ liệu
              </div>
            )}
            {detail.quarterly_profit.map((q, i) => {
              const pct = maxProfit > 0 ? Math.max(6, (q.value / maxProfit) * 100) : 6;
              const isLatest = i === lastIndex;
              return (
                <div
                  key={q.period}
                  className={`flex-1 border ${
                    isLatest
                      ? "bg-primary-container border-primary-container"
                      : "bg-surface-container-highest border-outline-variant"
                  }`}
                  style={{ height: `${pct}%` }}
                  title={`${q.period}: ${fmtNumber(q.value)}`}
                />
              );
            })}
          </div>
          <div className="flex justify-between mt-2 font-data-sm text-data-sm text-on-surface-variant">
            {detail.quarterly_profit.map((q) => (
              <span key={q.period}>{q.period}</span>
            ))}
          </div>
        </section>

        <section>
          <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest mb-3">
            Cấu trúc sở hữu
          </h3>
          <div className="space-y-2">
            {detail.ownership.length === 0 && (
              <p className="text-on-surface-variant text-data-sm">Không có dữ liệu</p>
            )}
            {detail.ownership.map((owner, i) => {
              const isMajor = i === detail.ownership.length - 1;
              return (
                <div key={owner.name}>
                  <div className="flex justify-between items-center">
                    <span className="text-body-md text-on-surface-variant">
                      {owner.name}
                    </span>
                    <span className="font-data-md text-data-md">
                      {fmtDecimal(owner.pct, 2)}%
                    </span>
                  </div>
                  <div className="w-full bg-surface-container-highest h-1 overflow-hidden mt-1">
                    <div
                      className={isMajor ? "h-full bg-primary-container" : "h-full bg-primary/40"}
                      style={{ width: `${Math.max(0, Math.min(100, owner.pct))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="pt-4 space-y-2">
          <button
            type="button"
            onClick={() => onOpenDetail?.(detail.symbol)}
            className="w-full py-2 bg-primary-container text-on-primary font-label-caps text-label-caps uppercase tracking-widest hover:brightness-110 transition-colors flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
              description
            </span>
            Chi tiết & BCTC
          </button>
          <button
            type="button"
            onClick={() => onJournal?.(detail.symbol)}
            className="w-full py-2 border border-primary text-primary font-label-caps text-label-caps uppercase tracking-widest hover:bg-primary/10 transition-colors flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
              edit_note
            </span>
            Ghi nhật ký cho {detail.symbol}
          </button>
        </div>
      </div>
    </aside>
  );
}
