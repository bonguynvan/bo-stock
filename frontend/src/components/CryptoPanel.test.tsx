import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import CryptoPanel from "@/components/CryptoPanel";
import type { CryptoQuote } from "@/types/stock";

vi.mock("@/lib/api", () => ({ getCryptoMarkets: vi.fn() }));
import { getCryptoMarkets } from "@/lib/api";

const rows: CryptoQuote[] = [
  { symbol: "BTC", name: "Bitcoin", price: 64000, change_pct: 1.3, market_cap: 1_260_000_000_000 },
  { symbol: "ETH", name: "Ethereum", price: 1911.76, change_pct: -0.5, market_cap: 230_000_000_000 },
];

describe("CryptoPanel", () => {
  beforeEach(() => vi.mocked(getCryptoMarkets).mockReset());

  it("renders coins with price, 24h change and abbreviated market cap", async () => {
    vi.mocked(getCryptoMarkets).mockResolvedValue(rows);
    render(<CryptoPanel />);
    await waitFor(() => expect(screen.getByText("BTC")).toBeInTheDocument());
    expect(screen.getByText("+1.30%")).toBeInTheDocument();
    expect(screen.getByText("-0.50%")).toBeInTheDocument();
    expect(screen.getByText("1.26T")).toBeInTheDocument(); // 1.26e12 → T
    expect(screen.getByText("230.0B")).toBeInTheDocument(); // 2.3e11 → B
  });
});
