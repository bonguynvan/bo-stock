import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import FxPanel from "@/components/FxPanel";
import type { WorldQuote } from "@/types/stock";

vi.mock("@/lib/api", () => ({ getFxMarkets: vi.fn() }));
import { getFxMarkets } from "@/lib/api";

const rows: WorldQuote[] = [
  { symbol: "VND=X", name: "USD/VND", group: "Tiền tệ", price: 26330, prev_close: 26300, change: 30, change_pct: 0.11, currency: "VND" },
  { symbol: "EURUSD=X", name: "EUR/USD", group: "Tiền tệ", price: 1.1388, prev_close: 1.14, change: -0.0012, change_pct: -0.11, currency: "USD" },
];

describe("FxPanel", () => {
  beforeEach(() => vi.mocked(getFxMarkets).mockReset());

  it("adapts precision by magnitude (VND integer, EUR 4dp)", async () => {
    vi.mocked(getFxMarkets).mockResolvedValue(rows);
    render(<FxPanel />);
    await waitFor(() => expect(screen.getByText("USD/VND")).toBeInTheDocument());
    expect(screen.getByText("26,330")).toBeInTheDocument(); // >=100 → 0 dp
    expect(screen.getByText("1.1388")).toBeInTheDocument(); // <100 → 4 dp
  });
});
