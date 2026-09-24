"use client";

import { useEffect, useState } from "react";
import { getAseanGdp } from "@/lib/api";
import type { AseanPoint } from "@/types/stock";
import { EMPTY, fmtDecimal, isNum } from "@/lib/format";
import { PanelSkeleton } from "@/components/ui/Skeleton";

/**
 * Vietnam vs ASEAN peers on GDP growth (World Bank). A mini-bar per country makes
 * the regional standing legible at a glance; Vietnam is highlighted. Research-only.
 */
export default function AseanGdpPanel() {
  const [rows, setRows] = useState<AseanPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAseanGdp()
      .then((data) => !cancelled && setRows(data))
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Lỗi tải dữ liệu");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <PanelSkeleton />;
  if (error) return <p className="p-3 text-data-sm text-error">{error}</p>;
  if (rows.length === 0)
    return <p className="p-3 text-data-sm text-on-surface-variant">Chưa có dữ liệu.</p>;

  const maxVal = Math.max(1, ...rows.map((r) => (isNum(r.value) ? Math.abs(r.value) : 0)));

  return (
    <div className="p-3 space-y-1.5">
      <p className="font-label-caps text-label-caps uppercase text-on-surface-variant opacity-60">
        Tăng trưởng GDP (%/năm) · nguồn World Bank
      </p>
      {rows.map((r) => {
        const isVn = r.country === "VNM";
        const width = isNum(r.value) ? Math.max(2, (Math.abs(r.value) / maxVal) * 100) : 0;
        return (
          <div key={r.country} className="flex items-center gap-2">
            <span
              className={`w-24 shrink-0 font-data-md text-data-md ${isVn ? "text-primary font-bold" : "text-on-surface"}`}
            >
              {r.name}
            </span>
            <div className="flex-1 h-3 bg-surface-container relative">
              <div
                className={`h-full ${isVn ? "bg-primary" : "bg-secondary/60"}`}
                style={{ width: `${width}%` }}
              />
            </div>
            <span className="w-14 shrink-0 text-right font-data-md text-data-md text-on-surface tabular-nums">
              {isNum(r.value) ? fmtDecimal(r.value, 1) : EMPTY}
            </span>
          </div>
        );
      })}
    </div>
  );
}
