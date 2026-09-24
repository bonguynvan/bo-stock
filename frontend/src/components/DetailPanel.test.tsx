import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import DetailPanel from "@/components/DetailPanel";
import type { StockDetail } from "@/types/stock";

function makeDetail(overrides: Partial<StockDetail> = {}): StockDetail {
  return {
    symbol: "AAA",
    company_name: "Company A",
    exchange: "HOSE",
    industry: "Tech",
    market_cap: 1000,
    close_price: 25000,
    change_pct: 1.5,
    pe: 12.3,
    pb: 1.1,
    roe: 22,
    roa: 11,
    net_margin: 8,
    revenue_growth: 5,
    eps_growth: 4,
    debt_equity: 0.5,
    current_ratio: 1.8,
    dividend_yield: 3,
    avg_volume_30d: 100000,
    quant_score: 85,
    quant_grade: "A+",
    updated_at: null,
    charter_capital: 5000,
    eps_trailing: 3.2,
    profit_growth: 12.5,
    cash: 800,
    quarterly_profit: [
      { period: "Q1", value: 100 },
      { period: "Q2", value: 150 },
    ],
    ownership: [
      { name: "Nhà nước", pct: 30 },
      { name: "Nước ngoài", pct: 25 },
    ],
    tags: ["VN30"],
    ...overrides,
  };
}

describe("DetailPanel", () => {
  it("shows the placeholder prompt when nothing is selected", () => {
    render(
      <DetailPanel detail={null} loading={false} error={null} selectedSymbol={null} />,
    );
    expect(
      screen.getByText("Chọn một mã cổ phiếu để xem chi tiết."),
    ).toBeInTheDocument();
  });

  it("renders company header, tags, health metrics, quarterly periods and ownership", () => {
    render(
      <DetailPanel
        detail={makeDetail()}
        loading={false}
        error={null}
        selectedSymbol="AAA"
      />,
    );

    expect(screen.getByRole("heading", { name: "AAA" })).toBeInTheDocument();
    expect(screen.getByText("Company A")).toBeInTheDocument();
    expect(screen.getByText("VN30")).toBeInTheDocument();
    // Health cards
    expect(screen.getByText("Vốn điều lệ")).toBeInTheDocument();
    expect(screen.getByText("+12.5%")).toBeInTheDocument(); // profit growth with sign
    // Quarterly periods appear (labels under the chart)
    expect(screen.getAllByText("Q1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Q2").length).toBeGreaterThan(0);
    // Ownership rows
    expect(screen.getByText("Nhà nước")).toBeInTheDocument();
    expect(screen.getByText("30.00%")).toBeInTheDocument();
  });

  it("renders the error message when error is provided", () => {
    render(
      <DetailPanel
        detail={null}
        loading={false}
        error="Lỗi tải dữ liệu"
        selectedSymbol="AAA"
      />,
    );
    expect(screen.getByText("Lỗi tải dữ liệu")).toBeInTheDocument();
  });

  it("renders a not-found fallback when a symbol is selected but detail is null", () => {
    render(
      <DetailPanel detail={null} loading={false} error={null} selectedSymbol="XYZ" />,
    );
    expect(
      screen.getByText("Không tìm thấy dữ liệu cho XYZ"),
    ).toBeInTheDocument();
  });

  it("is null-safe: renders em-dashes and empty-data notes for missing values", () => {
    render(
      <DetailPanel
        detail={makeDetail({
          charter_capital: null,
          cash: null,
          eps_trailing: null,
          profit_growth: null,
          quarterly_profit: [],
          ownership: [],
          tags: [],
        })}
        loading={false}
        error={null}
        selectedSymbol="AAA"
      />,
    );

    // Both the quarterly chart and ownership show the no-data note.
    expect(screen.getAllByText("Không có dữ liệu").length).toBe(2);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("renders the loading skeleton when loading", () => {
    const { container } = render(
      <DetailPanel
        detail={null}
        loading={true}
        error={null}
        selectedSymbol="AAA"
      />,
    );
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });
});
