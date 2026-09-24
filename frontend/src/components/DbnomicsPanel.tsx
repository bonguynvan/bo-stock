"use client";

import { useEffect, useState } from "react";
import { getDbnomics } from "@/lib/api";
import type { DbnPoint } from "@/types/stock";
import { EMPTY, fmtDecimal } from "@/lib/format";
import { PanelSkeleton } from "@/components/ui/Skeleton";

/**
 * Vietnam IMF-WEO macro via DBnomics. WEO values for the current year are IMF
 * estimates; the year is shown per row. Research-only.
 */
export default function DbnomicsPanel() {
  const [points, setPoints] = useState<DbnPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getDbnomics()
      .then((d) => !cancelled && setPoints(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Lỗi tải dữ liệu"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <PanelSkeleton />;
  if (error) return <p className="p-3 text-data-sm text-error">{error}</p>;
  if (points.length === 0)
    return <p className="p-3 text-data-sm text-on-surface-variant">Chưa có dữ liệu.</p>;

  return (
    <table className="w-full border-collapse">
      <tbody>
        {points.map((p) => (
          <tr key={p.code} className="border-b border-outline-variant/50 hover:bg-surface-container-low">
            <td className="pl-3 py-1">
              <span className="font-data-md text-data-md text-on-surface">{p.name}</span>
              <span className="ml-2 font-data-md text-data-sm text-on-surface-variant opacity-50">
                {p.period ?? ""}
              </span>
            </td>
            <td className="pr-3 py-1 text-right font-data-md text-data-md text-on-surface tabular-nums">
              {p.value === null ? EMPTY : fmtDecimal(p.value, 2)}
              <span className="ml-1 text-data-sm text-on-surface-variant opacity-60">{p.unit}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
