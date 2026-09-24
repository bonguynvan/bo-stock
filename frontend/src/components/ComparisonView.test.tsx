import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ComparisonView from "@/components/ComparisonView";
import type { StockResult } from "@/types/stock";

vi.mock("@/lib/api", () => ({ getCompare: vi.fn(), downloadCompareReport: vi.fn() }));
import { getCompare } from "@/lib/api";

const results = [
  { symbol: "FPT", company_name: "CTCP FPT", roe: 27, pe: 12, close_price: 70000 },
  { symbol: "VCB", company_name: "Vietcombank", roe: 18, pe: 9, close_price: 60000 },
] as unknown as StockResult[];

describe("ComparisonView", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(getCompare).mockReset().mockResolvedValue(results);
  });

  it("prompts to add symbols when empty", () => {
    render(<ComparisonView />);
    expect(screen.getByText(/Thêm ít nhất 2 mã/)).toBeInTheDocument();
  });

  it("adds symbols, fetches, and highlights best/worst per metric", async () => {
    const user = userEvent.setup();
    render(<ComparisonView />);
    const input = screen.getByLabelText("Thêm mã so sánh");
    await user.type(input, "fpt, vcb");
    await user.click(screen.getByRole("button", { name: "Thêm" }));

    await waitFor(() => expect(getCompare).toHaveBeenCalledWith(["FPT", "VCB"]));
    // Both columns present.
    await waitFor(() => expect(screen.getByText("CTCP FPT")).toBeInTheDocument());

    // ROE 27 (FPT) is the best → green highlight class on that cell.
    const roeBest = screen.getByText("27.0");
    expect(roeBest.className).toContain("text-secondary");
    // P/E 9 (VCB) is best (lower better) → green.
    const peBest = screen.getByText("9.0");
    expect(peBest.className).toContain("text-secondary");
  });

  it("persists symbols to localStorage", async () => {
    const user = userEvent.setup();
    render(<ComparisonView />);
    await user.type(screen.getByLabelText("Thêm mã so sánh"), "FPT");
    await user.click(screen.getByRole("button", { name: "Thêm" }));
    await waitFor(() =>
      expect(window.localStorage.getItem("vios.compareSymbols")).toContain("FPT"),
    );
  });
});
