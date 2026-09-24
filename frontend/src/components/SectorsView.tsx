"use client";

import { useEffect, useMemo, useState } from "react";
import type { SectorRow, SectorsOverview } from "@/types/stock";
import { getSectorsOverview } from "@/lib/api";
import { changeColor, EMPTY, fmtDecimal, fmtNumber, fmtPercent } from "@/lib/format";
import SectorHeatmapPanel from "./SectorHeatmapPanel";

type SortKey = keyof Pick<
  SectorRow,
  "count" | "total_market_cap" | "median_pe" | "median_pb" | "median_roe" | "avg_change_pct"
>;

const COLUMNS: { key: SortKey; label: string; kind: "num" | "pct" | "roe" }[] = [
  { key: "count", label: "Số mã", kind: "num" },
  { key: "total_market_cap", label: "Vốn hóa (tỷ)", kind: "num" },
  { key: "median_pe", label: "P/E TV", kind: "num" },
  { key: "median_pb", label: "P/B TV", kind: "num" },
  { key: "median_roe", label: "ROE TV %", kind: "roe" },
  { key: "avg_change_pct", label: "% Ngày TB", kind: "pct" },
];

function cell(row: SectorRow, key: SortKey, kind: "num" | "pct" | "roe") {
  const v = row[key];
  if (v == null) return <span className="text-on-surface-variant opacity-50">{EMPTY}</span>;
  if (kind === "pct") return <span className={changeColor(v)}>{fmtPercent(v)}</span>;
  if (key === "count" || key === "total_market_cap") return fmtNumber(v);
  return fmtDecimal(v, key === "median_roe" ? 1 : 2);
}

export default function SectorsView() {
  const [data, setData] = useState<SectorsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("total_market_cap");
  const [asc, setAsc] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getSectorsOverview()
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Lỗi tải ngành"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data.sectors].sort((a, b) => {
      const av = a[sortKey] ?? -Infinity;
      const bv = b[sortKey] ?? -Infinity;
      return asc ? av - bv : bv - av;
    });
  }, [data, sortKey, asc]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(false);
    }
  }

  if (loading) {
    return <p className="p-6 text-on-surface-variant font-data-md text-data-md">Đang tải ngành…</p>;
  }
  if (error || !data) {
    return <p className="p-6 text-error font-data-md text-data-md">{error ?? "Không có dữ liệu."}</p>;
  }

  return (
    <div className="flex-1 overflow-auto custom-scrollbar p-4">
      <p className="text-on-surface-variant text-body-md mb-3 border-l-2 border-primary pl-3">
        Tổng quan {data.count} ngành — số liệu trung vị trên các mã đã đồng bộ. Chỉ mô tả, không
        khuyến nghị.
        {!data.change_available && (
          <> % Ngày TB trống cho tới khi chạy đồng bộ giá/khối lượng.</>
        )}
      </p>

      <section className="mb-4 border border-outline-variant bg-surface-container-lowest">
        <header className="flex items-center gap-2 px-3 h-8 border-b border-outline-variant bg-surface-container-low">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: "16px" }}>
            grid_view
          </span>
          <h2 className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface">
            Bản đồ nhiệt ngành
          </h2>
        </header>
        <SectorHeatmapPanel data={data} />
      </section>

      <table className="w-full text-left font-data-md text-data-md">
        <thead className="font-label-caps text-label-caps text-on-surface-variant uppercase border-b border-outline-variant">
          <tr>
            <th className="py-2 pr-2">Ngành</th>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                onClick={() => toggleSort(c.key)}
                className="py-2 px-2 text-right cursor-pointer hover:text-primary select-none"
              >
                {c.label}
                {sortKey === c.key && <span>{asc ? " ▲" : " ▼"}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant">
          {sorted.map((row) => (
            <tr key={row.industry} className="hover:bg-surface-container-high">
              <td className="py-2 pr-2 text-on-surface truncate max-w-[240px]">{row.industry}</td>
              {COLUMNS.map((c) => (
                <td key={c.key} className="py-2 px-2 text-right">
                  {cell(row, c.key, c.kind)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
