import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import AnalysisDetails from "@/components/AnalysisDetails";
import type { AnalysisResult } from "@/types/stock";

const base: AnalysisResult = {
  key_figures: [],
  summary: "",
  yoy_changes: [],
  risk_flags: [],
};

describe("AnalysisDetails", () => {
  it("renders ratios, capital structure, cashflow and notes", () => {
    const analysis: AnalysisResult = {
      ...base,
      ratios: [{ label: "ROE", value: "36.8%", benchmark: "cần so sánh ngành" }],
      capital_structure: [{ label: "Vốn góp", value: 100, pct: 92 }],
      cashflow: {
        operating: { net: 20.38, items: [{ label: "Khấu hao", value: 3.1 }] },
        investing: { net: -19.38, items: [] },
        financing: { net: null, items: [] },
      },
      notes: ["Tranh chấp lô thép 2008"],
    };
    render(<AnalysisDetails analysis={analysis} />);
    expect(screen.getByText("Chỉ số tài chính")).toBeInTheDocument();
    expect(screen.getByText("cần so sánh ngành")).toBeInTheDocument();
    expect(screen.getByText("Cơ cấu nguồn vốn")).toBeInTheDocument();
    expect(screen.getByText("Dòng tiền chi tiết")).toBeInTheDocument();
    expect(screen.getByText("Khấu hao")).toBeInTheDocument();
    expect(screen.getByText("Tranh chấp lô thép 2008")).toBeInTheDocument();
  });

  it("shows the 'no data' note for revenue breakdown when empty", () => {
    const analysis: AnalysisResult = {
      ...base,
      revenue_breakdown: { items: [], note: "không có dữ liệu" },
    };
    render(<AnalysisDetails analysis={analysis} />);
    expect(screen.getByText("Cơ cấu doanh thu")).toBeInTheDocument();
    expect(screen.getByText("không có dữ liệu")).toBeInTheDocument();
  });

  it("renders nothing extra for a bare analysis", () => {
    const { container } = render(<AnalysisDetails analysis={base} />);
    expect(container).toBeEmptyDOMElement();
  });
});
