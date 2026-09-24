"use client";

import { getMovers } from "@/lib/api";
import { usePolling } from "@/lib/usePolling";
import { BreadthBar, MoverList } from "./MoverParts";
import { PanelSkeleton } from "@/components/ui/Skeleton";

interface MarketPulsePanelProps {
  onOpenSymbol?: (symbol: string) => void;
}

/** Compact dashboard tile: market breadth + top 3 gainers/losers. */
export default function MarketPulsePanel({ onOpenSymbol }: MarketPulsePanelProps) {
  const { data, error, loading } = usePolling(getMovers, 60_000);

  if (loading && !data) return <PanelSkeleton rows={4} />;
  if (!data) return <p className="p-3 text-data-sm text-error">{error ?? "Lỗi tải dữ liệu."}</p>;

  return (
    <div className="flex flex-col min-h-0">
      <div className="p-2 border-b border-outline-variant/50">
        <BreadthBar breadth={data.breadth} />
      </div>
      <div className="flex-1 grid grid-cols-2 min-h-0">
        <div className="border-r border-outline-variant/50 min-h-0 overflow-auto custom-scrollbar">
          <div className="px-3 pt-1 font-label-caps text-label-caps uppercase text-secondary">▲ Tăng</div>
          <MoverList rows={data.gainers.slice(0, 5)} onOpenSymbol={onOpenSymbol} emptyLabel="—" />
        </div>
        <div className="min-h-0 overflow-auto custom-scrollbar">
          <div className="px-3 pt-1 font-label-caps text-label-caps uppercase text-error">▼ Giảm</div>
          <MoverList rows={data.losers.slice(0, 5)} onOpenSymbol={onOpenSymbol} emptyLabel="—" />
        </div>
      </div>
    </div>
  );
}
