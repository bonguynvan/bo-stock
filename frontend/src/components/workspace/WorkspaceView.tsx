"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  SCREENS,
  deletePreset,
  loadPanels,
  loadPresets,
  makePanel,
  savePanels,
  screenMeta,
  upsertPreset,
  type Panel,
  type ScreenId,
  type WorkspacePreset,
} from "@/lib/workspace";
import { useRoomSymbol, setRoomSymbol } from "@/lib/room";
import { IS_DESKTOP } from "@/lib/desktop";
import { openDetached } from "@/lib/desktopWindows";
import WorkspacePanel from "./WorkspacePanel";
import StockDetailView from "../StockDetailView";
import SignalRadarView from "../SignalRadarView";
import MarketsMonitorView from "../MarketsMonitorView";
import SectorsView from "../SectorsView";
import Toast from "../Toast";

interface WorkspaceViewProps {
  onToast?: (msg: string) => void;
}

/** Renders one screen inside a panel. Detail follows the room symbol when linked. */
function ScreenHost({
  panel,
  room,
  onToast,
  onOpenSymbol,
  onClose,
}: {
  panel: Panel;
  room: string;
  onToast: (m: string) => void;
  onOpenSymbol: (s: string) => void;
  onClose: () => void;
}) {
  if (panel.screen === "detail") {
    const sym = panel.linked ? room || panel.symbol : panel.symbol;
    if (!sym) {
      return (
        <div className="h-full grid place-items-center p-6 text-center text-on-surface-variant font-data-md text-data-md">
          Chưa có mã — bật ◉ để theo mã cửa sổ, hoặc mở một mã từ Radar/Movers.
        </div>
      );
    }
    return (
      <div className="p-3">
        <StockDetailView symbol={sym} onBack={onClose} onToast={onToast} />
      </div>
    );
  }
  if (panel.screen === "radar") return <SignalRadarView onOpenSymbol={onOpenSymbol} />;
  if (panel.screen === "pulse") return <MarketsMonitorView onOpenSymbol={onOpenSymbol} />;
  if (panel.screen === "sectors") return <SectorsView />;
  return <div className="p-4 text-on-surface-variant">—</div>;
}

/**
 * In-app MDI workspace — open several screens as floating, draggable, resizable panels at
 * once (radar + a detail + movers side by side). Layout persists; detail panels can follow
 * the shared workspace symbol; any panel can be popped out to a native window (desktop).
 */
