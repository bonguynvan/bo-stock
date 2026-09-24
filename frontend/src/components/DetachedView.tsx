"use client";

import { useState } from "react";
import {
  readDetach,
  closeSelf,
  dockToMain,
  openDetached,
  type DetachParams,
} from "@/lib/desktopWindows";
import { useRoomSymbol, setRoomSymbol } from "@/lib/room";
import StockDetailView from "./StockDetailView";
import SignalRadarView from "./SignalRadarView";
import MarketsMonitorView from "./MarketsMonitorView";
import SectorsView from "./SectorsView";
import Toast from "./Toast";

const SCREEN_TITLE: Record<string, string> = {
  detail: "Chi tiết cổ phiếu",
  radar: "Radar tín hiệu",
  pulse: "Nhịp thị trường",
  sectors: "Tổng quan ngành",
};

/**
 * The whole UI of a detached OS window: a slim frameless title bar (drag region + dock +
 * close) over ONE screen. Independent of the main window — it fetches from the backend on
 * its own, so no shared JS state is needed. Research-only, like every other surface.
 */
export default function DetachedView() {
  // Fixed for this window's lifetime (read from its URL) — not reactive.
  const p: DetachParams = readDetach() ?? { screen: "" };
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2500);
  };
  const heading = p.title || SCREEN_TITLE[p.screen] || p.screen || "Cửa sổ";

  // A detail window can LINK to the workspace symbol — then it follows whatever stock the
  // main window (or another linked window) is showing. Default linked; falls back to its own.
  const room = useRoomSymbol();
  const [linked, setLinked] = useState(true);
  const isDetail = p.screen === "detail";
  const effectiveSymbol = isDetail ? (linked && room ? room : (p.symbol ?? "")) : "";

  // From a detached radar/pulse, opening a symbol pops it into ITS OWN detached window AND
  // sets the workspace symbol so linked detail windows follow.
  const openSymbol = (s: string) => {
    setRoomSymbol(s);
    void openDetached({ screen: "detail", symbol: s, title: "Chi tiết cổ phiếu" });
  };

  return (
    <div className="h-screen flex flex-col bg-surface-container-lowest">
      {/* Slim frameless title bar — the whole bar drags the OS window; buttons opt out. */}
      <header
        data-tauri-drag-region
        className="h-8 shrink-0 flex items-center gap-2 px-2 bg-surface-container-low border-b border-outline-variant select-none"
      >
        {isDetail && (
          <button
            type="button"
            onClick={() => setLinked((v) => !v)}
            title={
              linked
                ? "Đang liên kết với mã của cửa sổ chính — bấm để tách riêng"
                : "Chưa liên kết — bấm để theo mã của cửa sổ chính"
            }
            aria-pressed={linked}
            aria-label="Liên kết mã với cửa sổ chính"
            className={`h-5 w-5 grid place-items-center text-data-sm border transition-colors ${
              linked
                ? "text-primary border-primary bg-primary/15"
                : "text-on-surface-variant border-outline-variant hover:text-on-surface"
            }`}
          >
            {linked ? "◉" : "○"}
          </button>
        )}
        <span data-tauri-drag-region className="font-label-caps text-label-caps uppercase text-on-surface-variant truncate">
          {isDetail ? `${effectiveSymbol || "—"} · ` : p.symbol ? `${p.symbol} · ` : ""}
          {heading}
        </span>
        <span data-tauri-drag-region className="flex-1 h-full" />
        <button
          type="button"
          onClick={() => void dockToMain({ ...p, symbol: isDetail ? effectiveSymbol : p.symbol })}
          title="Đưa màn hình này về cửa sổ chính"
          className="h-5 px-2 grid place-items-center border border-outline-variant text-on-surface-variant text-data-sm hover:border-primary hover:text-primary transition-colors"
        >
          ⇤ Về cửa sổ chính
        </button>
        <button
          type="button"
          onClick={() => void closeSelf()}
          title="Đóng cửa sổ"
          aria-label="Đóng"
          className="h-5 w-5 grid place-items-center text-on-surface-variant hover:bg-error hover:text-white transition-colors"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
        {isDetail && effectiveSymbol ? (
          <div className="p-4">
            <StockDetailView symbol={effectiveSymbol} onBack={() => void closeSelf()} onToast={showToast} />
          </div>
        ) : p.screen === "radar" ? (
          <SignalRadarView onOpenSymbol={openSymbol} />
        ) : p.screen === "pulse" ? (
          <MarketsMonitorView onOpenSymbol={openSymbol} />
        ) : p.screen === "sectors" ? (
          <SectorsView />
        ) : (
          <div className="p-6 text-on-surface-variant font-data-md text-data-md">
            Màn hình không xác định: <code className="text-error">{p.screen || "—"}</code>
          </div>
        )}
      </div>

      <Toast message={toast} />
    </div>
  );
}
