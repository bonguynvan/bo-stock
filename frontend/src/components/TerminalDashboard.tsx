"use client";

import { useEffect, useState, type ReactNode } from "react";
import { getDashboardLayout, updateDashboardLayout } from "@/lib/api";
import {
  DEFAULT_TILE_KEYS,
  TILE_BY_KEY,
  hiddenTiles,
  moveTile,
  normalizeTiles,
} from "@/lib/dashboardTiles";
import TerminalPanel from "./TerminalPanel";
import WorldMarketsPanel from "./WorldMarketsPanel";
import MarketMoversPanel from "./MarketMoversPanel";
import WatchlistSnapshotPanel from "./WatchlistSnapshotPanel";
import CryptoPanel from "./CryptoPanel";
import MacroPanel from "./MacroPanel";
import FxPanel from "./FxPanel";
import WorldBankPanel from "./WorldBankPanel";
import CommoditiesPanel from "./CommoditiesPanel";
import AseanGdpPanel from "./AseanGdpPanel";
import NewsTerminalPanel from "./NewsTerminalPanel";
import SectorHeatmapPanel from "./SectorHeatmapPanel";
import MarketPulsePanel from "./MarketPulsePanel";
import DbnomicsPanel from "./DbnomicsPanel";
import ForeignFlowPanel from "./ForeignFlowPanel";

interface TerminalDashboardProps {
  onOpenSymbol: (symbol: string) => void;
  onCommand: (code: string) => void;
}

/**
 * Terminal HOME — a customizable multi-panel dashboard. The visible tiles and
 * their order persist per user via GET/PUT /dashboard/layout. Research-only.
 */
export default function TerminalDashboard({ onOpenSymbol, onCommand }: TerminalDashboardProps) {
  const [tiles, setTiles] = useState<string[]>([...DEFAULT_TILE_KEYS]);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getDashboardLayout()
      .then((layout) => {
        if (!cancelled) setTiles(normalizeTiles(layout.tiles));
      })
      .catch(() => {
        /* keep the default layout */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = (next: string[]) => {
    setTiles(next);
    updateDashboardLayout(next).catch(() => {
      /* optimistic; a failed save just isn't persisted */
    });
  };

  const bodyFor = (key: string): ReactNode => {
    switch (key) {
      case "world":
        return <WorldMarketsPanel />;
      case "movers":
        return <MarketMoversPanel onOpenSymbol={onOpenSymbol} />;
      case "watchlist":
        return <WatchlistSnapshotPanel onOpenSymbol={onOpenSymbol} />;
      case "crypto":
        return <CryptoPanel />;
      case "macro":
        return <MacroPanel />;
      case "fx":
        return <FxPanel />;
      case "worldbank":
        return <WorldBankPanel />;
      case "commodities":
        return <CommoditiesPanel />;
      case "asean":
        return <AseanGdpPanel />;
      case "news":
        return <NewsTerminalPanel />;
      case "sectorheat":
        return <SectorHeatmapPanel onSelectSector={() => onCommand("SECTOR")} />;
      case "pulse":
        return <MarketPulsePanel onOpenSymbol={onOpenSymbol} />;
      case "dbnomics":
        return <DbnomicsPanel />;
      case "foreign":
        return <ForeignFlowPanel />;
      default:
        return null;
    }
  };

  const hidden = hiddenTiles(tiles);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <div className="flex items-center justify-between px-4 h-9 border-b border-outline-variant bg-surface-container-low shrink-0">
        <span className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant">
          Terminal · Bảng điều khiển
        </span>
        <div className="flex items-center gap-3">
          {!editing && (
            <span className="hidden md:inline font-data-md text-data-sm text-on-surface-variant opacity-70">
              <kbd className="border border-outline-variant px-1">Ctrl</kbd>+
              <kbd className="border border-outline-variant px-1">K</kbd> ·{" "}
              <kbd className="border border-outline-variant px-1">/</kbd> thanh lệnh
            </span>
          )}
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className={`flex items-center gap-1 px-2 py-0.5 border font-label-caps text-label-caps uppercase transition-colors ${
              editing
                ? "border-primary text-primary"
                : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"
            }`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
              {editing ? "check" : "tune"}
            </span>
            {editing ? "Xong" : "Tùy chỉnh"}
          </button>
        </div>
      </div>

      {editing && hidden.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap px-4 py-2 border-b border-outline-variant bg-surface-container-lowest">
          <span className="font-label-caps text-label-caps uppercase text-on-surface-variant opacity-70">
            Thêm panel:
          </span>
          {hidden.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => persist([...tiles, t.key])}
              className="flex items-center gap-1 px-2 py-0.5 border border-outline-variant hover:border-primary hover:text-primary font-data-md text-data-sm text-on-surface transition-colors"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                add
              </span>
              {t.title}
            </button>
          ))}
        </div>
      )}

      {tiles.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-on-surface-variant font-data-md text-data-sm">
          {editing ? "Chọn panel để thêm ở trên." : 'Bảng trống — bấm "Tùy chỉnh" để thêm panel.'}
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid gap-2 p-2 grid-cols-1 lg:grid-cols-3 auto-rows-fr overflow-auto">
          {tiles.map((key) => {
            const meta = TILE_BY_KEY[key];
            if (!meta) return null;
            return (
              <TerminalPanel
                key={key}
                title={meta.title}
                icon={meta.icon}
                code={meta.expand}
                onExpand={() => onCommand(meta.expand)}
                editing={editing}
                onMovePrev={() => persist(moveTile(tiles, key, -1))}
                onMoveNext={() => persist(moveTile(tiles, key, 1))}
                onHide={() => persist(tiles.filter((k) => k !== key))}
              >
                {bodyFor(key)}
              </TerminalPanel>
            );
          })}
        </div>
      )}
    </div>
  );
}
