import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BacktestPanel from "@/components/BacktestPanel";
import type { Backtest } from "@/types/stock";

vi.mock("@/lib/api", () => ({ getBacktest: vi.fn() }));
import { getBacktest } from "@/lib/api";

const result: Backtest = {
  available: true,
  days: 400,
  fast: 20,
  slow: 50,
  strategy_return: 18.4,
  buyhold_return: 12.1,
  strategy: { annual_volatility: 0.18, sharpe: 1.1, max_drawdown: -0.12 },
  buyhold: { annual_volatility: 0.26, sharpe: 0.7, max_drawdown: -0.24 },
  trades: 6,
  win_rate: 0.5,
  time_in_market: 0.62,
  equity: [
    { i: 0, s: 1, b: 1 },
    { i: 1, s: 1.05, b: 1.03 },
    { i: 2, s: 1.18, b: 1.12 },
  ],
};

describe("BacktestPanel", () => {
  beforeEach(() => vi.mocked(getBacktest).mockReset());

  it("runs with defaults and shows strategy vs buy-and-hold", async () => {
    vi.mocked(getBacktest).mockResolvedValue(result);
    render(<BacktestPanel symbol="FPT" />);
    await waitFor(() => expect(getBacktest).toHaveBeenCalledWith("FPT", 20, 50));
    expect(await screen.findByText("+18.4%")).toBeInTheDocument(); // strategy return
    expect(screen.getByText("+12.1%")).toBeInTheDocument(); // buy-hold
    expect(screen.getByText(/không phải tín hiệu hay khuyến nghị/)).toBeInTheDocument();
  });

  it("re-runs with new SMA params", async () => {
    const user = userEvent.setup();
    vi.mocked(getBacktest).mockResolvedValue(result);
    render(<BacktestPanel symbol="FPT" />);
    await waitFor(() => expect(getBacktest).toHaveBeenCalledTimes(1));

    const fast = screen.getByLabelText("SMA nhanh");
    await user.clear(fast);
    await user.type(fast, "10");
    await user.click(screen.getByRole("button", { name: "Chạy lại" }));
    await waitFor(() => expect(getBacktest).toHaveBeenCalledWith("FPT", 10, 50));
  });

  it("shows a note when not enough data", async () => {
    vi.mocked(getBacktest).mockResolvedValue({ available: false, note: "Không đủ dữ liệu giá cho tham số này." });
    render(<BacktestPanel symbol="FPT" />);
    await waitFor(() => expect(screen.getByText(/Không đủ dữ liệu giá/)).toBeInTheDocument());
  });
});
