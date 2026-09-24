import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import GlobalMarketsView from "@/components/GlobalMarketsView";
import type { Connector } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getConnectors: vi.fn(),
  getWorldMarkets: vi.fn().mockResolvedValue([]),
  getCryptoMarkets: vi.fn().mockResolvedValue([]),
  getFxMarkets: vi.fn().mockResolvedValue([]),
  getWorldBank: vi.fn().mockResolvedValue([]),
  getCommodities: vi.fn().mockResolvedValue([]),
  getAseanGdp: vi.fn().mockResolvedValue([]),
  getDbnomics: vi.fn().mockResolvedValue([]),
  getMacro: vi.fn().mockResolvedValue({ points: [], configured: false, note: "x" }),
}));

import { getConnectors } from "@/lib/api";

const connectors: Connector[] = [
  { key: "world", label: "Thị trường thế giới", source: "Yahoo Finance", domain: "d", requires_key: false, configured: true },
  { key: "macro", label: "Vĩ mô", source: "FRED", domain: "d", requires_key: true, configured: false },
];

describe("GlobalMarketsView", () => {
  beforeEach(() => vi.mocked(getConnectors).mockReset());

  it("renders the connector strip and the world tab panels by default", async () => {
    vi.mocked(getConnectors).mockResolvedValue(connectors);
    render(<GlobalMarketsView />);
    await waitFor(() => expect(screen.getByText("Yahoo Finance")).toBeInTheDocument());
    // Unconfigured, key-required connector is flagged.
    expect(screen.getByText("FRED")).toBeInTheDocument();
    expect(screen.getByText("cần key")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Vĩ mô & Thế giới/ })).toBeInTheDocument();
    // World tab is active first.
    expect(screen.getByText("Chỉ số / Hàng hóa")).toBeInTheDocument();
    expect(screen.getByText("Crypto")).toBeInTheDocument();
  });

  it("switches to the macro tab to show VN/ASEAN macro panels (folds in old Kinh tế)", async () => {
    vi.mocked(getConnectors).mockResolvedValue(connectors);
    render(<GlobalMarketsView />);
    fireEvent.click(screen.getByRole("tab", { name: /Vĩ mô/ }));
    expect(screen.getByText("Vĩ mô Việt Nam · World Bank")).toBeInTheDocument();
    expect(screen.getByText("So sánh ASEAN · GDP")).toBeInTheDocument();
    expect(screen.getByText("Vĩ mô toàn cầu · FRED")).toBeInTheDocument();
  });
});
