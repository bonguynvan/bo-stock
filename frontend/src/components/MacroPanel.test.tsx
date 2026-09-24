import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import MacroPanel from "@/components/MacroPanel";
import type { MacroPoint } from "@/types/stock";

vi.mock("@/lib/api", () => ({ getMacro: vi.fn() }));
import { getMacro } from "@/lib/api";

describe("MacroPanel", () => {
  beforeEach(() => vi.mocked(getMacro).mockReset());

  it("shows a setup note when FRED is not configured", async () => {
    vi.mocked(getMacro).mockResolvedValue({
      points: [],
      configured: false,
      note: "Cần FRED_API_KEY để bật dữ liệu vĩ mô.",
    });
    render(<MacroPanel />);
    await waitFor(() =>
      expect(screen.getByText("Cần FRED_API_KEY để bật dữ liệu vĩ mô.")).toBeInTheDocument(),
    );
    expect(screen.getByText("FRED_API_KEY")).toBeInTheDocument();
  });

  it("renders series values when configured", async () => {
    const points: MacroPoint[] = [
      { series_id: "DGS10", name: "Lợi suất TPCP Mỹ 10 năm", unit: "%", value: 4.25, date: "2026-07-01" },
    ];
    vi.mocked(getMacro).mockResolvedValue({ points, configured: true, note: null });
    render(<MacroPanel />);
    await waitFor(() =>
      expect(screen.getByText("Lợi suất TPCP Mỹ 10 năm")).toBeInTheDocument(),
    );
    expect(screen.getByText("2026-07-01")).toBeInTheDocument();
  });
});
