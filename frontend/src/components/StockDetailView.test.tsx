import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StockDetailView from "@/components/StockDetailView";
import type { DocumentMeta, StockDetail } from "@/types/stock";

vi.mock("@/lib/api", () => ({
  getStockDetail: vi.fn(),
  getOhlc: vi.fn(),
  getDocuments: vi.fn(),
  uploadDocument: vi.fn(),
  analyzeDocument: vi.fn(),
  deleteDocument: vi.fn(),
  fetchReport: vi.fn(),
  getAvailableReports: vi.fn(),
}));

// Stub the chart (@tradecanvas/chart needs a real canvas, unavailable in jsdom).
vi.mock("@/components/PriceChart", () => ({
  default: () => <div data-testid="price-chart" />,
}));
// Stub ValuationPanel + CompassPanel (they self-fetch; tested separately).
vi.mock("@/components/ValuationPanel", () => ({
  default: () => <div data-testid="valuation" />,
}));
vi.mock("@/components/CompassPanel", () => ({
  default: () => <div data-testid="compass" />,
}));
vi.mock("@/components/FraudDetectionPanel", () => ({
  default: () => <div data-testid="fraud" />,
}));
vi.mock("@/components/ConvictionCard", () => ({
  default: () => <div data-testid="conviction" />,
}));
vi.mock("@/components/NewsSignalsPanel", () => ({
  default: () => <div data-testid="news-signals" />,
}));
vi.mock("@/components/ForeignStockPanel", () => ({
  default: () => <div data-testid="foreign-stock" />,
}));
vi.mock("@/components/PropTradingPanel", () => ({
  default: () => <div data-testid="prop-trading" />,
}));
vi.mock("@/components/InsiderPanel", () => ({
  default: () => <div data-testid="insider" />,
}));
vi.mock("@/components/PeerComparison", () => ({
  default: () => <div data-testid="peers" />,
}));
vi.mock("@/components/TechnicalsPanel", () => ({
  default: () => <div data-testid="technicals" />,
}));
vi.mock("@/components/SymbolNotesPanel", () => ({
  default: () => <div data-testid="notes" />,
}));
vi.mock("@/components/LensesPanel", () => ({
  default: () => <div data-testid="lenses" />,
}));
vi.mock("@/components/BacktestPanel", () => ({
  default: () => <div data-testid="backtest" />,
}));
// Self-fetching children — stubbed (tested separately).
vi.mock("@/components/InvestmentSummary", () => ({
  default: () => <div data-testid="investment-summary" />,
}));
vi.mock("@/components/SymbolNews", () => ({
  default: () => <div data-testid="symbol-news" />,
}));

import {
  analyzeDocument,
  getDocuments,
  getOhlc,
  getStockDetail,
} from "@/lib/api";

const detail = {
  symbol: "FPT",
  company_name: "CTCP FPT",
  industry: "Công nghệ",
  close_price: 70800,
  change_pct: -0.56,
  market_cap: 120608,
  pe: 12.4,
  pb: 3.1,
  roe: 26.8,
  eps_trailing: 5691,
  charter_capital: 17035,
} as unknown as StockDetail;

const analyzedDoc: DocumentMeta = {
  id: 1,
  symbol: "FPT",
  filename: "bctc-q1.pdf",
  size_bytes: 2048,
  analysis: {
    key_figures: [{ label: "Doanh thu", value: "12,480", unit: "tỷ" }],
    summary: "Doanh thu tăng trưởng tốt.",
    yoy_changes: ["LN sau thuế +14%"],
    risk_flags: ["Phải thu tăng nhanh"],
  },
  analysis_model: "claude-sonnet-4-6",
  uploaded_at: null,
  analyzed_at: null,
};

const noop = () => {};

beforeEach(() => {
  vi.mocked(getStockDetail).mockResolvedValue(detail);
  vi.mocked(getOhlc).mockResolvedValue([]);
  vi.mocked(getDocuments).mockResolvedValue([]);
  vi.mocked(analyzeDocument).mockResolvedValue(analyzedDoc);
});

afterEach(() => vi.clearAllMocks());

describe("StockDetailView", () => {
  it("renders fundamentals header from the detail API", async () => {
    render(<StockDetailView symbol="FPT" onBack={noop} onToast={noop} />);
    expect(await screen.findByText("CTCP FPT", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("FPT")).toBeInTheDocument();
  });

  it("shows the empty state and the research-only disclaimer", async () => {
    render(<StockDetailView symbol="FPT" onBack={noop} onToast={noop} />);
    expect(await screen.findByText(/Chưa có BCTC/)).toBeInTheDocument();
    expect(screen.getByText(/không đưa khuyến nghị mua\/bán/)).toBeInTheDocument();
  });

  it("renders analysis sections when a document is analyzed", async () => {
    vi.mocked(getDocuments).mockResolvedValue([analyzedDoc]);
    render(<StockDetailView symbol="FPT" onBack={noop} onToast={noop} />);
    expect(await screen.findByText("Doanh thu")).toBeInTheDocument();
    expect(screen.getByText("Doanh thu tăng trưởng tốt.")).toBeInTheDocument();
    expect(screen.getByText("LN sau thuế +14%")).toBeInTheDocument();
    expect(screen.getByText("Phải thu tăng nhanh")).toBeInTheDocument();
  });

  it("calls onBack when the back button is clicked", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<StockDetailView symbol="FPT" onBack={onBack} onToast={noop} />);
    await screen.findByText(/Chưa có BCTC/);
    await user.click(screen.getByText(/Quay lại Screener/));
    expect(onBack).toHaveBeenCalled();
  });

  it("confirms then triggers analysis for an un-analyzed document", async () => {
    const user = userEvent.setup();
    vi.mocked(getDocuments).mockResolvedValue([{ ...analyzedDoc, analysis: null }]);
    render(<StockDetailView symbol="FPT" onBack={noop} onToast={noop} />);
    await screen.findByText("bctc-q1.pdf");
    // Opens the credit-confirmation modal first (does not analyze immediately).
    await user.click(screen.getByText("Phân tích AI"));
    expect(analyzeDocument).not.toHaveBeenCalled();
    await user.click(screen.getByText("Phân tích (dùng credit)"));
    // Un-analyzed doc → force=false (no cached result to preserve).
    await waitFor(() => expect(analyzeDocument).toHaveBeenCalledWith(1, false));
  });
});
