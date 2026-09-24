"use client";

import { useCallback, useEffect, useState } from "react";
import type { DcfResult, Valuation, ValuationMethod } from "@/types/stock";
import { getDcf, getValuation } from "@/lib/api";
import SectorValuationCard from "./SectorValuationCard";

const METHOD_LABELS: Record<string, string> = {
  pe_eps_avg: "P/E × EPS (TB)",
  pb_bvps_avg: "P/B × BVPS (TB)",
  graham: "Graham Number",
};

const vnd = (v: number | null | undefined): string =>
  v == null ? "—" : `${v.toLocaleString("vi-VN")}đ`;

function MethodCard({ name, method }: { name: string; method: ValuationMethod }) {
  return (
    <div className="bg-surface-container p-3 border border-outline-variant">
      <div className="font-label-caps text-label-caps text-on-surface-variant uppercase">
        {METHOD_LABELS[name] ?? name}
      </div>
      <div
        className={`font-data-md text-data-md mt-1 ${method.value != null ? "text-on-surface" : "text-on-surface-variant"}`}
      >
        {method.value != null ? vnd(method.value) : "Không tính được"}
      </div>
      <p className="text-data-sm text-on-surface-variant opacity-70 mt-1">{method.note}</p>
    </div>
  );
}

function RangeBar({ v }: { v: Valuation }) {
  const { low, high, median } = v.valuation_range;
  const price = v.current_price;
  const pts = [low, high, price, median].filter((n): n is number => n != null);
  if (pts.length < 2 || low == null || high == null) return null;
  const dmin = Math.min(...pts);
  const dmax = Math.max(...pts);
  const span = dmax - dmin || 1;
  const pos = (x: number) => ((x - dmin) / span) * 100;

  return (
    <div className="pt-8 pb-6 px-1">
      <div className="relative h-2 bg-surface-container-high rounded">
        {/* estimated value band */}
        <div
          className="absolute h-2 bg-secondary/30 border-x border-secondary rounded"
          style={{ left: `${pos(low)}%`, width: `${pos(high) - pos(low)}%` }}
        />
        {/* median marker */}
        {median != null && (
          <div
            className="absolute -top-1 h-4 w-0.5 bg-secondary"
            style={{ left: `${pos(median)}%` }}
            title={`Trung vị ${vnd(median)}`}
          />
        )}
        {/* current price marker */}
        {price != null && (
          <div className="absolute -top-7 flex flex-col items-center" style={{ left: `${pos(price)}%`, transform: "translateX(-50%)" }}>
            <span className="font-data-sm text-data-sm text-primary whitespace-nowrap">
              Giá TT {vnd(price)}
            </span>
            <span className="h-6 w-0.5 bg-primary" />
          </div>
        )}
        {/* low / high labels */}
        <span className="absolute -bottom-6 left-0 font-data-sm text-data-sm text-on-surface-variant">
          {vnd(low)}
        </span>
        <span className="absolute -bottom-6 right-0 font-data-sm text-data-sm text-on-surface-variant">
          {vnd(high)}
        </span>
      </div>
    </div>
  );
}

const DCF_DEFAULTS = { growth_rate: 5, discount_rate: 13, years: 5 };

