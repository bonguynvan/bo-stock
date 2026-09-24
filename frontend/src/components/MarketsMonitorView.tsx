"use client";

import { useState, type ReactNode } from "react";
import { getMovers } from "@/lib/api";
import { usePolling } from "@/lib/usePolling";
import { BreadthBar, MoverList } from "./MoverParts";
import ForeignFlowPanel from "./ForeignFlowPanel";
import SignalRadarView from "./SignalRadarView";
import TabBar, { type TabItem } from "./ui/Tabs";
import { PanelSkeleton, Skeleton } from "@/components/ui/Skeleton";
import { IS_DESKTOP } from "@/lib/desktop";
import { openDetached } from "@/lib/desktopWindows";

const REFRESH_MS = 60_000;

interface MarketsMonitorViewProps {
  onOpenSymbol?: (symbol: string) => void;
}

type Tab = "movers" | "radar" | "foreign";

const TABS: readonly TabItem[] = [
  { id: "movers", label: "Dẫn dắt & Độ rộng", icon: "monitoring" },
  { id: "radar", label: "Radar cờ", icon: "radar" },
  { id: "foreign", label: "Khối ngoại", icon: "public" },
];

function Column({ title, tone, children }: { title: string; tone: string; children: ReactNode }) {
  return (
    <section className="flex flex-col border border-outline-variant bg-surface-container-lowest min-h-0">
      <header className={`px-3 h-8 flex items-center border-b border-outline-variant bg-surface-container-low font-label-caps text-label-caps uppercase tracking-widest ${tone}`}>
        {title}
      </header>
      <div className="flex-1 overflow-auto custom-scrollbar">{children}</div>
    </section>
  );
}

/** Movers + breadth pulse. Only mounts (and polls) when its tab is active. */
function MoversPulse({ onOpenSymbol }: MarketsMonitorViewProps) {
  const { data, error, loading } = usePolling(getMovers, REFRESH_MS);
  return (
    <>
      <div className="p-3 border-b border-outline-variant bg-surface-container-low">
        <div className="max-w-xl">
          {loading && !data ? (
            <Skeleton className="h-6 w-full" />
          ) : error ? (
            <p className="text-data-sm text-error">{error}</p>
          ) : data ? (
            <BreadthBar breadth={data.breadth} />
          ) : null}
        </div>
      </div>
      <div className="flex-1 min-h-0 grid gap-2 p-2 grid-cols-1 lg:grid-cols-3 auto-rows-fr overflow-auto">
        <Column title="▲ Tăng mạnh nhất" tone="text-secondary">
          {loading && !data ? (
            <PanelSkeleton rows={8} />
          ) : (
            <MoverList rows={data?.gainers ?? []} onOpenSymbol={onOpenSymbol} emptyLabel="Cần đồng bộ giá ngày." />
          )}
        </Column>
        <Column title="▼ Giảm mạnh nhất" tone="text-error">
          {loading && !data ? (
            <PanelSkeleton rows={8} />
          ) : (
            <MoverList rows={data?.losers ?? []} onOpenSymbol={onOpenSymbol} emptyLabel="Cần đồng bộ giá ngày." />
          )}
        </Column>
        <Column title="Thanh khoản (KL TB 30N)" tone="text-on-surface-variant">
          {loading && !data ? (
            <PanelSkeleton rows={8} />
          ) : (
            <MoverList rows={data?.most_active ?? []} onOpenSymbol={onOpenSymbol} mode="volume" />
          )}
        </Column>
      </div>
    </>
  );
}

/**
 * VN market pulse hub — one destination, three modes: movers/breadth, the forensic
 * Radar (flagged stocks + latest news), and market-wide foreign flow. Folds the former
 * standalone Radar destination in as a tab. Research-only.
 */
export default function MarketsMonitorView({ onOpenSymbol }: MarketsMonitorViewProps) {
  const [tab, setTab] = useState<Tab>("movers");

  return (
    <>
      <header className="p-4 border-b border-outline-variant bg-surface-container-low flex items-start justify-between gap-3">
        <div>
          <h1 className="font-headline-md text-headline-md text-on-surface">Nhịp thị trường (VN)</h1>
          <p className="text-on-surface-variant font-body-md text-body-md mt-1">
            Độ rộng & mã dẫn dắt, radar cờ pháp y, và dòng tiền khối ngoại — một nơi theo dõi
            sức khỏe thị trường. Chỉ mô tả, không khuyến nghị.
          </p>
        </div>
        {IS_DESKTOP && (
          <button
            type="button"
            onClick={() => void openDetached({ screen: "pulse", title: "Nhịp thị trường" })}
            title="Mở Nhịp thị trường trong cửa sổ riêng"
            aria-label="Mở cửa sổ riêng"
            className="shrink-0 px-3 py-1.5 border border-outline-variant text-on-surface-variant font-label-caps text-label-caps uppercase hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>open_in_new</span>
            Cửa sổ riêng
          </button>
        )}
      </header>

      <TabBar tabs={TABS} active={tab} onChange={(id) => setTab(id as Tab)} ariaLabel="Chế độ nhịp thị trường" />

      {tab === "movers" ? (
        <MoversPulse onOpenSymbol={onOpenSymbol} />
      ) : tab === "radar" ? (
        <SignalRadarView onOpenSymbol={onOpenSymbol} />
      ) : (
        <section className="flex-1 min-h-0 flex flex-col m-2 border border-outline-variant bg-surface-container-lowest overflow-hidden">
          <div className="px-3 h-8 flex items-center border-b border-outline-variant bg-surface-container-low font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant">
            Khối ngoại (toàn thị trường)
          </div>
          <div className="flex-1 overflow-auto custom-scrollbar">
            <ForeignFlowPanel />
          </div>
        </section>
      )}
    </>
  );
}
