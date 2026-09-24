import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import WorldMarketsPanel from "@/components/WorldMarketsPanel";
import type { WorldQuote } from "@/types/stock";

vi.mock("@/lib/api", () => ({
  getWorldMarkets: vi.fn(),
}));

import { getWorldMarkets } from "@/lib/api";

const quotes: WorldQuote[] = [
  {
    symbol: "^GSPC",
    name: "S&P 500",
    group: "Chỉ số",
    price: 5500,
    prev_close: 5450,
    change: 50,
    change_pct: 0.92,
    currency: "USD",
  },
  {
    symbol: "BTC-USD",
    name: "Bitcoin",
    group: "Crypto",
    price: 60000,
    prev_close: 61000,
    change: -1000,
    change_pct: -1.64,
    currency: "USD",
  },
];

describe("WorldMarketsPanel", () => {
  beforeEach(() => {
    vi.mocked(getWorldMarkets).mockReset();
  });

  it("renders instruments with prices and signed day-change", async () => {
    vi.mocked(getWorldMarkets).mockResolvedValue(quotes);
    render(<WorldMarketsPanel />);
    await waitFor(() => expect(screen.getByText("S&P 500")).toBeInTheDocument());
    expect(screen.getByText("Bitcoin")).toBeInTheDocument();
    expect(screen.getByText("+0.92%")).toBeInTheDocument();
    expect(screen.getByText("-1.64%")).toBeInTheDocument();
  });

  it("shows an error when the fetch fails and there is no data", async () => {
    vi.mocked(getWorldMarkets).mockRejectedValue(new Error("boom"));
    render(<WorldMarketsPanel />);
    await waitFor(() => expect(screen.getByText("boom")).toBeInTheDocument());
  });
});
