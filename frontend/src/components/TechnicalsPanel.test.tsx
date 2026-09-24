import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import TechnicalsPanel from "@/components/TechnicalsPanel";
import type { Technicals } from "@/types/stock";

vi.mock("@/lib/api", () => ({ getTechnicals: vi.fn() }));
import { getTechnicals } from "@/lib/api";

const full: Technicals = {
  available: true,
  bars_used: 120,
  price: 70,
  sma20: 68,
  sma50: 65,
  rsi14: 62.5,
  macd: { line: 0.42, signal: 0.3, hist: 0.12 },
  bollinger: { upper: 74, middle: 68, lower: 62, percent_b: 0.66, width: 17.6 },
  atr14: 1.8,
  week52: { high: 80, low: 50, position: 66.7 },
};

describe("TechnicalsPanel", () => {
  beforeEach(() => vi.mocked(getTechnicals).mockReset());

  it("renders indicator values with neutral, research-only framing", async () => {
    vi.mocked(getTechnicals).mockResolvedValue(full);
    render(<TechnicalsPanel symbol="FPT" />);
    await waitFor(() => expect(screen.getByText("62.5")).toBeInTheDocument()); // RSI
    expect(screen.getByText("SMA 20")).toBeInTheDocument();
    expect(screen.getByText("0.120")).toBeInTheDocument(); // MACD hist
    expect(screen.getByText(/không phải tín hiệu mua\/bán/)).toBeInTheDocument();
  });

  it("shows an empty note when there is not enough OHLC", async () => {
    vi.mocked(getTechnicals).mockResolvedValue({ available: false, bars_used: 1 });
    render(<TechnicalsPanel symbol="FPT" />);
    await waitFor(() => expect(screen.getByText(/Chưa đủ dữ liệu giá/)).toBeInTheDocument());
  });
});
