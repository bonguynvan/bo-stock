"use client";

import { useEffect, useState } from "react";
import type { PeerComparison as PeerData, PeerMetric } from "@/types/stock";
import { getPeers } from "@/lib/api";

const fmt = (v: number | null): string =>
  v == null ? "—" : v.toLocaleString("vi-VN", { maximumFractionDigits: 2 });

function rankCaption(m: PeerMetric): string | null {
  if (m.value == null || m.percentile == null) return null;
  const share = m.higher_is_better ? m.percentile : 100 - m.percentile;
  const dir = m.higher_is_better ? "Cao hơn" : "Thấp hơn";
  return `${dir} ${share}% công ty cùng ngành`;
}

function PeerBar({ m }: { m: PeerMetric }) {
  if (m.min == null || m.max == null) return null;
  const span = m.max - m.min || 1;
  const pos = (x: number | null) =>
    x == null ? null : Math.max(0, Math.min(100, ((x - m.min!) / span) * 100));
  const lo = pos(m.p25);
  const hi = pos(m.p75);
  const med = pos(m.median);
  const val = pos(m.value);

  return (
    <div className="relative h-2 bg-surface-container-high rounded mt-2">
      {/* interquartile band */}
      {lo != null && hi != null && (
        <div
          className="absolute h-2 bg-secondary/25 rounded"
          style={{ left: `${lo}%`, width: `${Math.max(hi - lo, 1)}%` }}
        />
      )}
      {/* industry median */}
      {med != null && (
        <div
          className="absolute -top-0.5 h-3 w-0.5 bg-on-surface-variant"
          style={{ left: `${med}%` }}
          title={`Trung vị ngành: ${fmt(m.median)}`}
        />
      )}
      {/* this stock */}
      {val != null && (
        <div
          className="absolute -top-1.5 h-5 w-1 bg-primary rounded"
          style={{ left: `${val}%`, transform: "translateX(-50%)" }}
          title={`Mã này: ${fmt(m.value)}`}
        />
      )}
    </div>
  );
}

export default function PeerComparison({ symbol }: { symbol: string }) {
  const [data, setData] = useState<PeerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPeers(symbol)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Lỗi so sánh ngành"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  if (loading) return null;
  if (error) {
    return (
      <p className="text-on-surface-variant text-body-md opacity-70">{error}</p>
    );
  }
  if (!data) return null;

  return (
    <section className="space-y-3">
      <h2 className="font-label-caps text-label-caps text-primary uppercase tracking-widest">
        So sánh ngành — {data.industry} · {data.peer_count} công ty
      </h2>
      {data.peer_count < 5 && (
        <p className="text-data-sm text-on-surface-variant opacity-70">
          ⓘ Ít công ty cùng ngành — so sánh mang tính tham khảo.
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        {data.metrics.map((m) => {
          const caption = rankCaption(m);
          return (
            <div key={m.key} className="space-y-1">
              <div className="flex items-baseline justify-between">
                <span className="font-data-md text-data-md text-on-surface">{m.label}</span>
                <span className="font-data-md text-data-md text-primary">
                  {fmt(m.value)}
                  <span className="text-on-surface-variant text-data-sm">
                    {" "}
                    · TV {fmt(m.median)}
                  </span>
                </span>
              </div>
              <PeerBar m={m} />
              {caption && (
                <div className="text-data-sm text-on-surface-variant opacity-80">{caption}</div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-data-sm text-on-surface-variant opacity-60">
        Vạch vàng = mã này · vạch xám = trung vị ngành · dải = khoảng tứ phân vị (25–75%). Số liệu
        khách quan, không phải khuyến nghị.
      </p>
    </section>
  );
}
