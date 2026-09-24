"use client";

import type { Exchange, ScreenerFilterBody } from "@/types/stock";
import MetricInfo from "./MetricInfo";

export interface ScreenerFormState {
  sector: string; // "" === all sectors
  exchanges: Exchange[]; // empty === all exchanges
  peMax: number;
  roeMin: number;
  roaMin: number;
  marketCapMin: number; // tỷ VND; 0 === all sizes
  debtEquity: "0.5" | "1.0" | "all";
  dividend: "any" | "3" | "7";
  excludeBeneishHighRisk: boolean;
  excludeWeakEarningsQuality: boolean;
  // Preset-driven advanced fields (no dedicated form control; set by preset chips).
  peVsHistMax: number | null; // e.g. -10 → ≥10% below own 5yr-avg P/E
  revenueGrowthMin: number | null;
  sortBy: NonNullable<ScreenerFilterBody["sort_by"]>;
  sortOrder: "asc" | "desc";
}

// Discovery-friendly defaults: a "quality" lean (ROE ≥ 10, P/E ≤ 30) that still
// returns a healthy ranked set on first load. Users tighten from here. Sending a
// preset that nothing passes (the design mock's chips) would look broken.
export const DEFAULT_FORM_STATE: ScreenerFormState = {
  sector: "",
  exchanges: [],
  peMax: 30,
  roeMin: 10,
  roaMin: 0,
  marketCapMin: 0,
  debtEquity: "all",
  dividend: "any",
  excludeBeneishHighRisk: false,
  excludeWeakEarningsQuality: false,
  peVsHistMax: null,
  revenueGrowthMin: null,
  sortBy: "quant_score",
  sortOrder: "desc",
};

// Fallback list used only until the API's /screener/sectors response arrives.
const FALLBACK_SECTORS: readonly string[] = [
  "Ngân hàng",
  "Bất động sản",
  "Thép & Kim loại",
  "Công nghệ Thông tin",
  "Bán lẻ",
];

const EXCHANGES: readonly Exchange[] = ["HOSE", "HNX", "UPCOM"];

// Vốn hóa tiers (tỷ VND, min-based so it round-trips with market_cap_min).
const MARKET_CAP_TIERS: readonly { label: string; min: number; title: string }[] = [
  { label: "Tất cả", min: 0, title: "Tất cả quy mô" },
  { label: ">500", min: 500, title: "Trên 500 tỷ (bỏ mã siêu nhỏ)" },
  { label: ">1.000", min: 1000, title: "Vừa & lớn (trên 1.000 tỷ)" },
  { label: ">10.000", min: 10000, title: "Vốn hóa lớn (trên 10.000 tỷ)" },
];

const PE_MAX_LIMIT = 50;

// Translate UI form state into the API filter body.
export function toFilterBody(state: ScreenerFormState): ScreenerFilterBody {
  const body: ScreenerFilterBody = {
    pe_max: state.peMax,
    roe_min: state.roeMin,
    roa_min: state.roaMin,
    sort_by: state.sortBy,
    sort_order: state.sortOrder,
    limit: 2000, // fetch the full matched set; the grid paginates/virtualizes
  };
  if (state.sector) body.sector = state.sector;
  if (state.exchanges.length > 0) body.exchange = state.exchanges;
  if (state.marketCapMin > 0) body.market_cap_min = state.marketCapMin;
  if (state.debtEquity !== "all") body.debt_equity_max = Number(state.debtEquity);
  if (state.excludeBeneishHighRisk) body.exclude_beneish_high_risk = true;
  if (state.excludeWeakEarningsQuality) body.exclude_weak_earnings_quality = true;
  if (state.dividend !== "any") body.dividend_yield_min = Number(state.dividend);
  if (state.peVsHistMax !== null) body.pe_vs_hist_max = state.peVsHistMax;
  if (state.revenueGrowthMin !== null) body.revenue_growth_min = state.revenueGrowthMin;
  return body;
}

// Inverse of toFilterBody: rebuild form state from a saved screen's criteria.
export function fromFilterBody(body: ScreenerFilterBody): ScreenerFormState {
  return {
    sector: body.sector ?? "",
    exchanges: body.exchange ?? [],
    peMax: body.pe_max ?? DEFAULT_FORM_STATE.peMax,
    roeMin: body.roe_min ?? DEFAULT_FORM_STATE.roeMin,
    roaMin: body.roa_min ?? DEFAULT_FORM_STATE.roaMin,
    marketCapMin: body.market_cap_min ?? 0,
    debtEquity:
      body.debt_equity_max === 0.5
        ? "0.5"
        : body.debt_equity_max === 1
          ? "1.0"
          : "all",
    dividend:
      body.dividend_yield_min === 3
        ? "3"
        : body.dividend_yield_min === 7
          ? "7"
          : "any",
    excludeBeneishHighRisk: body.exclude_beneish_high_risk ?? false,
    excludeWeakEarningsQuality: body.exclude_weak_earnings_quality ?? false,
    peVsHistMax: body.pe_vs_hist_max ?? null,
    revenueGrowthMin: body.revenue_growth_min ?? null,
    sortBy: body.sort_by ?? "quant_score",
    sortOrder: body.sort_order ?? "desc",
  };
}

