import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ForeignStockPanel from "@/components/ForeignStockPanel";
import type { SymbolForeign } from "@/types/stock";

vi.mock("@/lib/api", () => ({ getSymbolForeign: vi.fn() }));
import { getSymbolForeign } from "@/lib/api";

afterEach(() => vi.clearAllMocks());

describe("ForeignStockPanel", () => {
  it("shows net buy + room, no buy/sell advice", async () => {
    const data: SymbolForeign = {
      available: true, symbol: "FPT",
      buy_val: 347.2, sell_val: 19.2, net_val: 328, room_used_pct: 56.1,
    };
    vi.mocked(getSymbolForeign).mockResolvedValue(data);
    render(<ForeignStockPanel symbol="FPT" />);
    expect(await screen.findByText(/Mua ròng/)).toBeInTheDocument();
    expect(screen.getByText(/328[.,]0 tỷ/)).toBeInTheDocument();
    expect(screen.getByText("56.1%")).toBeInTheDocument();
    expect(screen.queryByText(/MUA|BÁN cổ phiếu/)).not.toBeInTheDocument();
  });

  it("shows a note when unavailable", async () => {
    vi.mocked(getSymbolForeign).mockResolvedValue({
      available: false, symbol: "XYZ", note: "Không có dữ liệu khối ngoại cho mã này.",
    });
    render(<ForeignStockPanel symbol="XYZ" />);
    expect(await screen.findByText(/Không có dữ liệu khối ngoại/)).toBeInTheDocument();
  });
});
