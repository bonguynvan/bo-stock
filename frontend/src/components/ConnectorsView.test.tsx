import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ConnectorsView from "@/components/ConnectorsView";
import type { Connector, ConnectorHealth } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getConnectors: vi.fn(),
  getConnectorsHealth: vi.fn(),
}));

import { getConnectors, getConnectorsHealth } from "@/lib/api";

const connectors: Connector[] = [
  { key: "world", label: "Thị trường thế giới", source: "Yahoo Finance", domain: "d", requires_key: false, configured: true },
  { key: "macro", label: "Vĩ mô toàn cầu", source: "FRED", domain: "d", requires_key: true, configured: false },
];

const health: ConnectorHealth[] = [
  { key: "world", label: "Yahoo", host: "query1.finance.yahoo.com", status: "ok", http_status: 200, latency_ms: 120, detail: "Phản hồi bình thường" },
  { key: "macro", label: "FRED", host: "api.stlouisfed.org", status: "not_configured", http_status: null, latency_ms: null, detail: "Cần FRED_API_KEY để bật" },
];

describe("ConnectorsView", () => {
  beforeEach(() => {
    vi.mocked(getConnectors).mockResolvedValue(connectors);
    vi.mocked(getConnectorsHealth).mockResolvedValue(health);
  });

  it("lists connectors with live status and latency", async () => {
    render(<ConnectorsView />);
    await waitFor(() => expect(screen.getByText("Thị trường thế giới")).toBeInTheDocument());
    expect(screen.getByText("Hoạt động")).toBeInTheDocument(); // world = ok
    expect(screen.getByText("120 ms")).toBeInTheDocument();
    expect(screen.getByText("Chưa cấu hình")).toBeInTheDocument(); // macro = not_configured
    expect(screen.getByText("Cần FRED_API_KEY để bật")).toBeInTheDocument();
  });
});
