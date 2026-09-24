"use client";

import { useEffect, useState } from "react";
import type { RadarCoverage, RadarItem } from "@/types/stock";
import { getRadar, getRadarFlow } from "@/lib/api";
import { EMPTY, fmtDecimal, fmtNumber, isNum } from "@/lib/format";
import { rowButtonProps } from "@/lib/a11y";
import { PanelSkeleton } from "@/components/ui/Skeleton";

const CONVICTION: Record<string, { label: string; tone: string }> = {
  elevated_risk: { label: "Rủi ro", tone: "text-error" },
  watch: { label: "Theo dõi", tone: "text-amber-400" },
  mixed: { label: "Hỗn hợp", tone: "text-amber-400" },
  solid: { label: "Tích cực", tone: "text-secondary" },
  insufficient: { label: "Thiếu dữ liệu", tone: "text-on-surface-variant" },
};
const BENEISH_LABEL: Record<string, string> = {
  high_risk: "Cao", medium_risk: "TB", low_risk: "Thấp", insufficient_data: "—",
};
// Sector-relative valuation stance. "Đắt" on an already-flagged stock is a corroborating
// risk; "Rẻ" is neutral-to-mitigating. Descriptive, not a buy/sell call.
const VALUATION: Record<string, { label: string; tone: string }> = {
  rich: { label: "Đắt", tone: "text-error" },
  fair: { label: "Hợp lý", tone: "text-on-surface-variant" },
  cheap: { label: "Rẻ", tone: "text-secondary" },
  unknown: { label: EMPTY, tone: "text-on-surface-variant opacity-40" },
};

function qoeTone(v: number | null | undefined): string {
  if (!isNum(v)) return "text-on-surface-variant";
  return v >= 70 ? "text-secondary" : v >= 45 ? "text-amber-400" : "text-error";
}

