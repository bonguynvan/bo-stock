"use client";

import { useEffect, useState } from "react";
import type { QualityPick, QualityPicks } from "@/types/stock";
import { getQualityPicks } from "@/lib/api";
import { fmtDecimal, fmtNumber } from "@/lib/format";
import StarButton from "./StarButton";

function scoreColor(s: number): string {
  if (s >= 75) return "text-secondary";
  if (s >= 60) return "text-primary";
  return "text-on-surface-variant";
}

function PickCard({
  pick,
  onOpen,
  watched,
  onToggleWatchlist,
}: {
  pick: QualityPick;
  onOpen: (s: string) => void;
  watched: boolean;
  onToggleWatchlist?: (s: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(pick.symbol)}
      className="text-left border border-outline-variant bg-surface-container-low hover:bg-surface-container hover:border-primary transition-colors p-4 flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-headline-sm text-headline-sm text-primary font-bold flex items-center gap-1.5">
            {pick.symbol}
            {onToggleWatchlist && (
              <StarButton
                active={watched}
                size={18}
                onToggle={() => onToggleWatchlist(pick.symbol)}
              />
            )}
          </div>
          <div className="text-data-sm text-on-surface-variant truncate">{pick.company_name}</div>
          <div className="text-data-sm text-on-surface-variant opacity-60 truncate">
            {pick.industry}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={`font-display-sm text-display-sm ${scoreColor(pick.fundamental_score)}`}>
            {pick.fundamental_score.toFixed(0)}
          </div>
          <div className="text-data-sm text-on-surface-variant opacity-60 uppercase">Điểm NT</div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center border-y border-outline-variant py-2">
        <Stat label="ROE" value={`${fmtDecimal(pick.roe, 0)}%`} />
        <Stat label="P/E" value={fmtDecimal(pick.pe, 1)} />
        <Stat label="Nợ/VCSH" value={fmtDecimal(pick.debt_equity, 2)} />
        <Stat label="Vốn hóa" value={fmtNumber(pick.market_cap)} />
      </div>

      <ul className="flex flex-wrap gap-1.5">
        {pick.reasons.map((r) => (
          <li
            key={r}
            className="text-data-sm bg-surface-container-high text-on-surface-variant px-2 py-0.5 border border-outline-variant"
          >
            {r}
          </li>
        ))}
      </ul>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-data-md text-data-md text-on-surface">{value}</div>
      <div className="text-data-sm text-on-surface-variant opacity-60 uppercase">{label}</div>
    </div>
  );
}

export default function QualityPicksView({
  onOpenDetail,
  onToggleWatchlist,
  watchlistSymbols,
}: {
  onOpenDetail: (s: string) => void;
  onToggleWatchlist?: (s: string) => void;
  watchlistSymbols?: ReadonlySet<string>;
}) {
  const [data, setData] = useState<QualityPicks | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getQualityPicks()
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Lỗi tải danh sách"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="p-6 text-on-surface-variant font-data-md text-data-md">Đang quét nền tảng…</p>;
  }
  if (error || !data) {
    return <p className="p-6 text-error font-data-md text-data-md">{error ?? "Không có dữ liệu."}</p>;
  }

  const c = data.criteria;

  return (
    <div className="flex-1 overflow-auto custom-scrollbar p-4 space-y-4">
      <div className="border-l-2 border-primary bg-primary/10 p-3 text-body-md text-on-surface">
        {data.disclaimer}
      </div>

      <div className="text-data-sm text-on-surface-variant">
        <span className="font-label-caps text-label-caps uppercase">Tiêu chí:</span> ROE ≥{" "}
        {c.roe_min}% (dương mọi năm) · Nợ/VCSH &lt; {c.debt_equity_max} · Biên LN ròng &gt;{" "}
        {c.net_margin_min}% · P/E {c.pe_min}–{c.pe_max} · Vốn hóa &gt; {fmtNumber(c.market_cap_min)}{" "}
        tỷ — {data.count} mã đạt.
      </div>

      {data.count === 0 ? (
        <p className="text-on-surface-variant font-data-md text-data-md py-8 text-center border border-outline-variant border-dashed">
          Chưa có mã nào đạt — cần đồng bộ chỉ số & lịch sử ROE cho toàn thị trường trước.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {data.picks.map((p) => (
            <PickCard
              key={p.symbol}
              pick={p}
              onOpen={onOpenDetail}
              watched={watchlistSymbols?.has(p.symbol) ?? false}
              onToggleWatchlist={onToggleWatchlist}
            />
          ))}
        </div>
      )}
    </div>
  );
}
