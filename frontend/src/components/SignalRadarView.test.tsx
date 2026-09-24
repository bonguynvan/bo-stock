import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SignalRadarView from "@/components/SignalRadarView";
import type { RadarItem, RadarResult } from "@/types/stock";

vi.mock("@/lib/api", () => ({ getRadar: vi.fn(), getRadarFlow: vi.fn() }));

import { getRadar, getRadarFlow } from "@/lib/api";

const result = (items: RadarItem[], scanned = 1200, total = 1745): RadarResult => ({
  items,
  coverage: { scanned, total },
});

const rows: RadarItem[] = [
  {
    symbol: "AAA", company_name: "AAA Corp", industry: "Thép", market_cap: 5000,
    conviction_overall: "elevated_risk", earnings_quality_flag: "weak",
    earnings_quality_score: 15, beneish_flag: "high_risk", altman_em_zone: "distress",
    period: "2024", news_count: 2, foreign_net: -12.5, prop_net: 5.3,
    valuation_flag: "rich", valuation_premium_pct: 42,
    latest_news: { title: "AAA bị thanh tra thuế", link: "https://x/1", published: "2026-07-31T08:00:00+07:00", source: "CafeF" },
  },
];

afterEach(() => vi.clearAllMocks());
// The flow overlays load as a second pass; default it to empty so the base rows stand.
beforeEach(() => vi.mocked(getRadarFlow).mockResolvedValue({}));

describe("SignalRadarView", () => {
  it("lists flagged stocks with their profile and latest news", async () => {
    vi.mocked(getRadar).mockResolvedValue(result(rows));
    render(<SignalRadarView />);
    expect(await screen.findByText("AAA")).toBeInTheDocument();
    expect(screen.getByText("Rủi ro")).toBeInTheDocument(); // conviction badge
    const link = screen.getByText("AAA bị thanh tra thuế");
    expect(link).toHaveAttribute("href", "https://x/1");
    expect(screen.getByText(/−12[.,]5/)).toBeInTheDocument(); // foreign net (bán ròng)
    expect(screen.getByText(/\+5[.,]3/)).toBeInTheDocument(); // prop-desk net (mua ròng)
    expect(screen.getByText("Đắt")).toBeInTheDocument(); // valuation vs sector (rich)
    expect(screen.getByText(/Độ phủ quét/)).toBeInTheDocument(); // scan-coverage honesty line
    expect(screen.queryByText(/MUA|BÁN/)).not.toBeInTheDocument();
  });

  it("opens the symbol on row click", async () => {
    vi.mocked(getRadar).mockResolvedValue(result(rows));
    const onOpenSymbol = vi.fn();
    render(<SignalRadarView onOpenSymbol={onOpenSymbol} />);
    fireEvent.click(await screen.findByText("AAA"));
    expect(onOpenSymbol).toHaveBeenCalledWith("AAA");
  });

  it("shows an empty hint when nothing is flagged", async () => {
    vi.mocked(getRadar).mockResolvedValue(result([]));
    render(<SignalRadarView />);
    expect(await screen.findByText(/Chưa có mã nào bị gắn cờ/)).toBeInTheDocument();
  });
});
