import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CompassPanel from "@/components/CompassPanel";
import type { Compass } from "@/types/stock";

vi.mock("@/lib/api", () => ({ getCompass: vi.fn() }));
import { getCompass } from "@/lib/api";

const compass: Compass = {
  disclaimer: "Điểm số tham khảo dựa trên dữ liệu lịch sử và công thức cố định, không phải khuyến nghị đầu tư. Quyết định cuối cùng là của bạn.",
  short_term: {
    score: 53.5,
    breakdown: { technical: 58.8, valuation_relative: 25, catalyst: 75 },
    explanation: ["Giá dưới MA50 -30.3%", "RSI 38 (vùng trung tính 30-70)"],
  },
  mid_term: {
    score: 25,
    breakdown: { growth_consistency: null, valuation_fair: 25 },
    explanation: ["Không đủ kỳ sạch để đánh giá tăng trưởng liên tục."],
  },
  long_term: {
    score: 45,
    breakdown: { financial_quality: 45, roe_quality: 70, dividend_consistency: null },
    explanation: ["Lợi nhuận lũy kế ÂM (-15.97 tỷ) — rủi ro chất lượng tài chính."],
  },
  roe_history: {
    available: true,
    series: [
      { year: 2022, roe: 21.7 },
      { year: 2023, roe: 24.1 },
      { year: 2024, roe: 22.9 },
    ],
    years: [2022, 2023, 2024],
    latest: 22.9,
    avg_prior: 22.9,
    avg_recent: 22.9,
    trend: "stable",
    is_spike: false,
    spike_factor: null,
    positive_years: 3,
    n: 3,
    level_score: 91.6,
    consistency_score: 88,
    quality_score: 80,
  },
  dividend_history: {
    available: true,
    series: [
      { year: 2022, dividend_yield: 2.1 },
      { year: 2023, dividend_yield: 1.3 },
      { year: 2024, dividend_yield: 2.9 },
    ],
    years: [2022, 2023, 2024],
    n: 3,
    years_paid: 3,
    pay_ratio: 1,
    recent_streak: 3,
    avg_yield: 2.1,
    avg_paid_yield: 2.1,
    score: 88,
  },
  data_gaps: ["Thiếu dữ liệu cổ tức lịch sử"],
};

beforeEach(() => vi.mocked(getCompass).mockResolvedValue(compass));
afterEach(() => vi.clearAllMocks());

describe("CompassPanel", () => {
  it("shows the disclaimer and three horizon scores (no buy/sell labels)", async () => {
    render(<CompassPanel symbol="SPH" />);
    expect(await screen.findByText(/không phải khuyến nghị đầu tư/)).toBeInTheDocument();
    expect(screen.getByText("Ngắn hạn")).toBeInTheDocument();
    expect(screen.getByText("Trung hạn")).toBeInTheDocument();
    expect(screen.getByText("Dài hạn")).toBeInTheDocument();
    expect(screen.getByText("45")).toBeInTheDocument(); // long-term score
    expect(screen.queryByText(/MUA|BÁN|GIỮ/)).not.toBeInTheDocument();
  });

  it("expands a card to reveal the breakdown and explanation", async () => {
    const user = userEvent.setup();
    render(<CompassPanel symbol="SPH" />);
    await screen.findByText("Dài hạn");
    // explanation hidden until expanded
    expect(screen.queryByText(/Lợi nhuận lũy kế ÂM/)).not.toBeInTheDocument();
    await user.click(screen.getByText("Dài hạn"));
    expect(screen.getByText(/Lợi nhuận lũy kế ÂM/)).toBeInTheDocument();
    expect(screen.getByText("Chất lượng tài chính")).toBeInTheDocument();
  });

  it("lists data gaps", async () => {
    render(<CompassPanel symbol="SPH" />);
    expect(await screen.findByText(/Thiếu dữ liệu cổ tức lịch sử/)).toBeInTheDocument();
  });

  it("renders the real ROE history chart when present", async () => {
    render(<CompassPanel symbol="SPH" />);
    expect(await screen.findByText("ROE 3 năm")).toBeInTheDocument();
    expect(screen.getByLabelText(/Lịch sử ROE 3 năm/)).toBeInTheDocument();
  });

  it("renders the dividend history chart when present", async () => {
    render(<CompassPanel symbol="SPH" />);
    expect(await screen.findByText("Cổ tức 3 năm")).toBeInTheDocument();
    expect(screen.getByText(/Trả 3\/3 năm/)).toBeInTheDocument();
  });
});
