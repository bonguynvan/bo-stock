"use client";

import { useEffect, useState } from "react";
import ScreenerApp from "./ScreenerApp";
import DetachedView from "./DetachedView";
import { readDetach } from "@/lib/desktopWindows";
import { startRoomSync } from "@/lib/room";

/**
 * Picks the window's role from its URL: a detached window (?view=detach) renders a single
 * frameless screen; every other window is the full terminal shell. Decided after mount so
 * the static-prerendered HTML (no window/query) and the client agree — avoids a hydration
 * mismatch.
 */
export default function AppRouter() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Every window joins the cross-window room bus so linked windows share the active symbol.
  useEffect(() => {
    let stop: (() => void) | undefined;
    void startRoomSync().then((fn) => {
      stop = fn;
    });
    return () => stop?.();
  }, []);
  if (!mounted) return null;
  return readDetach() ? <DetachedView /> : <ScreenerApp />;
}
