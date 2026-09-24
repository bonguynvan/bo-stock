import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ForeignFlowPanel from "@/components/ForeignFlowPanel";
import type { ForeignSummary } from "@/types/stock";

vi.mock("@/lib/api", () => ({ getForeignFlow: vi.fn() }));
import { getForeignFlow } from "@/lib/api";

describe("ForeignFlowPanel", () => {
  beforeEach(() => vi.mocked(getForeignFlow).mockReset());

  it("shows net buy with value + market share", async () => {
    const s: ForeignSummary = {
      available: true,
      date: "31/07/2026",
      index: "VNINDEX",
      buy_val: 2882,
      sell_val: 2204,
      net_val: 678,
      pct_buy_val: 14.2,
      pct_sell_val: 10.8,
    };
    vi.mocked(getForeignFlow).mockResolvedValue(s);
    render(<ForeignFlowPanel />);
    await waitFor(() => expect(screen.getByText(/Mua ròng/)).toBeInTheDocument());
    expect(screen.getByText("678 tỷ")).toBeInTheDocument();
    expect(screen.getByText(/14.2%/)).toBeInTheDocument();
  });

  it("renders 'Bán ròng' when net is negative", async () => {
    vi.mocked(getForeignFlow).mockResolvedValue({
      available: true, buy_val: 100, sell_val: 300, net_val: -200, date: "x", index: "VNINDEX",
    });
    render(<ForeignFlowPanel />);
    await waitFor(() => expect(screen.getByText(/Bán ròng/)).toBeInTheDocument());
    expect(screen.getByText("200 tỷ")).toBeInTheDocument();
  });

  it("shows a note when unavailable", async () => {
    vi.mocked(getForeignFlow).mockResolvedValue({ available: false, note: "Chưa lấy được dữ liệu khối ngoại." });
    render(<ForeignFlowPanel />);
    await waitFor(() => expect(screen.getByText(/Chưa lấy được dữ liệu khối ngoại/)).toBeInTheDocument());
  });
});
