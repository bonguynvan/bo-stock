import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import PortfolioRiskPanel from "@/components/PortfolioRiskPanel";
import type { PortfolioRisk } from "@/types/stock";

vi.mock("@/lib/api", () => ({ getPortfolioRisk: vi.fn() }));
import { getPortfolioRisk } from "@/lib/api";

describe("PortfolioRiskPanel", () => {
  beforeEach(() => vi.mocked(getPortfolioRisk).mockReset());

  it("renders metrics + correlations when available", async () => {
    const data: PortfolioRisk = {
      available: true,
      note: "mô tả",
      symbols: ["FPT", "VCB"],
      metrics: { days: 120, annual_volatility: 0.24, sharpe: 1.35, max_drawdown: -0.18, var_95: -0.031 },
      correlations: [{ a: "FPT", b: "VCB", corr: 0.42 }],
    };
    vi.mocked(getPortfolioRisk).mockResolvedValue(data);
    render(<PortfolioRiskPanel />);
    await waitFor(() => expect(screen.getByText("24.0%")).toBeInTheDocument()); // volatility
    expect(screen.getByText("1.35")).toBeInTheDocument(); // Sharpe
    expect(screen.getByText("-18.0%")).toBeInTheDocument(); // drawdown
    expect(screen.getByText(/FPT·VCB: 0.42/)).toBeInTheDocument();
  });

  it("shows the note when risk is not available", async () => {
    vi.mocked(getPortfolioRisk).mockResolvedValue({
      available: false,
      note: "Chưa có dữ liệu giá lịch sử (cần đồng bộ OHLC).",
    });
    render(<PortfolioRiskPanel />);
    await waitFor(() =>
      expect(screen.getByText(/Chưa có dữ liệu giá lịch sử/)).toBeInTheDocument(),
    );
  });
});
