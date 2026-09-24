"use client";

import { useCallback, useEffect, useState } from "react";
import type { OhlcBar, StockDetail } from "@/types/stock";
import { downloadStockReport, getOhlc, getStockDetail } from "@/lib/api";
import { fmtDecimal, fmtNumber, fmtPercent, isNum, changeColor } from "@/lib/format";
import PriceChart from "./PriceChart";
import CompassPanel from "./CompassPanel";
import ConvictionCard from "./ConvictionCard";
import FraudDetectionPanel from "./FraudDetectionPanel";
import PeerComparison from "./PeerComparison";
import InvestmentSummary from "./InvestmentSummary";
import SymbolNews from "./SymbolNews";
import NewsSignalsPanel from "./NewsSignalsPanel";
import ForeignStockPanel from "./ForeignStockPanel";
import PropTradingPanel from "./PropTradingPanel";
import InsiderPanel from "./InsiderPanel";
import ValuationPanel from "./ValuationPanel";
import StarButton from "./StarButton";
import PanelSection from "./PanelSection";
import { IS_DESKTOP } from "@/lib/desktop";
import { openDetached } from "@/lib/desktopWindows";
import TechnicalsPanel from "./TechnicalsPanel";
import BacktestPanel from "./BacktestPanel";
import LensesPanel from "./LensesPanel";
import SymbolNotesPanel from "./SymbolNotesPanel";
import BctcReader from "./BctcReader";

interface StockDetailViewProps {
  symbol: string;
  onBack: () => void;
  onToast: (message: string) => void;
  isWatched?: boolean;
  onToggleWatchlist?: (symbol: string) => void;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-surface-container p-3 border border-outline-variant">
      <div className="font-label-caps text-label-caps text-on-surface-variant uppercase">
        {label}
      </div>
      <div className={`font-data-md text-data-md mt-1 ${tone ?? "text-on-surface"}`}>
        {value}
      </div>
    </div>
  );
}

