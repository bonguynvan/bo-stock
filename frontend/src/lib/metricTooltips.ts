// Static tooltip content for screener metrics. Edit here to refine wording.
// Industry-context benchmarks come later — keep these as rough, general guides.

export interface MetricTooltip {
  label: string;
  definition: string; // 1-line, plain Vietnamese
  formula?: string; // short formula
  benchmark: string; // rough, non-industry-specific guide
  caveat?: string; // amber warning shown below the benchmark
}

export const METRIC_TOOLTIPS: Record<string, MetricTooltip> = {
  pe: {
    label: "P/E",
    definition: "Giá / Thu nhập mỗi cổ phiếu",
    formula: "Giá / EPS",
    benchmark: "< 15 thường được coi là rẻ, phụ thuộc ngành",
  },
  pb: {
    label: "P/B",
    definition: "Giá / Giá trị sổ sách mỗi cổ phiếu",
    formula: "Giá / (Vốn CSH / Số CP)",
    benchmark: "< 1.5 hấp dẫn; ngân hàng thường thấp hơn",
  },
  roe: {
    label: "ROE",
    definition: "Lợi nhuận / Vốn chủ sở hữu",
    formula: "LNST / Vốn CSH bình quân",
    benchmark: "> 15% là tốt, > 20% là xuất sắc",
  },
  roa: {
    label: "ROA",
    definition: "Lợi nhuận / Tổng tài sản",
    formula: "LNST / Tổng tài sản bình quân",
    benchmark: "> 7% là tốt, tùy ngành",
  },
  net_margin: {
    label: "NPM — Biên LN ròng",
    definition: "Phần lợi nhuận giữ lại trên mỗi đồng doanh thu",
    formula: "LNST / Doanh thu thuần",
    benchmark: "> 10% khá; tùy đặc thù ngành",
  },
  market_cap: {
    label: "Vốn hóa",
    definition: "Giá trị thị trường của toàn bộ cổ phiếu",
    formula: "Giá × Số CP lưu hành",
    benchmark: "Đơn vị: tỷ VND (B)",
  },
  close_price: {
    label: "Giá",
    definition: "Giá đóng cửa gần nhất",
    benchmark: "Đơn vị: VND",
  },
  change_pct: {
    label: "% Thay đổi",
    definition: "Thay đổi giá so với phiên trước",
    formula: "(Giá nay − Giá trước) / Giá trước",
    benchmark: "Xanh: tăng · Đỏ: giảm",
  },
  quant_score: {
    label: "Quant Score",
    definition: "Điểm tổng hợp 0–100 từ ROE, tăng trưởng lợi nhuận & chất lượng tài chính",
    formula: "Weighted composite: ROE consistency · earnings quality · financial health",
    benchmark: "A++ > 90 · A+ 80–90 · A 70–80 · B++ 60–70",
    caveat:
      "Điểm này CHƯA tính thanh khoản (khối lượng giao dịch). Mã UPCOM có Quant Score cao " +
      "nhưng volume thấp có thể khó mua/bán — luôn kiểm tra volume thực tế (TCBS) trước khi đặt lệnh.",
  },
  debt_equity: {
    label: "D/E — Nợ / Vốn CSH",
    definition: "Mức đòn bẩy tài chính",
    formula: "Tổng nợ / Vốn chủ sở hữu",
    benchmark: "< 1 an toàn; càng cao đòn bẩy càng lớn",
  },
  dividend_yield: {
    label: "Tỷ suất cổ tức",
    definition: "Cổ tức tiền mặt trên giá cổ phiếu",
    formula: "Cổ tức/CP / Giá",
    benchmark: "> 3% khá với người tìm thu nhập",
  },
};
