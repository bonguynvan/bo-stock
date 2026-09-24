import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import CommoditiesPanel from "@/components/CommoditiesPanel";
import type { WorldQuote } from "@/types/stock";

vi.mock("@/lib/api", () => ({ getCommodities: vi.fn() }));
import { getCommodities } from "@/lib/api";

const rows: WorldQuote[] = [
  { symbol: "GC=F", name: "Vàng (Gold)", group: "Hàng hóa", price: 4074, prev_close: 4050, change: 24, change_pct: 0.6, currency: "USD" },
  { symbol: "HG=F", name: "Đồng (Copper)", group: "Hàng hóa", price: 6.3, prev_close: 6.4, change: -0.1, change_pct: -1.56, currency: "USD" },
];

describe("CommoditiesPanel", () => {
  beforeEach(() => vi.mocked(getCommodities).mockReset());

  it("renders commodities with magnitude-adaptive prices", async () => {
    vi.mocked(getCommodities).mockResolvedValue(rows);
    render(<CommoditiesPanel />);
    await waitFor(() => expect(screen.getByText("Vàng (Gold)")).toBeInTheDocument());
    expect(screen.getByText("4,074")).toBeInTheDocument(); // >=1000 → 0 dp
    expect(screen.getByText("6.30")).toBeInTheDocument(); // <1000 → 2 dp
    expect(screen.getByText("+0.60%")).toBeInTheDocument();
  });
});
