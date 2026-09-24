"use client";

import { useEffect, useState } from "react";
import { getMacro } from "@/lib/api";
import type { MacroPoint } from "@/types/stock";
import { EMPTY, fmtNumber } from "@/lib/format";
import { PanelSkeleton } from "@/components/ui/Skeleton";

/**
 * Global macro context (FRED). Freemium source: needs FRED_API_KEY — when unset the
 * panel degrades gracefully to a setup note instead of erroring. Research-only.
 */
export default function MacroPanel() {
  const [points, setPoints] = useState<MacroPoint[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMacro()
      .then((res) => {
        if (cancelled) return;
        setPoints(res.points);
        setNote(res.configured ? null : res.note ?? "Chưa cấu hình nguồn vĩ mô.");
      })
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
  if (note) {
    return (
      <div className="p-3 space-y-1">
        <p className="text-data-sm text-on-surface-variant">{note}</p>
        <p className="text-data-sm text-on-surface-variant opacity-60">
          Đặt <code className="text-primary">FRED_API_KEY</code> trong .env backend để bật.
        </p>
      </div>
    );
  }

  return (
    <table className="w-full border-collapse">
      <tbody>
        {points.map((p) => (
          <tr key={p.series_id} className="border-b border-outline-variant/50 hover:bg-surface-container-low">
            <td className="pl-3 py-1">
              <span className="font-data-md text-data-md text-on-surface">{p.name}</span>
              <span className="ml-2 font-data-md text-data-sm text-on-surface-variant opacity-50">
                {p.date ?? ""}
              </span>
            </td>
            <td className="pr-3 py-1 text-right font-data-md text-data-md text-on-surface tabular-nums">
              {p.value === null ? EMPTY : fmtNumber(p.value, 2)}
              <span className="ml-1 text-data-sm text-on-surface-variant opacity-60">
                {p.unit === "%" ? "%" : p.unit === "index" ? "" : ` ${p.unit}`}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
