import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import MarketsMonitorView from "@/components/MarketsMonitorView";
import type { MoversData } from "@/types/stock";

vi.mock("@/lib/api", () => ({
  getMovers: vi.fn(),
  getForeignFlow: vi.fn().mockResolvedValue({ available: false }),
  getRadar: vi.fn().mockResolvedValue({ items: [], coverage: null }),
}));
import { getMovers } from "@/lib/api";

const data: MoversData = {
  gainers: [{ symbol: "AAA", company_name: "AAA", close_price: 10, change_pct: 6.9, avg_volume_30d: 1_000_000 }],
  losers: [{ symbol: "BBB", company_name: "BBB", close_price: 8, change_pct: -5.2, avg_volume_30d: 500_000 }],
  most_active: [{ symbol: "AAA", company_name: "AAA", close_price: 10, change_pct: 6.9, avg_volume_30d: 1_000_000 }],
  breadth: { advancers: 120, decliners: 80, unchanged: 10, total: 210 },
  change_available: true,
};

describe("MarketsMonitorView", () => {
  beforeEach(() => vi.mocked(getMovers).mockReset());

  it("renders breadth counts and mover columns", async () => {
    vi.mocked(getMovers).mockResolvedValue(data);
    render(<MarketsMonitorView />);
    await waitFor(() => expect(screen.getByText("▲ 120 tăng")).toBeInTheDocument());
    expect(screen.getByText("80 giảm ▼")).toBeInTheDocument();
    expect(screen.getAllByText("AAA").length).toBeGreaterThan(0); // gainers + most-active
    expect(screen.getByText("+6.90%")).toBeInTheDocument();
    expect(screen.getByText("-5.20%")).toBeInTheDocument();
    expect(screen.getByText("1.0M")).toBeInTheDocument(); // volume column
  });

  it("degrades to a breadth note when no day-change data", async () => {
    vi.mocked(getMovers).mockResolvedValue({
      ...data,
      gainers: [], losers: [], most_active: [],
      breadth: { advancers: 0, decliners: 0, unchanged: 0, total: 0 },
      change_available: false,
    });
    render(<MarketsMonitorView />);
    await waitFor(() =>
      expect(screen.getAllByText(/cần đồng bộ giá ngày/i).length).toBeGreaterThan(0),
    );
  });

  it("switches to the folded Radar tab", async () => {
    vi.mocked(getMovers).mockResolvedValue(data);
    render(<MarketsMonitorView />);
    fireEvent.click(screen.getByRole("tab", { name: /Radar cờ/ }));
    // SignalRadarView renders its own header + empty hint when nothing is flagged.
    expect(await screen.findByText(/Radar tín hiệu/)).toBeInTheDocument();
  });
});
