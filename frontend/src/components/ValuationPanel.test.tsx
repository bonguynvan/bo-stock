import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ValuationPanel from "@/components/ValuationPanel";
import type { DcfResult, Valuation } from "@/types/stock";

vi.mock("@/lib/api", () => ({
  getValuation: vi.fn(),
  getDcf: vi.fn(),
  getSectorValuation: vi.fn(),
}));

import { getDcf, getSectorValuation, getValuation } from "@/lib/api";

const valuation: Valuation = {
  current_price: 6800,
  shares_outstanding: 10_000_000,
  methods: {
    pe_eps_avg: { value: 5101, note: "P/E hiện tại 2 × EPS TB 3404đ × 0.75." },
    pb_bvps_avg: { value: 4161, note: "P/B hiện tại 0.7 × BVPS TB 7541đ × 0.75." },
    graham: { value: null, note: "EPS ≤ 0 — không áp dụng được Graham." },
  },
  valuation_range: { low: 4161, high: 5101, median: 4631 },
  vs_current_price: { discount_pct: -31.9, interpretation: "Giá thị trường đang CAO hơn vùng giá trị ước tính khoảng 32%." },
  earnings_quality: {
    outliers_detected: [{ year: "2025", reasons: ["Thu nhập khác > 30% lợi nhuận"] }],
    fallback_used: true,
    note: "Không đủ dữ liệu sạch sau khi loại kỳ bất thường.",
    periods_used: ["2024", "2025"],
  },
};

const dcfResult: DcfResult = {
  dcf_value: 22761,
  assumptions_used: {
    growth_pct: 5, discount_pct: 13, years: 5, terminal_growth_pct: 3,
    base_operating_cashflow_billion: 20.38,
  },
  sensitivity_note: "DCF dùng dòng tiền HĐKD thực.",
};

beforeEach(() => {
  vi.mocked(getValuation).mockResolvedValue(valuation);
  vi.mocked(getDcf).mockResolvedValue(dcfResult);
  // The sector card self-fetches; default to "no sector data" so it renders nothing.
  vi.mocked(getSectorValuation).mockRejectedValue(new Error("no peers"));
});

afterEach(() => vi.clearAllMocks());

describe("ValuationPanel", () => {
  it("renders methods, the earnings-quality warning and the disclaimer", async () => {
    render(<ValuationPanel symbol="SPH" />);
    expect(await screen.findByText(/P\/E × EPS/)).toBeInTheDocument();
    expect(screen.getByText(/không phải khuyến nghị đầu tư/)).toBeInTheDocument();
    // outlier warning + fallback note
    expect(screen.getByText(/Chất lượng lợi nhuận/)).toBeInTheDocument();
    expect(screen.getByText(/Không đủ dữ liệu sạch/)).toBeInTheDocument();
    // a method that could not be computed shows its reason, not a fake number
    expect(screen.getByText("EPS ≤ 0 — không áp dụng được Graham.")).toBeInTheDocument();
  });

  it("shows the interpretation vs current price (no buy/sell wording)", async () => {
    render(<ValuationPanel symbol="SPH" />);
    expect(await screen.findByText(/CAO hơn vùng giá trị ước tính/)).toBeInTheDocument();
    expect(screen.queryByText(/MUA|BÁN/)).not.toBeInTheDocument();
  });

  it("runs DCF on demand and shows the result", async () => {
    const user = userEvent.setup();
    render(<ValuationPanel symbol="SPH" />);
    await screen.findByText(/P\/E × EPS/);
    await user.click(screen.getByText("Tính DCF"));
    await waitFor(() => expect(getDcf).toHaveBeenCalled());
    expect(await screen.findByText(/22\.761đ|22,761đ/)).toBeInTheDocument();
  });

  it("shows an error state when valuation is unavailable", async () => {
    vi.mocked(getValuation).mockRejectedValue(new Error("Chưa có phân tích BCTC cho mã này."));
    render(<ValuationPanel symbol="XYZ" />);
    expect(await screen.findByText(/Chưa có phân tích BCTC/)).toBeInTheDocument();
  });
});
