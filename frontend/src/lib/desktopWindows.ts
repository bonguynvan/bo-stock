"use client";

// Multi-window (Tauri) — open independent terminal windows or pop a stock onto a second
// monitor. Modeled on the detach-to-window pattern: ONE backend, many thin native windows
// that load the SAME app bundle with a ?symbol= / ?view= deep-link and render from there.
import { IS_DESKTOP } from "./desktop";

let seq = 0;

/** True only inside the Tauri shell — multi-window needs the native window API (a plain
 *  browser can't). Combines the build flag with a runtime check for the injected bridge. */
export function canOpenWindows(): boolean {
  return (
    IS_DESKTOP && typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
  );
}

/**
 * Resolve true once a freshly-created window exists (`tauri://created`), false on
 * `tauri://error`. A short timeout resolves true, since `once()` attaches asynchronously
 * and can miss a fast `created`. The WebviewWindow constructor NEVER throws — creation runs
 * async in the Rust core — so this is how we actually confirm the window opened.
 */
function awaitCreated(
  w: { once: (e: string, cb: (p: unknown) => void) => Promise<unknown> },
  tag: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (!settled) {
        settled = true;
        resolve(ok);
      }
    };
    void w.once("tauri://created", () => done(true));
    void w.once("tauri://error", (e) => {
      console.error(`${tag} window failed to create`, (e as { payload?: unknown })?.payload ?? e);
      done(false);
    });
    setTimeout(() => done(true), 2500);
  });
}

export interface OpenWindowParams {
  /** Deep-link straight to a stock's detail view. Windows dedupe by symbol (focus, not open). */
  symbol?: string;
  /** Deep-link to a specific terminal view (e.g. "radar", "screener", "portfolio"). */
  view?: string;
}

/**
 * Open (or focus) a terminal window. No-op → false outside the Tauri shell.
 *
 * A symbol window uses a deterministic label (`detail-HPG`) so re-opening the same stock
 * focuses the existing window instead of spawning duplicates; a plain new window gets a
 * unique label. The new window loads the app bundle and ScreenerApp reads the deep-link.
 */
export async function openAppWindow(params: OpenWindowParams = {}): Promise<boolean> {
  if (!canOpenWindows()) return false;
  try {
    const { WebviewWindow, getAllWebviewWindows } = await import("@tauri-apps/api/webviewWindow");
    const symbol = params.symbol?.toUpperCase().replace(/[^A-Z0-9]/g, "") || undefined;

    // Focus an existing window for this symbol rather than duplicating it.
    const label = symbol ? `detail-${symbol}` : `app-${Date.now()}-${seq++}`;
    if (symbol) {
      const existing = (await getAllWebviewWindows()).find((x) => x.label === label);
      if (existing) {
        await existing.setFocus();
        return true;
      }
    }

    const qs = new URLSearchParams();
    if (symbol) qs.set("symbol", symbol);
    if (params.view) qs.set("view", params.view);
    const query = qs.toString();

    const w = new WebviewWindow(label, {
      url: `/app/${query ? `?${query}` : ""}`,
      title: symbol ? `${symbol} — V-Investment OS` : "V-Investment OS — Quant Terminal",
      width: symbol ? 1200 : 1440,
      height: 860,
      minWidth: 900,
      minHeight: 640,
      resizable: true,
      center: true,
    });
    return await awaitCreated(w, "[window]");
  } catch (e) {
    console.error("[window] openAppWindow failed", e);
    return false;
  }
}

// --- Detach-to-window (frameless single-screen windows) ---------------------
// A detached window loads the SAME app bundle with ?view=detach&screen=…&symbol=… and
// renders ONE screen in a frameless window with its own slim title bar. Windows are
// independent (each fetches from the backend on its own) — no shared JS state needed.

export interface DetachParams {
  /** Which screen to render: "detail" (needs symbol) | "radar" | "pulse". */
  screen: string;
  symbol?: string;
  title?: string;
}

/** Parse this window's URL → detached-screen params, or null for a normal (shell) window. */
export function readDetach(): DetachParams | null {
  if (typeof window === "undefined") return null;
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get("view") !== "detach") return null;
    return {
      screen: q.get("screen") ?? "",
      symbol: q.get("symbol")?.toUpperCase() || undefined,
      title: q.get("title") ?? undefined,
    };
  } catch {
    return null;
  }
}

/** Open (or focus) a frameless detached window for one screen. Deduped by screen+symbol.
 *  ``pos`` (screen coords) places the window at a drop point (drag-to-detach); else centered. */
export async function openDetached(
  p: DetachParams,
  pos?: { x: number; y: number; w?: number; h?: number },
): Promise<boolean> {
  if (!canOpenWindows()) return false;
  try {
    const { WebviewWindow, getAllWebviewWindows } = await import("@tauri-apps/api/webviewWindow");
    const sym = p.symbol?.toUpperCase().replace(/[^A-Z0-9]/g, "") || undefined;
    const label = `detach-${p.screen}${sym ? `-${sym}` : ""}`.replace(/[^A-Za-z0-9-]/g, "");
    const existing = (await getAllWebviewWindows()).find((x) => x.label === label);
    if (existing) {
      await existing.setFocus();
      return true;
    }
    const qs = new URLSearchParams({ view: "detach", screen: p.screen });
    if (sym) qs.set("symbol", sym);
    if (p.title) qs.set("title", p.title);
    const w = new WebviewWindow(label, {
      url: `/app/?${qs.toString()}`,
      title: sym ? `${sym} — ${p.title ?? "V-Investment OS"}` : (p.title ?? "V-Investment OS"),
      width: Math.max(480, Math.round(pos?.w ?? 1080)),
      height: Math.max(360, Math.round(pos?.h ?? 800)),
      minWidth: 480,
      minHeight: 360,
      decorations: false, // frameless — DetachedView draws its own slim title bar
      resizable: true,
      ...(pos ? { x: Math.round(pos.x), y: Math.round(pos.y) } : { center: true }),
    });
    return await awaitCreated(w, "[detach]");
  } catch (e) {
    console.error("[detach] openDetached failed", e);
    return false;
  }
}

/** Close the CURRENT window (used by a detached window's ✕). */
export async function closeSelf(): Promise<void> {
  if (!canOpenWindows()) return;
  try {
    const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    await getCurrentWebviewWindow().close();
  } catch (e) {
    console.error("[detach] closeSelf failed", e);
  }
}

/** Tauri event a detached window emits to ask the MAIN window to open the screen/symbol. */
export const DOCK_EVENT = "bo://dock";

/** Dock a detached screen back into the main window: tell it to open this screen/symbol,
 *  focus it, then close this window. */
export async function dockToMain(p: DetachParams): Promise<void> {
  if (!canOpenWindows()) return;
  try {
    const { getAllWebviewWindows } = await import("@tauri-apps/api/webviewWindow");
    const { emit } = await import("@tauri-apps/api/event");
    await emit(DOCK_EVENT, p);
    const main = (await getAllWebviewWindows()).find((x) => x.label === "main");
    if (main) await main.setFocus();
    await closeSelf();
  } catch (e) {
    console.error("[detach] dockToMain failed", e);
  }
}

/** Main window: listen for dock-back requests. Returns an unlisten fn (no-op on web). */
export async function listenForDock(handler: (p: DetachParams) => void): Promise<() => void> {
  if (!canOpenWindows()) return () => {};
  try {
    const { listen } = await import("@tauri-apps/api/event");
    return await listen<DetachParams>(DOCK_EVENT, (e) => handler(e.payload));
  } catch (e) {
    console.error("[detach] listenForDock failed", e);
    return () => {};
  }
}