export default function WorkspaceView({ onToast }: WorkspaceViewProps) {
  const [panels, setPanels] = useState<Panel[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [presets, setPresets] = useState<WorkspacePreset[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const room = useRoomSymbol();
  const nextZ = useRef(1);
  const areaRef = useRef<HTMLDivElement>(null);

  // Load once on mount (client-only — localStorage).
  useEffect(() => {
    const loaded = loadPanels();
    setPanels(loaded);
    nextZ.current = loaded.reduce((m, p) => Math.max(m, p.z), 0) + 1;
    setPresets(loadPresets());
  }, []);

  // Persist on change (debounced so a drag doesn't hammer localStorage).
  useEffect(() => {
    const t = window.setTimeout(() => savePanels(panels), 300);
    return () => window.clearTimeout(t);
  }, [panels]);

  const showToast = (m: string) => {
    setToast(m);
    onToast?.(m);
    window.setTimeout(() => setToast(null), 2200);
  };

  const patch = (id: string, p: Partial<Panel>) =>
    setPanels((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const raise = (id: string) =>
    setPanels((prev) => prev.map((x) => (x.id === id ? { ...x, z: ++nextZ.current } : x)));
  const close = (id: string) => setPanels((prev) => prev.filter((x) => x.id !== id));

  const add = (screen: ScreenId) => {
    setAddOpen(false);
    setPanels((prev) => {
      const np = makePanel(screen, prev.length, screen === "detail" ? room || undefined : undefined);
      np.z = ++nextZ.current;
      return [...prev, np];
    });
  };

  const saveCurrentPreset = () => {
    const name = window.prompt("Tên bố cục:")?.trim();
    if (!name) return;
    setPresets(upsertPreset(name, panels));
    setPresetsOpen(false);
    showToast(`Đã lưu bố cục “${name}”`);
  };
  const loadPreset = (preset: WorkspacePreset) => {
    const cloned = preset.panels.map((p) => ({ ...p }));
    setPanels(cloned);
    nextZ.current = cloned.reduce((m, p) => Math.max(m, p.z), 0) + 1;
    setPresetsOpen(false);
    showToast(`Đã mở bố cục “${preset.name}”`);
  };
  const removePreset = (name: string) => setPresets(deletePreset(name));

  const openSymbol = (s: string) => {
    setRoomSymbol(s); // linked detail panels follow
    // If no detail panel exists yet, add one so the click is visible.
    setPanels((prev) => {
      if (prev.some((p) => p.screen === "detail")) return prev;
      const np = makePanel("detail", prev.length);
      np.z = ++nextZ.current;
      return [...prev, np];
    });
  };

  const sorted = useMemo(() => [...panels].sort((a, b) => a.z - b.z), [panels]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="p-4 border-b border-outline-variant bg-surface-container-low flex items-start justify-between gap-3">
        <div>
          <h1 className="font-headline-md text-headline-md text-on-surface">Bàn làm việc</h1>
          <p className="text-on-surface-variant font-body-md text-body-md mt-1">
            Mở nhiều màn hình cùng lúc — kéo, đổi kích thước, xếp chồng. Bảng chi tiết có thể
            theo mã chung của bàn làm việc. Chỉ nghiên cứu, không khuyến nghị.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Layouts (presets) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setPresetsOpen((v) => !v)}
              title="Bố cục đã lưu"
              className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-label-caps text-label-caps uppercase hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>bookmarks</span>
              Bố cục
            </button>
            {presetsOpen && (
              <>
                <button
                  type="button"
                  aria-label="Đóng menu"
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setPresetsOpen(false)}
                />
                <div className="absolute right-0 mt-1 z-50 w-64 border border-outline-variant bg-surface-container-high shadow-xl shadow-black/50">
                  <button
                    type="button"
                    onClick={saveCurrentPreset}
                    disabled={panels.length === 0}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined text-primary" style={{ fontSize: "18px" }}>bookmark_add</span>
                    <span className="font-label-caps text-label-caps uppercase">Lưu bố cục hiện tại…</span>
                  </button>
                  {presets.length > 0 && <div className="border-t border-outline-variant/60" />}
                  {presets.map((preset) => (
                    <div key={preset.name} className="flex items-center hover:bg-surface-container">
                      <button
                        type="button"
                        onClick={() => loadPreset(preset)}
                        className="flex-1 flex items-center gap-2 px-3 py-2 text-left text-on-surface-variant hover:text-on-surface transition-colors min-w-0"
                      >
                        <span className="material-symbols-outlined opacity-70" style={{ fontSize: "18px" }}>grid_view</span>
                        <span className="font-data-md text-data-md truncate">{preset.name}</span>
                        <span className="ml-auto text-data-sm opacity-50 shrink-0">{preset.panels.length}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => removePreset(preset.name)}
                        title="Xóa bố cục"
                        aria-label={`Xóa ${preset.name}`}
                        className="h-8 w-8 grid place-items-center text-on-surface-variant hover:text-error transition-colors shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Add panel */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setAddOpen((v) => !v)}
              className="px-3 py-1.5 bg-primary-container text-on-primary font-bold font-label-caps text-label-caps uppercase hover:brightness-110 transition flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>add</span>
              Thêm bảng
            </button>
            {addOpen && (
              <>
                <button
                  type="button"
                  aria-label="Đóng menu"
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setAddOpen(false)}
                />
                <div className="absolute right-0 mt-1 z-50 w-56 border border-outline-variant bg-surface-container-high shadow-xl shadow-black/50">
                  {SCREENS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => add(s.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
                    >
                      <span className="material-symbols-outlined text-primary" style={{ fontSize: "18px" }}>
                        {s.icon}
                      </span>
                      <span className="font-label-caps text-label-caps uppercase">{s.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div ref={areaRef} className="relative flex-1 min-h-0 overflow-hidden bg-background">
        {panels.length === 0 && (
          <div className="absolute inset-0 grid place-items-center text-center px-6">
            <div className="max-w-md">
              <span className="material-symbols-outlined text-on-surface-variant opacity-40" style={{ fontSize: "48px" }}>
                dashboard_customize
              </span>
              <p className="mt-3 font-headline-sm text-headline-sm text-on-surface">Bàn làm việc trống</p>
              <p className="mt-1 text-body-md text-on-surface-variant">
                Bấm “Thêm bảng” để mở Radar, Nhịp thị trường, Ngành hay Chi tiết cổ phiếu —
                rồi kéo/xếp cạnh nhau như một bàn nghiên cứu nhiều màn hình.
              </p>
            </div>
          </div>
        )}

        {sorted.map((p) => {
          const meta = screenMeta(p.screen);
          const effSym = p.screen === "detail" ? (p.linked ? room || p.symbol : p.symbol) : undefined;
          const title =
            p.screen === "detail" ? `${effSym || "—"} · ${meta.label}` : meta.label;
          return (
            <WorkspacePanel
              key={p.id}
              panel={p}
              title={title}
              icon={meta.icon}
              onChange={(patchP) => patch(p.id, patchP)}
              onFocus={() => raise(p.id)}
              onClose={() => close(p.id)}
              getBounds={() => areaRef.current?.getBoundingClientRect() ?? null}
              onDetach={
                IS_DESKTOP && (p.screen !== "detail" || effSym)
                  ? (sx, sy) => {
                      void openDetached(
                        { screen: p.screen, symbol: p.screen === "detail" ? effSym : undefined, title: meta.label },
                        { x: sx - 24, y: sy - 16, w: p.w, h: p.h },
                      );
                      close(p.id);
                    }
                  : undefined
              }
              headerExtra={
                <>
                  {p.screen === "detail" && (
                    <button
                      type="button"
                      onClick={() => patch(p.id, { linked: !p.linked })}
                      title={p.linked ? "Đang theo mã chung — bấm để tách" : "Bấm để theo mã chung"}
                      aria-pressed={p.linked}
                      className={`h-5 w-5 grid place-items-center text-data-sm border transition-colors ${
                        p.linked ? "text-primary border-primary bg-primary/15" : "text-on-surface-variant border-outline-variant hover:text-on-surface"
                      }`}
                    >
                      {p.linked ? "◉" : "○"}
                    </button>
                  )}
                  {IS_DESKTOP && (p.screen === "detail" ? effSym : true) && (
                    <button
                      type="button"
                      onClick={() =>
                        void openDetached({
                          screen: p.screen,
                          symbol: p.screen === "detail" ? effSym : undefined,
                          title: meta.label,
                        })
                      }
                      title="Tách ra cửa sổ riêng"
                      aria-label="Tách ra cửa sổ riêng"
                      className="h-5 w-5 grid place-items-center text-on-surface-variant hover:text-primary transition-colors material-symbols-outlined"
                      style={{ fontSize: "15px" }}
                    >
                      open_in_new
                    </button>
                  )}
                </>
              }
            >
              <ScreenHost
                panel={p}
                room={room}
                onToast={showToast}
                onOpenSymbol={openSymbol}
                onClose={() => close(p.id)}
              />
            </WorkspacePanel>
          );
        })}
      </div>

      <Toast message={toast} />
    </div>
  );
}
