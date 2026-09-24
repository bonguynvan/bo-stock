import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PeerComparison from "@/components/PeerComparison";
import type { PeerComparison as PeerData } from "@/types/stock";

vi.mock("@/lib/api", () => ({ getPeers: vi.fn() }));
import { getPeers } from "@/lib/api";

const data: PeerData = {
  industry: "Công nghệ Thông tin",
  peer_count: 29,
  metrics: [
    { key: "roe", label: "ROE %", higher_is_better: true, value: 26.8, n: 29, median: 3.7, p25: 1, p75: 10, min: -7.6, max: 43.6, percentile: 93 },
    { key: "pe", label: "P/E", higher_is_better: false, value: 12.4, n: 29, median: 14.3, p25: 8, p75: 22, min: -313, max: 623, percentile: 41 },
  ],
};

beforeEach(() => vi.mocked(getPeers).mockResolvedValue(data));
afterEach(() => vi.clearAllMocks());

describe("PeerComparison", () => {
  it("renders the industry header and neutral rank captions per metric", async () => {
    render(<PeerComparison symbol="FPT" />);
    expect(await screen.findByText(/Công nghệ Thông tin · 29 công ty/)).toBeInTheDocument();
    // higher-is-better → "Cao hơn 93%"; lower-is-better PE (pct 41) → "Thấp hơn 59%"
    expect(screen.getByText("Cao hơn 93% công ty cùng ngành")).toBeInTheDocument();
    expect(screen.getByText("Thấp hơn 59% công ty cùng ngành")).toBeInTheDocument();
    // no buy/sell wording
    expect(screen.queryByText(/MUA|BÁN/)).not.toBeInTheDocument();
  });

});
