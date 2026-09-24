import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConvictionCard from "@/components/ConvictionCard";
import type { ConvictionProfile, NewsSignals } from "@/types/stock";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, getConviction: vi.fn(), postNewsSignals: vi.fn() };
});

import { getConviction, postNewsSignals } from "@/lib/api";

const profile: ConvictionProfile = {
  symbol: "ABC",
  overall: "elevated_risk",
  overall_text: "2 trục rủi ro cần lưu ý — xem các cảnh báo bên dưới.",
  pillars: [
    { key: "earnings_quality", label: "Chất lượng lợi nhuận", status: "risk", headline: "Lợi nhuận dựa nhiều vào bút toán dồn tích (18/100)" },
    { key: "manipulation", label: "Rủi ro thao túng", status: "risk", headline: "Dấu hiệu thao túng lợi nhuận cao (Beneish)" },
    { key: "financial_health", label: "Sức khỏe tài chính", status: "neutral", headline: "Z'' vùng xám · Piotroski 3/9" },
    { key: "valuation", label: "Định giá vs ngành", status: "risk", headline: "Đắt hơn mặt bằng ngành ~40% (rủi ro định giá)" },
  ],
  flag_counts: { good: 0, neutral: 1, risk: 3, unknown: 0 },
  cross_signals: ["Chất lượng lợi nhuận yếu TRÙNG với rủi ro thao túng cao (Beneish) — cần soi kỹ dòng tiền."],
  flow_signals: [
    { key: "insider", label: "Nội bộ (6 tháng)", direction: "sell", text: "Nội bộ bán ròng 1.50M cp" },
    { key: "foreign", label: "Khối ngoại", direction: "sell", text: "Khối ngoại bán ròng 8.0 tỷ (phiên gần nhất)" },
  ],
  sources: { forensic: true, sector_valuation: true },
  disclaimer: "Hồ sơ tổng hợp từ các mô hình SÀNG LỌC định lượng — KHÔNG phải khuyến nghị.",
};

afterEach(() => vi.clearAllMocks());

describe("ConvictionCard", () => {
  it("renders pillars, the corroboration signal and no buy/sell wording", async () => {
    vi.mocked(getConviction).mockResolvedValue(profile);
    render(<ConvictionCard symbol="ABC" />);
    expect(await screen.findByText("Hồ sơ tin cậy tài chính")).toBeInTheDocument();
    expect(screen.getByText("Rủi ro cần lưu ý")).toBeInTheDocument();
    expect(screen.getByText(/TRÙNG với rủi ro thao túng/)).toBeInTheDocument();
    expect(screen.getByText("Tín hiệu đồng thuận")).toBeInTheDocument();
    // Organizational-flow corroboration block (descriptive net direction, not advice).
    expect(screen.getByText("Dòng tiền tổ chức")).toBeInTheDocument();
    expect(screen.getByText(/Nội bộ bán ròng 1[.,]50M cp/)).toBeInTheDocument();
    expect(screen.queryByText(/MUA|BÁN/)).not.toBeInTheDocument();
  });

  it("renders nothing when there is no profile", async () => {
    vi.mocked(getConviction).mockResolvedValue(null);
    const { container } = render(<ConvictionCard symbol="XYZ" />);
    await waitFor(() => expect(getConviction).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("runs the on-demand news pulse and corroborates negative news with the risk", async () => {
    vi.mocked(getConviction).mockResolvedValue(profile); // overall = elevated_risk
    const news: NewsSignals = {
      available: true, symbol: "ABC", analyzed_count: 6,
      signals: [],
      summary: { net_sentiment: "negative", dominant_events: ["insider_shareholder"], note: "chưa kiểm chứng" },
    };
    vi.mocked(postNewsSignals).mockResolvedValue(news);
    const user = userEvent.setup();
    render(<ConvictionCard symbol="ABC" />);
    await screen.findByText("Hồ sơ tin cậy tài chính");
    // AI runs only on the explicit click
    expect(postNewsSignals).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Phân tích tin/ }));
    await waitFor(() => expect(postNewsSignals).toHaveBeenCalledWith("ABC"));
    expect(await screen.findByText("Tiêu cực")).toBeInTheDocument();
    expect(screen.getByText(/củng cố cảnh báo rủi ro/)).toBeInTheDocument();
  });
});
