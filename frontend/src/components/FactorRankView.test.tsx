import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FactorRankView from "@/components/FactorRankView";
import type { FactorRow } from "@/types/stock";

vi.mock("@/lib/api", () => ({ getFactorRanking: vi.fn() }));
import { getFactorRanking } from "@/lib/api";

const rows: FactorRow[] = [
  { symbol: "AAA", company_name: "AAA", industry: "X", value: 90, quality: 80, growth: 70, composite: 80 },
  { symbol: "BBB", company_name: "BBB", industry: "Y", value: 40, quality: 95, growth: 30, composite: 55 },
];

describe("FactorRankView", () => {
  beforeEach(() => vi.mocked(getFactorRanking).mockReset());

  it("renders the ranking sorted by composite by default", async () => {
    vi.mocked(getFactorRanking).mockResolvedValue(rows);
    render(<FactorRankView />);
    await waitFor(() => expect(screen.getByText("AAA")).toBeInTheDocument());
    expect(screen.getByText("BBB")).toBeInTheDocument();
    expect(screen.getByText(/không phải khuyến nghị/)).toBeInTheDocument();
  });

  it("re-sorts when a factor column header is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(getFactorRanking).mockResolvedValue(rows);
    render(<FactorRankView />);
    await waitFor(() => expect(screen.getByText("AAA")).toBeInTheDocument());
    // Sort by Quality → BBB (95) should now be first data row.
    await user.click(screen.getByText("Chất lượng"));
    const bodyRows = screen.getAllByRole("row").slice(1); // skip header
    expect(bodyRows[0]).toHaveTextContent("BBB");
  });
});
