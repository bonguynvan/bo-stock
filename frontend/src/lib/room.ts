"use client";

// The "room" symbol — the ONE active symbol every LINKED window follows. It's the
// multi-window data-communication layer (process-level, not window-level):
//   • In-app: windows share this module instance (plain subscribers).
//   • Across native windows: changes ride a Tauri broadcast (`room:symbol`); a freshly
//     opened window asks peers for the current symbol (`room:symbol:req`) to snap into sync.
//   • Plain browser (no Tauri): single-window — the shared instance is the whole story.
// Linking only routes WHICH symbol a screen shows; the data/fetch path is unchanged.
import { useSyncExternalStore } from "react";
import { canOpenWindows } from "./desktopWindows";

const LS_KEY = "bo.room.symbol";
const EV_SYMBOL = "room:symbol";
const EV_REQ = "room:symbol:req";

function readInitial(): string {
  try {
    return (localStorage.getItem(LS_KEY) || "").trim().toUpperCase();
  } catch {
    return "";
  }
}

let current = typeof window === "undefined" ? "" : readInitial();
const listeners = new Set<() => void>();

/** Apply a symbol locally (state + persistence + notify). NEVER broadcasts — the writer
 *  below decides whether a change also goes on the wire, so peer echoes don't loop. */
function store(s: string): void {
  if (s === current) return;
  current = s;
  try {
    if (s) localStorage.setItem(LS_KEY, s);
    else localStorage.removeItem(LS_KEY);
  } catch {
    /* best-effort persistence */
  }
  listeners.forEach((l) => l());
}

async function broadcast(event: string, payload?: unknown): Promise<void> {
  if (!canOpenWindows()) return;
  try {
    const { emit } = await import("@tauri-apps/api/event");
    await emit(event, payload);
  } catch (e) {
    console.warn("[room] emit failed", e);
  }
}

export function getRoomSymbol(): string {
  return current;
}

/** Set the active room symbol; every linked window (this one + peers, incl. detached) adopts it. */
export function setRoomSymbol(raw: string): void {
  const s = (raw || "").trim().toUpperCase();
  if (s === current) return;
  store(s);
  void broadcast(EV_SYMBOL, { symbol: s });
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** React hook: the live room symbol. */
export function useRoomSymbol(): string {
  return useSyncExternalStore(subscribe, getRoomSymbol, () => "");
}

let syncStarted = false;

/**
 * Join the cross-window room bus (Tauri only). Applies a peer's symbol change locally
 * (no re-broadcast → echo-free), answers a join request with the current symbol, then asks
 * peers for the current one so a just-opened window snaps to it. No-op in a plain browser.
 */
export async function startRoomSync(): Promise<() => void> {
  if (!canOpenWindows() || syncStarted) return () => {};
  syncStarted = true;
  try {
    const { listen, emit } = await import("@tauri-apps/api/event");
    const unSymbol = await listen<{ symbol?: string }>(EV_SYMBOL, (e) => {
      store((e.payload?.symbol || "").trim().toUpperCase());
    });
    const unReq = await listen(EV_REQ, () => {
      if (current) void emit(EV_SYMBOL, { symbol: current });
    });
    void emit(EV_REQ); // snap to peers' current symbol on join
    return () => {
      unSymbol();
      unReq();
      syncStarted = false;
    };
  } catch (e) {
    console.warn("[room] startRoomSync failed", e);
    syncStarted = false;
    return () => {};
  }
}