export default function StockDetailView({
  symbol,
  onBack,
  onToast,
  isWatched = false,
  onToggleWatchlist,
}: StockDetailViewProps) {
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [ohlc, setOhlc] = useState<OhlcBar[]>([]);
  const [summarySignal, setSummarySignal] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);

  const handleExportReport = useCallback(async () => {
    setExporting(true);
    onToast("Đang tạo báo cáo PDF…");
    try {
      await downloadStockReport(symbol);
      onToast("Đã tạo báo cáo PDF");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Lỗi tạo báo cáo");
    } finally {
      setExporting(false);
    }
  }, [symbol, onToast]);

  useEffect(() => {
    let cancelled = false;
    getStockDetail(symbol)
      .then((d) => !cancelled && setDetail(d))
      .catch(() => !cancelled && setDetail(null));
    getOhlc(symbol, 120)
      .then((bars) => !cancelled && setOhlc(bars))
      .catch(() => !cancelled && setOhlc([]));
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-on-surface-variant hover:text-primary transition-colors font-label-caps text-label-caps uppercase"
      >
        <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
          arrow_back
        </span>
        Quay lại Screener
      </button>

      {/* Fundamentals header */}
      <header className="border-b border-outline-variant pb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display-lg text-display-lg text-primary">{symbol}</h1>
            {onToggleWatchlist && (
              <StarButton
                active={isWatched}
                size={26}
                label
                onToggle={() => onToggleWatchlist(symbol)}
              />
            )}
          </div>
          <p className="text-on-surface-variant text-body-md">
            {detail?.company_name ?? "—"}
            {detail?.industry ? ` · ${detail.industry}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {IS_DESKTOP && (
            <button
              type="button"
              onClick={() => void openDetached({ screen: "detail", symbol, title: "Chi tiết cổ phiếu" })}
              title="Mở mã này trong cửa sổ riêng"
              aria-label="Mở cửa sổ mới"
              className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-label-caps text-label-caps uppercase hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                open_in_new
              </span>
              Cửa sổ mới
            </button>
          )}
          <button
            type="button"
            onClick={handleExportReport}
            disabled={exporting}
            title="Xuất báo cáo nghiên cứu (PDF)"
            className="px-3 py-1.5 border border-primary text-primary font-label-caps text-label-caps uppercase hover:bg-primary/10 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
              picture_as_pdf
            </span>
            {exporting ? "Đang tạo…" : "Xuất PDF"}
          </button>
        </div>
      </header>

      {/* Quick-glance workspace: fundamentals + price side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {detail && (
          <PanelSection title="Chỉ số cơ bản" icon="analytics">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Giá" value={fmtNumber(detail.close_price)} />
              <Stat
                label="% Thay đổi"
                value={fmtPercent(detail.change_pct, 2, true)}
                tone={changeColor(detail.change_pct)}
              />
              <Stat label="Vốn hóa (tỷ)" value={fmtNumber(detail.market_cap)} />
              <Stat label="P/E" value={fmtDecimal(detail.pe, 1)} />
              <Stat label="P/B" value={fmtDecimal(detail.pb, 1)} />
              <Stat label="ROE (%)" value={fmtDecimal(detail.roe, 1)} />
              <Stat label="EPS (Trailing)" value={fmtDecimal(detail.eps_trailing, 1)} />
              <Stat
                label="Vốn điều lệ (tỷ)"
                value={isNum(detail.charter_capital) ? fmtNumber(detail.charter_capital) : "—"}
              />
            </div>
          </PanelSection>
        )}

        <PanelSection title="Biểu đồ giá (OHLC · ~6 tháng)" icon="show_chart">
          {ohlc.length > 0 ? (
            <PriceChart bars={ohlc} />
          ) : (
            <p className="text-on-surface-variant font-data-md text-data-md py-6 text-center border border-outline-variant border-dashed">
              Chưa có dữ liệu giá.
            </p>
          )}
        </PanelSection>
      </div>

      {/* Investment lenses — criteria checklists per school (research-only) */}
      <PanelSection title="Lăng kính đầu tư" icon="checklist">
        <LensesPanel symbol={symbol} />
      </PanelSection>

      {/* Technical indicators — descriptive numbers from OHLC (research-only) */}
      <PanelSection title="Chỉ báo kỹ thuật" icon="candlestick_chart">
        <TechnicalsPanel symbol={symbol} />
      </PanelSection>

      {/* Backtest — hypothetical SMA-crossover study vs buy-and-hold (research-only) */}
      <PanelSection title="Backtest (SMA crossover)" icon="history">
        <BacktestPanel symbol={symbol} />
      </PanelSection>

      {/* Investment Compass — quick composite overview */}
      <CompassPanel symbol={symbol} />

      {/* Financial-trust profile — synthesis of forensic + QoE + sector valuation */}
      <ConvictionCard symbol={symbol} />

      {/* Algorithmic screening (Beneish/Altman/Piotroski) — runs independent of AI */}
      <section className="border-t border-outline-variant pt-4">
        <h2 className="font-label-caps text-label-caps text-primary uppercase tracking-widest mb-3">
          Sàng lọc định lượng · rủi ro thao túng / kiệt quệ
        </h2>
        <FraudDetectionPanel symbol={symbol} />
      </section>

      {/* "Tóm tắt để cân nhắc" — the first thing to read after analyzing a BCTC */}
      <InvestmentSummary symbol={symbol} generateSignal={summarySignal} />

      {/* Foreign (khối ngoại) flow for this symbol — latest session, from VCI */}
      <PanelSection title="Khối ngoại" icon="public">
        <ForeignStockPanel symbol={symbol} />
      </PanelSection>

      {/* Proprietary-desk (tự doanh) flow — latest session, from CafeF */}
      <PanelSection title="Tự doanh (CTCK)" icon="account_balance">
        <PropTradingPanel symbol={symbol} />
      </PanelSection>

      {/* Insider (giao dịch nội bộ) — filed deals + net direction, from VCI */}
      <PanelSection title="Giao dịch nội bộ" icon="badge">
        <InsiderPanel symbol={symbol} />
      </PanelSection>

      {/* Peer / industry comparison */}
      <PeerComparison symbol={symbol} />

      {/* Related news (research-only relay) */}
      <SymbolNews symbol={symbol} />

      {/* News signals — AI classifies recent headlines (event + sentiment), on demand */}
      <NewsSignalsPanel symbol={symbol} />

      {/* Free-form research notes */}
      <PanelSection title="Ghi chú" icon="edit_note">
        <SymbolNotesPanel symbol={symbol} onToast={onToast} />
      </PanelSection>

      {/* BCTC reader (own component; owns document state) */}
      <BctcReader
        symbol={symbol}
        onToast={onToast}
        onAnalyzed={() => setSummarySignal((n) => n + 1)}
        onHasAnalyzedChange={setHasAnalyzed}
      />

      {/* Valuation (research-only) — needs an analyzed BCTC for the multi-year series */}
      {hasAnalyzed && (
        <section className="space-y-3">
          <h2 className="font-label-caps text-label-caps text-primary uppercase tracking-widest">
            Định giá cổ phiếu
          </h2>
          <ValuationPanel symbol={symbol} />
        </section>
      )}
    </div>
  );
}
