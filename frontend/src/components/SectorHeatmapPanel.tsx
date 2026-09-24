"use client";

import { useEffect, useMemo, useState } from "react";
import type { SectorsOverview } from "@/types/stock";
import { getSectorsOverview } from "@/lib/api";
import { EMPTY, fmtPercent, isNum } from "@/lib/format";
import { heatColor, tileWeight } from "@/lib/heatmap";
import { GridSkeleton } from "@/components/ui/Skeleton";

interface SectorHeatmapPanelProps {
  onSelectSector?: (industry: string) => void;
  /** When provided, use it instead of self-fetching (SectorsView already has it). */
  data?: SectorsOverview | null;
}

/**
 * VN sector heatmap — a treemap-ish grid: tile size ∝ sector market cap, color ∝
 * average day change (green up / red down). Research-only; reuses /meta/sectors.
 */
export default function SectorHeatmapPanel({ onSelectSector, data: propData }: SectorHeatmapPanelProps) {
  const [fetched, setFetched] = useState<SectorsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(propData == null);
  const data = propData ?? fetched;

  useEffect(() => {
    if (propData != null) return; // parent supplied the data
    let cancelled = false;
    getSectorsOverview()
      .then((d) => !cancelled && setFetched(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Lỗi tải ngành"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [propData]);

  const { tiles, maxCap } = useMemo(() => {
    const sectors = [...(data?.sectors ?? [])].sort(
      (a, b) => (b.total_market_cap ?? 0) - (a.total_market_cap ?? 0),
    );
    return { tiles: sectors, maxCap: sectors[0]?.total_market_cap ?? 0 };
  }, [data]);

  if (loading) return <GridSkeleton count={12} />;
  if (error) return <p className="p-3 text-data-sm text-error">{error}</p>;
  if (tiles.length === 0)
    return <p className="p-3 text-data-sm text-on-surface-variant">Chưa có dữ liệu ngành.</p>;

  return (
    <div className="p-2">
      {data && !data.change_available && (
        <p className="mb-2 text-data-sm text-on-surface-variant opacity-70">
          Màu trung tính — cần sync giá ngày để tô nhiệt theo % thay đổi.
        </p>
      )}
      <div className="flex flex-wrap gap-1">
        {tiles.map((s) => {
          const Tag = onSelectSector ? "button" : "div";
          return (
            <Tag
              key={s.industry}
              {...(onSelectSector ? { type: "button", onClick: () => onSelectSector(s.industry) } : {})}
              title={`${s.industry} · ${s.count} mã`}
              style={{
                flexGrow: tileWeight(s.total_market_cap, maxCap),
                flexBasis: 0,
                backgroundColor: heatColor(s.avg_change_pct),
              }}
              className="min-w-[96px] h-16 border border-outline-variant p-1.5 flex flex-col justify-between text-left overflow-hidden hover:border-primary transition-colors"
            >
              <span className="font-data-md text-data-sm text-on-surface leading-tight line-clamp-2">
                {s.industry}
              </span>
              <span className="font-data-md text-data-md tabular-nums text-on-surface">
                {isNum(s.avg_change_pct) ? fmtPercent(s.avg_change_pct, 2, true) : EMPTY}
              </span>
            </Tag>
          );
        })}
      </div>
    </div>
  );
}
