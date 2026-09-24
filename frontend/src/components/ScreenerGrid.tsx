"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CompassScoresMap, StockResult } from "@/types/stock";
import { buildScreenerGridConfig } from "@/lib/screenerGrid";
import BoGrid from "./BoGrid";

interface ScreenerGridProps {
  stocks: StockResult[];
  compassScores: CompassScoresMap;
  loading: boolean;
  error: string | null;
  filter?: string;
  onSelect: (symbol: string) => void;
  onToggleWatchlist?: (symbol: string) => void;
  watchlistSymbols?: ReadonlySet<string>;
}

export default function ScreenerGrid({
  stocks,
  compassScores,
  loading,
  error,
  filter,
  onSelect,
  onToggleWatchlist,
  watchlistSymbols,
}: ScreenerGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(500);

  // bo-grid's `height` is the SCROLL-VIEWPORT height; it adds its own chrome
  // (group header + header + pager + borders) on top. Subtract that so the whole
  // element — including the pager at the bottom — fits the container.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const CHROME = 104;
    const measure = () => setHeight(Math.max(240, (el.clientHeight || 600) - CHROME));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const config = useMemo(
    () =>
      buildScreenerGridConfig(
        stocks,
        compassScores,
        { onRowClick: onSelect, onToggleWatchlist, watchlistSymbols },
        { height, loading, filter },
      ),
    [stocks, compassScores, onSelect, onToggleWatchlist, watchlistSymbols, height, loading, filter],
  );

  if (error) {
    return (
      <section className="flex-1 flex flex-col items-center justify-center gap-2 bg-background text-center px-4">
        <span className="material-symbols-outlined text-error" style={{ fontSize: "32px" }}>
          error
        </span>
        <p className="text-error font-data-md text-data-md">{error}</p>
        <p className="text-on-surface-variant text-body-md">
          Đảm bảo máy chủ API đang chạy tại NEXT_PUBLIC_API_URL.
        </p>
      </section>
    );
  }

  return (
    <section ref={containerRef} className="flex-1 bg-background overflow-hidden min-h-0">
      <BoGrid config={config} />
    </section>
  );
}
