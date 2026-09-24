import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SectorHeatmapPanel from "@/components/SectorHeatmapPanel";
import type { SectorsOverview } from "@/types/stock";

vi.mock("@/lib/api", () => ({ getSectorsOverview: vi.fn() }));
import { getSectorsOverview } from "@/lib/api";

const overview: SectorsOverview = {
  count: 2,
  change_available: true,
  sectors: [
    { industry: "Ngân hàng", count: 18, total_market_cap: 900000, median_pe: 9, median_pb: 1.5, median_roe: 18, median_net_margin: 25, avg_change_pct: 1.2 },
    { industry: "Bất động sản", count: 40, total_market_cap: 300000, median_pe: 15, median_pb: 1.1, median_roe: 8, median_net_margin: 12, avg_change_pct: -0.8 },
  ] as SectorsOverview["sectors"],
};

describe("SectorHeatmapPanel", () => {
  beforeEach(() => vi.mocked(getSectorsOverview).mockReset());

  it("self-fetches and renders a tile per sector with day change", async () => {
    vi.mocked(getSectorsOverview).mockResolvedValue(overview);
    render(<SectorHeatmapPanel />);
    await waitFor(() => expect(screen.getByText("Ngân hàng")).toBeInTheDocument());
    expect(screen.getByText("Bất động sản")).toBeInTheDocument();
    expect(screen.getByText("+1.20%")).toBeInTheDocument();
    expect(screen.getByText("-0.80%")).toBeInTheDocument();
  });

  it("uses supplied data (no fetch) and fires onSelectSector", async () => {
    const user = userEvent.setup();
    const onSelectSector = vi.fn();
    render(<SectorHeatmapPanel data={overview} onSelectSector={onSelectSector} />);
    // Data provided → no API call.
    expect(getSectorsOverview).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Ngân hàng/ }));
    expect(onSelectSector).toHaveBeenCalledWith("Ngân hàng");
  });

  it("notes when change data is unavailable", async () => {
    vi.mocked(getSectorsOverview).mockResolvedValue({ ...overview, change_available: false });
    render(<SectorHeatmapPanel />);
    await waitFor(() =>
      expect(screen.getByText(/cần sync giá ngày/i)).toBeInTheDocument(),
    );
  });
});
