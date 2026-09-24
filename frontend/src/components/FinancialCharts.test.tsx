import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import FinancialCharts from "@/components/FinancialCharts";
import type { AnalysisResult } from "@/types/stock";

// Stub recharts (ResponsiveContainer needs real layout; not available in jsdom).
// Explicit exports — a Proxy mock makes the module look thenable and hangs vitest.
vi.mock("recharts", () => {
  const Stub = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Stub,
    ComposedChart: Stub,
    BarChart: Stub,
    LineChart: Stub,
    PieChart: Stub,
    Bar: Stub,
    Line: Stub,
    Pie: Stub,
    Cell: Stub,
    XAxis: Stub,
    YAxis: Stub,
    CartesianGrid: Stub,
    Tooltip: Stub,
    Legend: Stub,
  };
});

const base: AnalysisResult = {
  key_figures: [],
  summary: "",
  yoy_changes: [],
  risk_flags: [],
};

describe("FinancialCharts", () => {
  it("renders chart cards for the data that exists", () => {
    const analysis: AnalysisResult = {
      ...base,
      multi_year_trend: {
        years: ["2024", "2025"],
        revenue: [48.4, 82.29],
        net_profit: [-28.14, 34.04],
        gross_margin_pct: [12, 45.8],
        net_margin_pct: [-58, 41.4],
        roe_pct: [],
        roa_pct: [],
        total_debt: [42.2, 15.05],
        equity: [58.39, 92.43],
        note: "",
      },
      asset_structure: [{ label: "Tiền", value: 10.35, pct: 9.6 }],
      cashflow: {
        operating: { net: 20.38, items: [] },
        investing: { net: -19.38, items: [] },
        financing: { net: -0.02, items: [] },
      },
    };
    render(<FinancialCharts analysis={analysis} />);
    expect(screen.getByText("Biểu đồ tài chính")).toBeInTheDocument();
    expect(screen.getByText(/Doanh thu & Lợi nhuận/)).toBeInTheDocument();
    expect(screen.getByText(/Biên lợi nhuận/)).toBeInTheDocument();
    expect(screen.getByText(/Nợ vs Vốn chủ sở hữu/)).toBeInTheDocument();
    expect(screen.getByText("Cơ cấu tài sản")).toBeInTheDocument();
    expect(screen.getByText(/Dòng tiền thuần theo hoạt động/)).toBeInTheDocument();
  });

  it("renders nothing when there is no chartable data", () => {
    const { container } = render(<FinancialCharts analysis={base} />);
    expect(container).toBeEmptyDOMElement();
  });
});
