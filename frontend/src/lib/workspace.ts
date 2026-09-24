"use client";

// In-app MDI: floating screen panels laid out inside the Workspace view. A panel is a
// lightweight record (which screen + geometry + z-order); the layout persists to
// localStorage so a workspace survives reloads. Detail panels can follow the room symbol.

export type ScreenId = "detail" | "radar" | "pulse" | "sectors";

export interface Panel {
  id: string;
  screen: ScreenId;
  symbol?: string; // for a "detail" panel that is NOT linked to the room symbol
  linked?: boolean; // detail panel follows the workspace (room) symbol
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

export interface ScreenMeta {
  id: ScreenId;
  label: string;
  icon: string;
  symbolScoped?: boolean;
  defaultW: number;
  defaultH: number;
}

export const SCREENS: readonly ScreenMeta[] = [
  { id: "detail", label: "Chi tiết cổ phiếu", icon: "insights", symbolScoped: true, defaultW: 560, defaultH: 620 },
  { id: "radar", label: "Radar tín hiệu", icon: "radar", defaultW: 820, defaultH: 480 },
  { id: "pulse", label: "Nhịp thị trường", icon: "monitoring", defaultW: 720, defaultH: 520 },
  { id: "sectors", label: "Tổng quan ngành", icon: "donut_small", defaultW: 640, defaultH: 460 },
];

export function screenMeta(id: ScreenId): ScreenMeta {
  return SCREENS.find((s) => s.id === id) ?? SCREENS[0];
}

export const MIN_W = 320;
export const MIN_H = 220;

const LS_KEY = "bo.workspace.panels";

export function loadPanels(): Panel[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? (arr as Panel[]) : [];
  } catch {
    return [];
  }
}

export function savePanels(panels: Panel[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(panels));
  } catch {
    /* best-effort */
  }
}

// --- Saved layouts (presets) -----------------------------------------------

export interface WorkspacePreset {
  name: string;
  panels: Panel[];
}

const PRESETS_KEY = "bo.workspace.presets";

export function loadPresets(): WorkspacePreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? (arr as WorkspacePreset[]) : [];
  } catch {
    return [];
  }
}

export function savePresets(list: WorkspacePreset[]): void {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(list));
  } catch {
    /* best-effort */
  }
}

/** Upsert a named preset (overwrites one with the same name). Returns the new list. */
export function upsertPreset(name: string, panels: Panel[]): WorkspacePreset[] {
  const clean = name.trim();
  if (!clean) return loadPresets();
  const list = loadPresets().filter((p) => p.name !== clean);
  // Deep-clone so a later edit to the live layout doesn't mutate the stored preset.
  const next = [...list, { name: clean, panels: panels.map((p) => ({ ...p })) }];
  savePresets(next);
  return next;
}

export function deletePreset(name: string): WorkspacePreset[] {
  const next = loadPresets().filter((p) => p.name !== name);
  savePresets(next);
  return next;
}

/** A fresh panel for a screen, cascaded a little so a new one doesn't hide the last. */
export function makePanel(screen: ScreenId, index: number, symbol?: string): Panel {
  const meta = screenMeta(screen);
  const offset = (index % 6) * 28;
  return {
    id: `${screen}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    screen,
    symbol,
    linked: screen === "detail" ? true : undefined,
    x: 24 + offset,
    y: 24 + offset,
    w: meta.defaultW,
    h: meta.defaultH,
    z: 1,
  };
}