export default function SignalRadarView({ onOpenSymbol }: { onOpenSymbol?: (symbol: string) => void }) {
  const [rows, setRows] = useState<RadarItem[]>([]);
  const [coverage, setCoverage] = useState<RadarCoverage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [flowLoading, setFlowLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getRadar()
      .then((res) => {
        if (cancelled) return;
        setRows(res.items);
        setCoverage(res.coverage);
        setLoading(false);
        // Second pass: fill the network overlays (foreign / tự doanh / news) in place.
        if (res.items.length === 0) return;
        setFlowLoading(true);
        getRadarFlow(res.items.map((r) => r.symbol))
          .then((flow) => {
            if (cancelled) return;
            setRows((prev) => prev.map((r) => ({ ...r, ...(flow[r.symbol] ?? {}) })));
          })
          .catch(() => {
            /* overlays are best-effort — the base radar still stands */
          })
          .finally(() => !cancelled && setFlowLoading(false));
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Lỗi tải radar");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <header className="p-4 border-b border-outline-variant bg-surface-container-low">
        <h1 className="font-headline-md text-headline-md text-on-surface">Radar tín hiệu</h1>
        <p className="text-on-surface-variant font-body-md text-body-md mt-1">
          Các mã bị sàng lọc pháp y / chất lượng lợi nhuận gắn cờ, kèm tin gần đây nhất — nơi
          rủi ro cơ bản gặp tin tức. Mở mã để phân loại tín hiệu tin bằng AI. Mô tả, không phải
          khuyến nghị.
        </p>
        {coverage && coverage.total > 0 && (
          <p
            className="text-data-sm text-on-surface-variant opacity-70 mt-2"
            title="Số mã đã có điểm sàng lọc pháp y trên tổng số mã niêm yết"
          >
            Độ phủ quét: <span className="tabular-nums text-on-surface">{coverage.scanned}</span>/
            <span className="tabular-nums">{coverage.total}</span> mã
            {coverage.scanned < coverage.total && (
              <span className="ml-1">— danh sách ngắn có thể do chưa quét đủ, không hẳn ít rủi ro.</span>
            )}
          </p>
        )}
      </header>

      <div className="flex-1 overflow-auto custom-scrollbar p-4">
        {loading ? (
          <div>
            <p className="text-data-sm text-on-surface-variant mb-2">
              Đang quét radar — tổng hợp cờ pháp y, dòng tiền & tin gần đây…
            </p>
            <PanelSkeleton rows={10} />
          </div>
        ) : error ? (
          <p className="text-data-sm text-error">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-data-sm text-on-surface-variant">
            Chưa có mã nào bị gắn cờ — cần chạy quét pháp y (fraud-scan) trước.
          </p>
        ) : (
          <table className="w-full border-collapse font-data-md text-data-md">
            <thead>
              <tr className="border-b border-outline-variant text-left">
                <th className="py-2 pr-3 font-label-caps text-label-caps uppercase text-on-surface-variant">Mã</th>
                <th className="py-2 px-3 font-label-caps text-label-caps uppercase text-on-surface-variant">Hồ sơ</th>
                <th className="py-2 px-3 text-right font-label-caps text-label-caps uppercase text-on-surface-variant">CL LN</th>
                <th className="py-2 px-3 font-label-caps text-label-caps uppercase text-on-surface-variant">Beneish</th>
                <th className="py-2 px-3 text-right font-label-caps text-label-caps uppercase text-on-surface-variant">Vốn hóa</th>
                <th className="py-2 px-3 text-right font-label-caps text-label-caps uppercase text-on-surface-variant" title="Khối ngoại mua/bán ròng (tỷ VND)">KN ròng</th>
                <th className="py-2 px-3 text-right font-label-caps text-label-caps uppercase text-on-surface-variant" title="Tự doanh mua/bán ròng (tỷ VND)">TD ròng</th>
                <th className="py-2 px-3 font-label-caps text-label-caps uppercase text-on-surface-variant" title="Định giá so với trung vị ngành (P/E & P/B)">Định giá</th>
                <th className="py-2 pl-3 font-label-caps text-label-caps uppercase text-on-surface-variant">Tin gần đây nhất</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const c = CONVICTION[r.conviction_overall] ?? CONVICTION.insufficient;
                // While the network overlays are still loading, show a subtle pulse in the
                // flow/news cells instead of a bare "—".
                const pending = <span className="animate-pulse opacity-40">·</span>;
                return (
                  <tr
                    key={r.symbol}
                    {...(onOpenSymbol ? rowButtonProps(() => onOpenSymbol(r.symbol), `Mở ${r.symbol}`) : {})}
                    className={`border-b border-outline-variant/50 hover:bg-surface-container-low ${
                      onOpenSymbol ? "cursor-pointer focus:outline focus:outline-1 focus:outline-primary" : ""
                    }`}
                  >
                    <td className="py-1.5 pr-3 align-top">
                      <span className="font-bold text-primary">{r.symbol}</span>
                      <span className="ml-2 text-data-sm text-on-surface-variant opacity-60">{r.industry ?? ""}</span>
                    </td>
                    <td className={`py-1.5 px-3 align-top font-bold ${c.tone}`}>{c.label}</td>
                    <td className={`py-1.5 px-3 text-right align-top tabular-nums ${qoeTone(r.earnings_quality_score)}`}>
                      {isNum(r.earnings_quality_score) ? fmtDecimal(r.earnings_quality_score, 0) : EMPTY}
                    </td>
                    <td className="py-1.5 px-3 align-top">
                      <span className={r.beneish_flag === "high_risk" ? "text-error" : "text-on-surface-variant"}>
                        {r.beneish_flag ? BENEISH_LABEL[r.beneish_flag] ?? r.beneish_flag : EMPTY}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 text-right align-top tabular-nums text-on-surface-variant">
                      {isNum(r.market_cap) ? fmtNumber(r.market_cap, 0) : EMPTY}
                    </td>
                    <td
                      className={`py-1.5 px-3 text-right align-top tabular-nums ${
                        isNum(r.foreign_net) ? (r.foreign_net! >= 0 ? "text-secondary" : "text-error") : "text-on-surface-variant opacity-40"
                      }`}
                      title="Khối ngoại mua/bán ròng (tỷ VND, phiên gần nhất)"
                    >
                      {isNum(r.foreign_net) ? `${r.foreign_net! >= 0 ? "+" : "−"}${fmtNumber(Math.abs(r.foreign_net!), 1)}` : flowLoading ? pending : EMPTY}
                    </td>
                    <td
                      className={`py-1.5 px-3 text-right align-top tabular-nums ${
                        isNum(r.prop_net) ? (r.prop_net! >= 0 ? "text-secondary" : "text-error") : "text-on-surface-variant opacity-40"
                      }`}
                      title="Tự doanh mua/bán ròng (tỷ VND, phiên gần nhất)"
                    >
                      {isNum(r.prop_net) ? `${r.prop_net! >= 0 ? "+" : "−"}${fmtNumber(Math.abs(r.prop_net!), 1)}` : flowLoading ? pending : EMPTY}
                    </td>
                    {(() => {
                      const v = VALUATION[r.valuation_flag ?? "unknown"] ?? VALUATION.unknown;
                      const prem = r.valuation_premium_pct;
                      return (
                        <td
                          className={`py-1.5 px-3 align-top font-bold ${v.tone}`}
                          title={
                            isNum(prem)
                              ? `${prem! >= 0 ? "Cao hơn" : "Thấp hơn"} trung vị ngành ${Math.abs(prem!)}%`
                              : "Chưa đủ dữ liệu bội số ngành"
                          }
                        >
                          {v.label}
                        </td>
                      );
                    })()}
                    <td className="py-1.5 pl-3 align-top max-w-md">
                      {r.latest_news?.title ? (
                        <a
                          href={r.latest_news.link ?? undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-primary hover:underline break-words"
                        >
                          {r.latest_news.title}
                        </a>
                      ) : flowLoading ? (
                        <span className="text-on-surface-variant opacity-50">Đang tải tin…</span>
                      ) : (
                        <span className="text-on-surface-variant opacity-50">— chưa có tin</span>
                      )}
                      {r.latest_news?.published && (
                        <span className="ml-2 text-data-sm text-on-surface-variant opacity-50">
                          {r.latest_news.published.slice(0, 10)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
