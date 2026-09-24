import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import LensesPanel from "@/components/LensesPanel";
import type { InvestmentLens } from "@/types/stock";

vi.mock("@/lib/api", () => ({ getLenses: vi.fn() }));
import { getLenses } from "@/lib/api";

const lenses: InvestmentLens[] = [
  {
    key: "graham",
    name: "Graham · Giá trị",
    description: "Định giá thấp…",
    met: 2,
    total: 3,
    criteria: [
      { label: "P/E ≤ 15", status: "pass", detail: 10 },
      { label: "P/B ≤ 1.5", status: "fail", detail: 3.1 },
      { label: "Nợ/VCSH ≤ 1", status: "pass", detail: 0.4 },
      { label: "Có trả cổ tức (> 0%)", status: "na", detail: null },
    ],
  },
];

describe("LensesPanel", () => {
  beforeEach(() => vi.mocked(getLenses).mockReset());

  it("renders each lens with its met/total and criteria", async () => {
    vi.mocked(getLenses).mockResolvedValue(lenses);
    render(<LensesPanel symbol="FPT" />);
    await waitFor(() => expect(screen.getByText("Graham · Giá trị")).toBeInTheDocument());
    expect(screen.getByText("2/3")).toBeInTheDocument();
    expect(screen.getByText("P/E ≤ 15")).toBeInTheDocument();
    expect(screen.getByText(/không phải khuyến nghị/)).toBeInTheDocument();
  });

  it("shows an empty note when there are no metrics", async () => {
    vi.mocked(getLenses).mockResolvedValue([]);
    render(<LensesPanel symbol="FPT" />);
    await waitFor(() => expect(screen.getByText("Chưa có dữ liệu chỉ số.")).toBeInTheDocument());
  });
});
