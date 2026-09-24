"use client";

import { useEffect, useState } from "react";
import { getWorldBank } from "@/lib/api";
import type { WbPoint } from "@/types/stock";
import { EMPTY, fmtDecimal } from "@/lib/format";
import { PanelSkeleton } from "@/components/ui/Skeleton";

/** Vietnam country macro (GDP/inflation/…) from the World Bank. Research-only. */
export default function WorldBankPanel() {
  const [points, setPoints] = useState<WbPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getWorldBank()
      .then((data) => !cancelled && setPoints(data))
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
  if (points.length === 0)
    return <p className="p-3 text-data-sm text-on-surface-variant">Chưa có dữ liệu.</p>;

  return (
    <table className="w-full border-collapse">
      <tbody>
        {points.map((p) => (
          <tr key={p.indicator} className="border-b border-outline-variant/50 hover:bg-surface-container-low">
            <td className="pl-3 py-1">
              <span className="font-data-md text-data-md text-on-surface">{p.name}</span>
              <span className="ml-2 font-data-md text-data-sm text-on-surface-variant opacity-50">
                {p.date ?? ""}
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