export default function ValuationPanel({ symbol }: { symbol: string }) {
  const [val, setVal] = useState<Valuation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [dcfForm, setDcfForm] = useState(DCF_DEFAULTS);
  const [dcf, setDcf] = useState<DcfResult | null>(null);
  const [dcfLoading, setDcfLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getValuation(symbol)
      .then((d) => !cancelled && setVal(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Lỗi định giá"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const runDcf = useCallback(async () => {
    setDcfLoading(true);
    try {
      setDcf(await getDcf(symbol, dcfForm));
    } catch (e) {
      setDcf(null);
      setError(e instanceof Error ? e.message : "Lỗi DCF");
    } finally {
      setDcfLoading(false);
    }
  }, [symbol, dcfForm]);

  if (loading) {
    return <p className="text-on-surface-variant font-data-md text-data-md">Đang tính định giá…</p>;
  }
  if (error || !val) {
    // Intrinsic valuation needs history; the sector-relative view often still works.
    return (
      <div className="space-y-4">
        <p className="text-on-surface-variant font-data-md text-data-md py-4 text-center border border-outline-variant border-dashed">
          {error ?? "Không có dữ liệu định giá."}
        </p>
        <SectorValuationCard symbol={symbol} />
      </div>
    );
  }

  const eq = val.earnings_quality;

  return (
    <div className="space-y-4">
      <p className="text-on-surface-variant text-body-md opacity-70">
        Định giá tham khảo dựa trên dữ liệu lịch sử — <strong>không phải khuyến nghị đầu tư</strong>.
      </p>

      {/* Earnings-quality warning */}
      {(eq.outliers_detected.length > 0 || eq.fallback_used) && (
        <div className="border border-primary/40 bg-primary/10 p-3 space-y-1">
          <div className="font-label-caps text-label-caps text-primary uppercase">
            Chất lượng lợi nhuận
          </div>
          {eq.outliers_detected.map((o, i) => (
            <p key={i} className="text-body-md text-on-surface">
              Kỳ <strong>{o.year}</strong> bất thường: {o.reasons.join("; ")}
            </p>
          ))}
          {eq.fallback_used && <p className="text-body-md text-error">{eq.note}</p>}
        </div>
      )}

      {/* Range bar vs market price */}
      <RangeBar v={val} />
      <p className="text-body-md text-on-surface text-center">
        {val.vs_current_price.interpretation}
        {val.vs_current_price.discount_pct != null && (
          <span
            className={`ml-1 font-data-md ${val.vs_current_price.discount_pct >= 0 ? "text-secondary" : "text-error"}`}
          >
            ({val.vs_current_price.discount_pct > 0 ? "+" : ""}
            {val.vs_current_price.discount_pct}%)
          </span>
        )}
      </p>

      {/* Method cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <MethodCard name="pe_eps_avg" method={val.methods.pe_eps_avg} />
        <MethodCard name="pb_bvps_avg" method={val.methods.pb_bvps_avg} />
        <MethodCard name="graham" method={val.methods.graham} />
      </div>

      {/* Sector-relative valuation (peers) */}
      <SectorValuationCard symbol={symbol} />

      {/* DCF (interactive) */}
      <div className="border border-outline-variant bg-surface-container-low p-4 space-y-3">
        <div className="font-label-caps text-label-caps text-primary uppercase tracking-widest">
          DCF (dòng tiền chiết khấu) — tự nhập giả định
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { key: "growth_rate", label: "Tăng trưởng (%/năm)", min: -50, max: 100, step: 1 },
            { key: "discount_rate", label: "Chiết khấu (%)", min: 1, max: 50, step: 1 },
            { key: "years", label: "Số năm", min: 1, max: 15, step: 1 },
          ].map((f) => (
            <label key={f.key} className="block">
              <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                {f.label}
              </span>
              <input
                type="number"
                min={f.min}
                max={f.max}
                step={f.step}
                value={dcfForm[f.key as keyof typeof dcfForm]}
                onChange={(e) =>
                  setDcfForm((s) => ({ ...s, [f.key]: Number(e.target.value) }))
                }
                className="w-full mt-1 bg-surface-container border border-outline-variant px-2 py-1.5 font-data-md text-data-md text-on-surface focus:border-primary outline-none"
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={runDcf}
          disabled={dcfLoading}
          className="px-4 py-1.5 bg-primary-container text-on-primary font-label-caps text-label-caps uppercase hover:brightness-110 transition disabled:opacity-50"
        >
          {dcfLoading ? "Đang tính…" : "Tính DCF"}
        </button>
        {dcf && (
          <div className="pt-1">
            <div className="font-data-md text-data-md text-on-surface">
              Giá trị DCF ước tính:{" "}
              <span className="text-primary">{vnd(dcf.dcf_value)}</span>
            </div>
            <p className="text-data-sm text-on-surface-variant opacity-70 mt-1">
              {dcf.sensitivity_note}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
