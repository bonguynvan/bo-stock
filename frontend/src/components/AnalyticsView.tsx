"use client";

import { useCallback, useEffect, useState } from "react";
import type { Analytics, IndexSummary } from "@/types/stock";
import { getAnalytics, syncIndex } from "@/lib/api";
import { changeColor, fmtNumber, fmtPercent } from "@/lib/format";
import PortfolioRiskPanel from "./PortfolioRiskPanel";

function Sparkline({ series }: { series: { close: number }[] }) {
  if (series.length < 2) return null;
  const vals = series.map((p) => p.close);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const w = 220;
  const h = 40;
  const pts = vals
    .map((v, i) => `${(i / (vals.length - 1)) * w},${h - ((v - min) / span) * h}`)
    .join(" ");
  const up = vals[vals.length - 1] >= vals[0];
  return (
    <svg width={w} height={h} className="mt-1" preserveAspectRatio="none">
      <polyline
        points={pts}
        fill="none"
        strokeWidth="1.5"
        className={up ? "stroke-secondary" : "stroke-error"}
      />
    </svg>
  );
}

function Ret({ label, v }: { label: string; v: number | null }) {
  return (
    <div className="text-center">
      <div className="text-data-sm text-on-surface-variant uppercase opacity-60">{label}</div>
      <div className={`font-data-md text-data-md ${changeColor(v)}`}>{fmtPercent(v, 1, true)}</div>
    </div>
  );
}

function IndexCard({ ix }: { ix: IndexSummary }) {
  return (
    <div className="border border-outline-variant bg-surface-container-low p-4">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="font-headline-sm text-headline-sm text-on-surface">{ix.symbol}</div>
          <div className="text-data-sm text-on-surface-variant opacity-60">{ix.as_of}</div>
        </div>
        <div className="text-right">
          <div className="font-display-sm text-display-sm text-on-surface">{fmtNumber(ix.level)}</div>
          <div className={`font-data-md text-data-md ${changeColor(ix.change_pct)}`}>
            {fmtPercent(ix.change_pct, 2, true)}
          </div>
        </div>
      </div>
      <Sparkline series={ix.series} />
      <div className="grid grid-cols-5 gap-1 mt-2 border-t border-outline-variant pt-2">
        <Ret label="1T" v={ix.ret_1w} />
        <Ret label="1Th" v={ix.ret_1m} />
        <Ret label="3Th" v={ix.ret_3m} />
        <Ret label="YTD" v={ix.ret_ytd} />
        <Ret label="1N" v={ix.ret_1y} />
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="border border-outline-variant bg-surface-container-low p-3">
      <div className="text-data-sm text-on-surface-variant uppercase font-label-caps">{label}</div>
      <div className={`font-headline-sm text-headline-sm ${tone ?? "text-on-surface"}`}>{value}</div>
    </div>
  );
}

