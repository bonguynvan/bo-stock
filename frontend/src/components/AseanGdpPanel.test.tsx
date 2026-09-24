import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import AseanGdpPanel from "@/components/AseanGdpPanel";
import type { AseanPoint } from "@/types/stock";

vi.mock("@/lib/api", () => ({ getAseanGdp: vi.fn() }));
import { getAseanGdp } from "@/lib/api";

const rows: AseanPoint[] = [
  { country: "VNM", name: "Việt Nam", value: 8.0, date: "2025" },
  { country: "MYS", name: "Malaysia", value: 5.2, date: "2025" },
  { country: "SGP", name: "Singapore", value: null, date: null },
];

describe("AseanGdpPanel", () => {
  beforeEach(() => vi.mocked(getAseanGdp).mockReset());

  it("renders each country with its GDP value (— for missing)", async () => {
    vi.mocked(getAseanGdp).mockResolvedValue(rows);
    render(<AseanGdpPanel />);
    await waitFor(() => expect(screen.getByText("Việt Nam")).toBeInTheDocument());
    expect(screen.getByText("Malaysia")).toBeInTheDocument();
    expect(screen.getByText("8.0")).toBeInTheDocument();
    expect(screen.getByText("5.2")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument(); // Singapore null
  });

  it("shows an empty state when there is no data", async () => {
    vi.mocked(getAseanGdp).mockResolvedValue([]);
    render(<AseanGdpPanel />);
    await waitFor(() => expect(screen.getByText("Chưa có dữ liệu.")).toBeInTheDocument());
  });
});
