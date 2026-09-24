"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalysisResult } from "@/types/stock";

const GREEN = "#5bc88a";
const RED = "#ffb4ab";
const GOLD = "#e3b341";
const BLUE = "#7aa2f7";
const AXIS = "#9aa0a6";
const GRID = "rgba(255,255,255,0.08)";
const PIE_COLORS = [GOLD, GREEN, BLUE, "#c792ea", "#f78c6c", "#82d4bb", "#ff9e9e", "#a0a0c0"];

const tooltipStyle = {
  backgroundColor: "#1a1a1a",
  border: "1px solid rgba(255,255,255,0.2)",
  fontSize: "12px",
  fontFamily: "var(--font-jetbrains-mono, monospace)",
} as const;

const billion = (v: number | string) => `${Number(v).toLocaleString("vi-VN")} tỷ`;
const percent = (v: number | string) => `${Number(v).toFixed(1)}%`;

function hasNums(arr?: (number | null)[]): boolean {
  return !!arr && arr.some((v) => v != null);
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-outline-variant bg-surface-container-low p-3">
      <h4 className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2">
        {title}
      </h4>
      {children}
    </div>
  );
}

export default function FinancialCharts({ analysis }: { analysis: AnalysisResult }) {
  const t = analysis.multi_year_trend;
  const assets = (analysis.asset_structure ?? []).filter((a) => a.value != null);
  const cf = analysis.cashflow;

  const years = t?.years ?? [];
  const revProfit = years.map((year, i) => ({
    year,
    revenue: t?.revenue?.[i] ?? null,
    profit: t?.net_profit?.[i] ?? null,
  }));
  const margins = years.map((year, i) => ({
    year,
    gross: t?.gross_margin_pct?.[i] ?? null,
    net: t?.net_margin_pct?.[i] ?? null,
  }));
  const debtEquity = years.map((year, i) => ({
    year,
    debt: t?.total_debt?.[i] ?? null,
    equity: t?.equity?.[i] ?? null,
  }));
  const cashflow = cf
    ? [
        { name: "HĐKD", value: cf.operating?.net ?? null },
        { name: "Đầu tư", value: cf.investing?.net ?? null },
        { name: "Tài chính", value: cf.financing?.net ?? null },
      ].filter((d) => d.value != null)
    : [];

  const showRevProfit = hasNums(t?.revenue) || hasNums(t?.net_profit);
  const showMargins = hasNums(t?.gross_margin_pct) || hasNums(t?.net_margin_pct);
  const showDebtEquity = hasNums(t?.total_debt) || hasNums(t?.equity);
  const showAssets = assets.length > 0;
  const showCashflow = cashflow.length > 0;

  if (!showRevProfit && !showMargins && !showDebtEquity && !showAssets && !showCashflow) {
    return null;
  }

  return (
    <section className="space-y-3">
      <h3 className="font-label-caps text-label-caps text-primary uppercase tracking-widest">
        Biểu đồ tài chính
      </h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {showRevProfit && (
          <ChartCard title="Doanh thu & Lợi nhuận (tỷ VND)">
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={revProfit}>
                <CartesianGrid stroke={GRID} />
                <XAxis dataKey="year" stroke={AXIS} fontSize={11} />
                <YAxis stroke={AXIS} fontSize={11} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => billion(v as number)} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Bar dataKey="revenue" name="Doanh thu" fill={GOLD} />
                <Line dataKey="profit" name="LNST" stroke={GREEN} strokeWidth={2} dot />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {showMargins && (
          <ChartCard title="Biên lợi nhuận (%)">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={margins}>
                <CartesianGrid stroke={GRID} />
                <XAxis dataKey="year" stroke={AXIS} fontSize={11} />
                <YAxis stroke={AXIS} fontSize={11} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => percent(v as number)} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Line dataKey="gross" name="Biên LN gộp" stroke={BLUE} strokeWidth={2} dot />
                <Line dataKey="net" name="Biên LN ròng" stroke={GREEN} strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {showDebtEquity && (
          <ChartCard title="Nợ vs Vốn chủ sở hữu (tỷ VND)">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={debtEquity}>
                <CartesianGrid stroke={GRID} />
                <XAxis dataKey="year" stroke={AXIS} fontSize={11} />
                <YAxis stroke={AXIS} fontSize={11} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => billion(v as number)} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Bar dataKey="debt" name="Tổng nợ" fill={RED} />
                <Bar dataKey="equity" name="Vốn CSH" fill={GREEN} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {showAssets && (
          <ChartCard title="Cơ cấu tài sản">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={assets}
                  dataKey="value"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={40}
                  paddingAngle={2}
                >
                  {assets.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => billion(v as number)} />
                <Legend wrapperStyle={{ fontSize: "10px" }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {showCashflow && (
          <ChartCard title="Dòng tiền thuần theo hoạt động (tỷ VND)">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={cashflow}>
                <CartesianGrid stroke={GRID} />
                <XAxis dataKey="name" stroke={AXIS} fontSize={11} />
                <YAxis stroke={AXIS} fontSize={11} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => billion(v as number)} />
                <Bar dataKey="value" name="Dòng tiền thuần">
                  {cashflow.map((d, i) => (
                    <Cell key={i} fill={(d.value ?? 0) >= 0 ? GREEN : RED} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>
    </section>
  );
}