export default function AnalyticsView({ onToast }: { onToast: (msg: string) => void }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getAnalytics());
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Lỗi tải phân tích");
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      await syncIndex();
      await load();
      onToast("Đã đồng bộ chỉ số VN-Index");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Lỗi đồng bộ chỉ số");
    } finally {
      setSyncing(false);
    }
  }, [load, onToast]);

  if (loading) {
    return <p className="p-6 text-on-surface-variant font-data-md text-data-md">Đang tải phân tích…</p>;
  }
  if (!data) return null;

  const b = data.benchmark;

  return (
    <div className="flex-1 overflow-auto custom-scrollbar p-4 space-y-4">
      <div className="border-l-2 border-primary bg-primary/10 p-3 text-body-md text-on-surface">
        {data.disclaimer}
      </div>

      {/* Market context */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-label-caps text-label-caps text-primary uppercase tracking-widest">
            Bối cảnh thị trường
          </h2>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="text-data-sm text-on-surface-variant hover:text-primary transition-colors disabled:opacity-50"
          >
            {syncing ? "Đang đồng bộ…" : "↻ Đồng bộ chỉ số"}
          </button>
        </div>
        {data.market.length === 0 ? (
          <p className="text-on-surface-variant font-data-md text-data-md py-4 text-center border border-outline-variant border-dashed">
            Chưa có dữ liệu chỉ số — bấm “Đồng bộ chỉ số”.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.market.map((ix) => (
              <IndexCard key={ix.symbol} ix={ix} />
            ))}
          </div>
        )}
      </section>

      {!data.has_portfolio ? (
        <p className="text-on-surface-variant font-data-md text-data-md py-6 text-center border border-outline-variant border-dashed">
          Thêm vị thế ở tab Portfolio để xem phân tích danh mục (tập trung, phân bổ ngành, so với VN-Index).
        </p>
      ) : (
        <>
          {/* Benchmark */}
          {b && (
            <section className="space-y-2">
              <h2 className="font-label-caps text-label-caps text-primary uppercase tracking-widest">
                Danh mục vs VN-Index
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Metric
                  label="Danh mục (từ giá vốn)"
                  value={fmtPercent(b.portfolio_return_pct, 2, true)}
                  tone={changeColor(b.portfolio_return_pct)}
                />
                <Metric label="VN-Index YTD" value={fmtPercent(b.vnindex_ytd, 1, true)} tone={changeColor(b.vnindex_ytd)} />
                <Metric label="VN-Index 1 năm" value={fmtPercent(b.vnindex_1y, 1, true)} tone={changeColor(b.vnindex_1y)} />
                {b.since_entry && (
                  <Metric
                    label={`vs VN-Index từ ngày mua (${b.since_entry.included} mã)`}
                    value={fmtPercent(b.since_entry.weighted_alpha_pct, 2, true)}
                    tone={changeColor(b.since_entry.weighted_alpha_pct)}
                  />
                )}
              </div>
            </section>
          )}

          {/* Income & quality rollup */}
          {data.income_quality && (
            <section className="space-y-2">
              <h2 className="font-label-caps text-label-caps text-primary uppercase tracking-widest">
                Thu nhập & Chất lượng danh mục
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Metric
                  label="Cổ tức dự kiến/năm"
                  value={`${fmtNumber(data.income_quality.expected_annual_dividend)} đ`}
                />
                <Metric
                  label="Tỷ suất cổ tức DM"
                  value={fmtPercent(data.income_quality.portfolio_yield_pct, 2)}
                />
                <Metric label="P/E BQ (tỷ trọng)" value={fmtNumber(data.income_quality.wavg_pe)} />
                <Metric label="ROE BQ (tỷ trọng)" value={fmtPercent(data.income_quality.wavg_roe, 1)} />
              </div>
              <p className="text-data-sm text-on-surface-variant">
                {data.income_quality.solid_count} mã có La bàn dài hạn ≥ 65 (nền tảng tốt).
              </p>
              {data.income_quality.risk_flags.length > 0 && (
                <ul className="space-y-1">
                  {data.income_quality.risk_flags.map((f) => (
                    <li key={f} className="text-body-md text-primary flex items-center gap-1.5">
                      <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>warning</span>
                      {f}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* P&L by sector */}
          {data.pnl_by_sector && data.pnl_by_sector.length > 0 && (
            <section className="space-y-1.5">
              <h2 className="font-label-caps text-label-caps text-primary uppercase tracking-widest">
                Lãi/Lỗ theo ngành
              </h2>
              {data.pnl_by_sector.map((s) => (
                <div key={s.label} className="flex items-center gap-2 text-data-md font-data-md">
                  <div className="w-44 shrink-0 text-on-surface-variant truncate">{s.label}</div>
                  <div className={`flex-1 text-right ${changeColor(s.pnl)}`}>
                    {s.pnl >= 0 ? "+" : ""}{fmtNumber(s.pnl)} đ ({fmtPercent(s.pnl_pct, 1, true)})
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* Portfolio quality + concentration */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {data.concentration && (
              <>
                <Metric label="Mã lớn nhất" value={`${data.concentration.top1}%`} />
                <Metric label="Top 3 tỷ trọng" value={`${data.concentration.top3}%`} />
                <Metric
                  label="Độ tập trung (HHI)"
                  value={`${data.concentration.hhi}${data.concentration.hhi > 1800 ? " · cao" : ""}`}
                  tone={data.concentration.hhi > 1800 ? "text-primary" : undefined}
                />
              </>
            )}
            {data.avg_compass_long != null && (
              <Metric label="La bàn DH TB (theo tỷ trọng)" value={`${data.avg_compass_long}`} />
            )}
          </div>

          {/* Best / worst */}
          {(data.best?.length || data.worst?.length) && (
            <div className="flex flex-wrap gap-4 text-data-md font-data-md">
              <div>
                <span className="text-on-surface-variant opacity-60 uppercase text-data-sm">Tốt nhất: </span>
                {data.best?.map((h) => (
                  <span key={h.symbol} className="mr-2">
                    {h.symbol} <span className={changeColor(h.pnl_pct)}>{fmtPercent(h.pnl_pct, 1, true)}</span>
                  </span>
                ))}
              </div>
              <div>
                <span className="text-on-surface-variant opacity-60 uppercase text-data-sm">Kém nhất: </span>
                {data.worst?.map((h) => (
                  <span key={h.symbol} className="mr-2">
                    {h.symbol} <span className={changeColor(h.pnl_pct)}>{fmtPercent(h.pnl_pct, 1, true)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Sector over/under-weight vs market */}
          {data.sector_vs_market && data.sector_vs_market.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-label-caps text-label-caps text-primary uppercase tracking-widest">
                Phân bổ ngành vs thị trường
              </h2>
              <p className="text-data-sm text-on-surface-variant opacity-60">
                Chênh lệch tỷ trọng danh mục so với vốn hóa ngành trên thị trường (dương = overweight).
              </p>
              {data.sector_vs_market.map((s) => (
                <div key={s.label} className="flex items-center gap-2 text-data-md font-data-md">
                  <div className="w-44 shrink-0 text-on-surface-variant truncate">{s.label}</div>
                  <div className="w-20 text-right">{s.portfolio_pct}%</div>
                  <div className="w-16 text-right text-on-surface-variant opacity-60">{s.market_pct}%</div>
                  <div className={`w-20 text-right font-bold ${changeColor(s.diff)}`}>
                    {s.diff >= 0 ? "+" : ""}{s.diff}
                  </div>
                </div>
              ))}
              <div className="flex gap-2 text-data-sm text-on-surface-variant opacity-50">
                <span className="w-44 shrink-0" />
                <span className="w-20 text-right">danh mục</span>
                <span className="w-16 text-right">thị trường</span>
                <span className="w-20 text-right">lệch</span>
              </div>
            </section>
          )}

          {/* Portfolio risk analytics */}
          <section className="space-y-2">
            <h2 className="font-label-caps text-label-caps text-primary uppercase tracking-widest">
              Rủi ro danh mục
            </h2>
            <PortfolioRiskPanel />
          </section>
        </>
      )}
    </div>
  );
}
