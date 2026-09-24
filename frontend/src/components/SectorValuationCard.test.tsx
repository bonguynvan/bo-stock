import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import SectorValuationCard from "@/components/SectorValuationCard";
import type { SectorValuation } from "@/types/stock";

vi.mock("@/lib/api", () => ({ getSectorValuation: vi.fn() }));

import { getSectorValuation } from "@/lib/api";

const sector: SectorValuation = {
  industry: "Bán lẻ",
  peer_count: 8,
  current_price: 100000,
  methods: {
    pe_relative: {
      value: 50000, own_multiple: 20, sector_multiple: 10, premium_pct: 100,
      note: "P/E của mã 20.0 so với trung vị ngành 10.0 (cao hơn 100%).",
    },
    pb_relative: {
      value: 67000, own_multiple: 3, sector_multiple: 2, premium_pct: 50,
      note: "P/B của mã 3.0 so với trung vị ngành 2.0 (cao hơn 50%).",
    },
  },
  valuation_range: { low: 50000, high: 67000, median: 58500 },
  vs_current_price: { discount_pct: -41.5, interpretation: "Giá thị trường đang CAO hơn vùng giá trị ước tính khoảng 42%." },
  relative_position: "Đang được định giá CAO hơn mặt bằng ngành khoảng 75%.",
  avg_premium_pct: 75,
  notes: [],
};

afterEach(() => vi.clearAllMocks());

describe("SectorValuationCard", () => {
  it("shows the relative position, premiums and sector-implied range", async () => {
    vi.mocked(getSectorValuation).mockResolvedValue(sector);
    render(<SectorValuationCard symbol="MWG" />);
    expect(await screen.findByText(/CAO hơn mặt bằng ngành/)).toBeInTheDocument();
    expect(screen.getByText(/Định giá theo ngành · Bán lẻ/)).toBeInTheDocument();
    expect(screen.getByText(/58\.500đ|58,500đ/)).toBeInTheDocument(); // sector median
    expect(screen.queryByText(/MUA|BÁN/)).not.toBeInTheDocument();
  });

  it("renders nothing when there is no sector data", async () => {
    vi.mocked(getSectorValuation).mockRejectedValue(new Error("no peers"));
    const { container } = render(<SectorValuationCard symbol="XYZ" />);
    await waitFor(() => expect(getSectorValuation).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