// One-click preset filter bodies (chips above the grid). Each is a full filter body.
export const SCREENER_PRESETS: { label: string; hint: string; body: ScreenerFilterBody }[] = [
  {
    label: "Rẻ so với lịch sử",
    hint: "P/E ≥10% dưới trung bình 5 năm của chính mã",
    body: { pe_vs_hist_max: -10, market_cap_min: 1000, roe_min: 10,
            sort_by: "pe_vs_hist", sort_order: "asc" },
  },
  {
    label: "Cổ tức cao",
    hint: "Tỷ suất cổ tức ≥ 5%",
    body: { dividend_yield_min: 5, market_cap_min: 500, sort_by: "dividend_yield", sort_order: "desc" },
  },
  {
    label: "Tăng trưởng",
    hint: "Doanh thu tăng ≥15%, ROE ≥15%",
    body: { revenue_growth_min: 15, roe_min: 15, sort_by: "revenue_growth", sort_order: "desc" },
  },
];

interface ScreenerFormProps {
  state: ScreenerFormState;
  onChange: (next: ScreenerFormState) => void;
  onReset: () => void;
  sectors?: readonly string[];
}

export default function ScreenerForm({
  state,
  onChange,
  onReset,
  sectors,
}: ScreenerFormProps) {
  const sectorOptions = sectors && sectors.length > 0 ? sectors : FALLBACK_SECTORS;
  const patch = (partial: Partial<ScreenerFormState>) =>
    onChange({ ...state, ...partial });

  const toggleExchange = (ex: Exchange) => {
    const next = state.exchanges.includes(ex)
      ? state.exchanges.filter((e) => e !== ex)
      : [...state.exchanges, ex];
    patch({ exchanges: next });
  };

  return (
    <aside className="w-full flex-1 min-h-0 bg-surface-container-lowest overflow-y-auto custom-scrollbar p-4 flex flex-col gap-6">
      <section>
        <h3 className="font-label-caps text-label-caps text-primary uppercase tracking-widest mb-3 flex items-center justify-between">
          Phân loại & Sàn
          <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
            info
          </span>
        </h3>
        <div className="space-y-4">
          <div>
            <label className="font-label-caps text-label-caps text-on-surface-variant block mb-2">
              Ngành (Sector)
            </label>
            <select
              value={state.sector}
              onChange={(e) => patch({ sector: e.target.value })}
              className="w-full bg-surface-container-high border border-outline-variant text-body-md p-2 focus:border-primary-container outline-none appearance-none"
            >
              <option value="">Tất cả các ngành</option>
              {sectorOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-label-caps text-label-caps text-on-surface-variant block mb-2">
              Sàn Giao dịch
            </label>
            <div className="grid grid-cols-3 gap-1">
              {EXCHANGES.map((ex) => {
                const selected = state.exchanges.includes(ex);
                return (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => toggleExchange(ex)}
                    className={
                      selected
                        ? "font-data-sm text-data-sm py-1 border border-primary-container text-primary bg-primary/10"
                        : "font-data-sm text-data-sm py-1 border border-outline-variant hover:border-primary transition-colors"
                    }
                  >
                    {ex}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="font-label-caps text-label-caps text-on-surface-variant block mb-2">
              Vốn hóa (tỷ VND)
            </label>
            <div className="grid grid-cols-4 gap-1">
              {MARKET_CAP_TIERS.map((t) => {
                const selected = state.marketCapMin === t.min;
                return (
                  <button
                    key={t.label}
                    type="button"
                    title={t.title}
                    onClick={() => patch({ marketCapMin: t.min })}
                    className={
                      selected
                        ? "font-data-sm text-data-sm py-1 border border-primary-container text-primary bg-primary/10"
                        : "font-data-sm text-data-sm py-1 border border-outline-variant hover:border-primary transition-colors"
                    }
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="font-label-caps text-label-caps text-primary uppercase tracking-widest mb-3">
          Định giá & Hiệu quả
        </h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-2">
              <label className="font-label-caps text-label-caps text-on-surface-variant inline-flex items-center gap-1">
                P/E Ratio
                <MetricInfo metricKey="pe" align="left" />
              </label>
              <span className="font-data-sm text-data-sm text-primary">
                0 - {state.peMax.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={PE_MAX_LIMIT}
              step={0.5}
              value={state.peMax}
              onChange={(e) => patch({ peMax: Number(e.target.value) })}
              className="w-full accent-primary-container h-1 bg-surface-container-highest appearance-none"
            />
          </div>
          <div>
            <div className="flex justify-between mb-2">
              <label className="font-label-caps text-label-caps text-on-surface-variant inline-flex items-center gap-1">
                ROE (%)
                <MetricInfo metricKey="roe" align="left" />
              </label>
              <span className="font-data-sm text-data-sm text-primary">
                &gt; {state.roeMin}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={state.roeMin}
                onChange={(e) => patch({ roeMin: Number(e.target.value) })}
                className="w-full bg-surface-container-high border border-outline-variant text-body-md p-1.5 focus:border-primary-container outline-none"
              />
              <span className="text-on-surface-variant">Min</span>
            </div>
          </div>
          <div>
            <div className="flex justify-between mb-2">
              <label className="font-label-caps text-label-caps text-on-surface-variant inline-flex items-center gap-1">
                ROA (%)
                <MetricInfo metricKey="roa" align="left" />
              </label>
              <span className="font-data-sm text-data-sm text-primary">
                &gt; {state.roaMin}%
              </span>
            </div>
            <input
              type="number"
              value={state.roaMin}
              onChange={(e) => patch({ roaMin: Number(e.target.value) })}
              className="w-full bg-surface-container-high border border-outline-variant text-body-md p-1.5 focus:border-primary-container outline-none"
            />
          </div>
        </div>
      </section>

      <section>
        <h3 className="font-label-caps text-label-caps text-primary uppercase tracking-widest mb-3">
          Sức khỏe Tài chính
        </h3>
        <div className="space-y-4">
          <div>
            <label className="font-label-caps text-label-caps text-on-surface-variant mb-2 flex items-center gap-1">
              Debt/Equity Ratio
              <MetricInfo metricKey="debt_equity" align="left" />
            </label>
            <select
              value={state.debtEquity}
              onChange={(e) =>
                patch({ debtEquity: e.target.value as ScreenerFormState["debtEquity"] })
              }
              className="w-full bg-surface-container-high border border-outline-variant text-body-md p-2 focus:border-primary-container outline-none"
            >
              <option value="0.5">&lt; 0.5 (An toàn)</option>
              <option value="1.0">&lt; 1.0 (Tiêu chuẩn)</option>
              <option value="all">Tất cả</option>
            </select>
          </div>
          <div>
            <label className="font-label-caps text-label-caps text-on-surface-variant mb-2 flex items-center gap-1">
              Dividend Yield (%)
              <MetricInfo metricKey="dividend_yield" align="left" />
            </label>
            <div className="flex gap-2">
              {(["any", "3", "7"] as const).map((d) => {
                const selected = state.dividend === d;
                const text = d === "any" ? "Any" : `+${d}%`;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => patch({ dividend: d })}
                    className={
                      selected
                        ? "flex-1 py-1 text-data-sm border border-primary-container bg-primary/5 text-primary"
                        : "flex-1 py-1 text-data-sm border border-outline-variant hover:border-primary-container transition-colors"
                    }
                  >
                    {text}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex items-start gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={state.excludeBeneishHighRisk}
              onChange={(e) => patch({ excludeBeneishHighRisk: e.target.checked })}
              className="mt-0.5 accent-primary"
            />
            <span className="text-data-sm text-on-surface-variant">
              Ẩn mã có rủi ro thao túng cao
              <span className="block opacity-60">Loại mã bị Beneish M-Score gắn cờ ◆ rủi ro cao</span>
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={state.excludeWeakEarningsQuality}
              onChange={(e) => patch({ excludeWeakEarningsQuality: e.target.checked })}
              className="mt-0.5 accent-primary"
            />
            <span className="text-data-sm text-on-surface-variant">
              Ẩn mã chất lượng lợi nhuận thấp
              <span className="block opacity-60">Loại mã QoE gắn cờ “thấp” (lợi nhuận dựa nhiều vào dồn tích)</span>
            </span>
          </label>
        </div>
      </section>

      <div className="mt-auto pt-4 border-t border-outline-variant">
        <button
          type="button"
          onClick={onReset}
          className="w-full py-2 bg-surface-container-highest hover:bg-surface-bright text-on-surface font-label-caps text-label-caps transition-colors"
        >
          Làm mới bộ lọc
        </button>
      </div>
    </aside>
  );
}
