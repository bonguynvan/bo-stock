import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import InsiderPanel from "@/components/InsiderPanel";
import type { SymbolInsider } from "@/types/stock";

vi.mock("@/lib/api", () => ({ getSymbolInsider: vi.fn() }));
import { getSymbolInsider } from "@/lib/api";

afterEach(() => vi.clearAllMocks());

describe("InsiderPanel", () => {
  it("shows the net-direction summary and a recent deal", async () => {
    const data: SymbolInsider = {
      available: true, symbol: "HPG", count: 200,
      summary: { window_days: 180, net_shares: 33241904, buy_count: 1, sell_count: 1, direction: "buy" },
      deals: [
        {
          public_date: "2026-06-05", trader: "Trần Vũ Minh", position: "Thành viên HĐQT",
          action: "Mua", status: "done", transacted_shares: 33291904, ownership_after_pct: 2.73,
        },
      ],
    };
    vi.mocked(getSymbolInsider).mockResolvedValue(data);
    render(<InsiderPanel symbol="HPG" />);
    expect(await screen.findByText(/Nội bộ mua ròng/)).toBeInTheDocument();
    expect(screen.getByText(/33[.,]24M cp/)).toBeInTheDocument();
    expect(screen.getByText("Trần Vũ Minh")).toBeInTheDocument();
    expect(screen.getByText("Mua")).toBeInTheDocument();
    // Research-only: no buy/sell recommendation.
    expect(screen.queryByText(/KHUYẾN NGHỊ|NÊN MUA|NÊN BÁN/)).not.toBeInTheDocument();
  });

  it("renders the source note when unavailable", async () => {
    vi.mocked(getSymbolInsider).mockResolvedValue({
      available: false, symbol: "XYZ", note: "Không có dữ liệu giao dịch nội bộ cho mã này.",
    });
    render(<InsiderPanel symbol="XYZ" />);
    expect(await screen.findByText(/Không có dữ liệu giao dịch nội bộ/)).toBeInTheDocument();
  });
});
