import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import WorldBankPanel from "@/components/WorldBankPanel";
import type { WbPoint } from "@/types/stock";

vi.mock("@/lib/api", () => ({ getWorldBank: vi.fn() }));
import { getWorldBank } from "@/lib/api";

const points: WbPoint[] = [
  { indicator: "NY.GDP.MKTP.KD.ZG", name: "Tăng trưởng GDP", unit: "%", value: 8.02, date: "2025" },
  { indicator: "FP.CPI.TOTL.ZG", name: "Lạm phát (CPI)", unit: "%", value: 3.31, date: "2025" },
];

describe("WorldBankPanel", () => {
  beforeEach(() => vi.mocked(getWorldBank).mockReset());

  it("renders Vietnam indicators with value + year", async () => {
    vi.mocked(getWorldBank).mockResolvedValue(points);
    render(<WorldBankPanel />);
    await waitFor(() => expect(screen.getByText("Tăng trưởng GDP")).toBeInTheDocument());
    expect(screen.getByText("Lạm phát (CPI)")).toBeInTheDocument();
    expect(screen.getAllByText("2025").length).toBeGreaterThan(0);
  });

  it("shows an empty state when there is no data", async () => {
    vi.mocked(getWorldBank).mockResolvedValue([]);
    render(<WorldBankPanel />);
    await waitFor(() => expect(screen.getByText("Chưa có dữ liệu.")).toBeInTheDocument());
  });
});
