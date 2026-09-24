import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PropTradingPanel from "@/components/PropTradingPanel";
import type { SymbolProp } from "@/types/stock";

vi.mock("@/lib/api", () => ({ getSymbolProp: vi.fn() }));
import { getSymbolProp } from "@/lib/api";

afterEach(() => vi.clearAllMocks());

describe("PropTradingPanel", () => {
  it("shows net sell (bán ròng) with the session date", async () => {
    const data: SymbolProp = {
      available: true, symbol: "HPG", date: "2026-08-07",
      buy_val: 36.353, sell_val: 40.097, net_val: -3.744,
    };
    vi.mocked(getSymbolProp).mockResolvedValue(data);
    render(<PropTradingPanel symbol="HPG" />);
    expect(await screen.findByText(/Bán ròng/)).toBeInTheDocument();
    expect(screen.getByText(/2026-08-07/)).toBeInTheDocument();
    expect(screen.getByText(/3[.,]7 tỷ/)).toBeInTheDocument();
    // Research-only: never a buy/sell recommendation.
    expect(screen.queryByText(/MUA|BÁN/)).not.toBeInTheDocument();
  });

  it("renders the source note when unavailable", async () => {
    vi.mocked(getSymbolProp).mockResolvedValue({
      available: false, symbol: "XYZ", note: "Không có dữ liệu tự doanh cho mã này.",
    });
    render(<PropTradingPanel symbol="XYZ" />);
    expect(await screen.findByText(/Không có dữ liệu tự doanh/)).toBeInTheDocument();
  });
});
