import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import DbnomicsPanel from "@/components/DbnomicsPanel";
import type { DbnPoint } from "@/types/stock";

vi.mock("@/lib/api", () => ({ getDbnomics: vi.fn() }));
import { getDbnomics } from "@/lib/api";

const points: DbnPoint[] = [
  { code: "VNM.NGDP_RPCH.pcent_change", name: "Tăng trưởng GDP (IMF)", unit: "%", value: 4.05, period: "2026" },
  { code: "VNM.GGXWDG_NGDP.pcent_gdp", name: "Nợ công / GDP", unit: "%", value: 34.2, period: "2026" },
];

describe("DbnomicsPanel", () => {
  beforeEach(() => vi.mocked(getDbnomics).mockReset());

  it("renders IMF WEO series with value + year", async () => {
    vi.mocked(getDbnomics).mockResolvedValue(points);
    render(<DbnomicsPanel />);
    await waitFor(() => expect(screen.getByText("Tăng trưởng GDP (IMF)")).toBeInTheDocument());
    expect(screen.getByText("Nợ công / GDP")).toBeInTheDocument();
    expect(screen.getAllByText("2026").length).toBeGreaterThan(0);
  });

  it("shows an empty state when there is no data", async () => {
    vi.mocked(getDbnomics).mockResolvedValue([]);
    render(<DbnomicsPanel />);
    await waitFor(() => expect(screen.getByText("Chưa có dữ liệu.")).toBeInTheDocument());
  });
});
