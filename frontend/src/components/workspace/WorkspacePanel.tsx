"use client";

import { useRef, useState, type ReactNode } from "react";
import type { Panel } from "@/lib/workspace";
import { MIN_H, MIN_W } from "@/lib/workspace";

interface WorkspacePanelProps {
  panel: Panel;
  title: string;
  icon: string;
  onChange: (patch: Partial<Panel>) => void;
  onFocus: () => void;
  onClose: () => void;
  /** Workspace area rect (client coords) — dragging the title bar OUT of it detaches. */
  getBounds?: () => DOMRect | null;
  /** Drop-outside → tear this panel into a native window at the given screen coords. */
  onDetach?: (screenX: number, screenY: number) => void;
  /** Extra controls in the title bar (e.g. link toggle, pop-out). */
  headerExtra?: ReactNode;
  children: ReactNode;
}

/**
 * A floating MDI frame: drag by the title bar, resize from the SE handle, click to raise.
 * Pointer-capture based so a fast drag doesn't "slip" off the element. Compositor-friendly
 * (transform-free absolute positioning; geometry lives in state, persisted by the parent).
 */
export default function WorkspacePanel({
  panel,
  title,
  icon,
  onChange,
  onFocus,
  onClose,
  getBounds,
  onDetach,
  headerExtra,
  children,
}: WorkspacePanelProps) {
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const resize = useRef<{ px: number; py: number; ow: number; oh: number } | null>(null);
  const [detaching, setDetaching] = useState(false);

  const outside = (cx: number, cy: number): boolean => {
    const r = getBounds?.();
    if (!r) return false;
    return cx < r.left || cx > r.right || cy < r.top || cy > r.bottom;
  };

  const onDragDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    onFocus();
    drag.current = { px: e.clientX, py: e.clientY, ox: panel.x, oy: panel.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    // Drag out of the workspace area → offer to detach (only when detaching is possible).
    if (onDetach) setDetaching(outside(e.clientX, e.clientY));
    onChange({
      x: Math.max(0, drag.current.ox + (e.clientX - drag.current.px)),
      y: Math.max(0, drag.current.oy + (e.clientY - drag.current.py)),
    });
  };
  const onDragUp = (e: React.PointerEvent) => {
    const wasDetaching = drag.current !== null && onDetach && outside(e.clientX, e.clientY);
    drag.current = null;
    setDetaching(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
    if (wasDetaching) onDetach!(e.screenX, e.screenY);
  };

  const onResizeDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    onFocus();
    resize.current = { px: e.clientX, py: e.clientY, ow: panel.w, oh: panel.h };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onResizeMove = (e: React.PointerEvent) => {
    if (!resize.current) return;
    onChange({
      w: Math.max(MIN_W, resize.current.ow + (e.clientX - resize.current.px)),
      h: Math.max(MIN_H, resize.current.oh + (e.clientY - resize.current.py)),
    });
  };
  const onResizeUp = (e: React.PointerEvent) => {
    resize.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  return (
    <section
      onPointerDown={onFocus}
      style={{ left: panel.x, top: panel.y, width: panel.w, height: panel.h, zIndex: panel.z }}
      className={`absolute flex flex-col border bg-surface-container-lowest shadow-lg shadow-black/40 overflow-hidden transition-shadow ${
        detaching ? "border-primary ring-2 ring-primary opacity-80" : "border-outline-variant"
      }`}
    >
      {detaching && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-primary/10 pointer-events-none">
          <span className="px-3 py-1.5 bg-primary-container text-on-primary font-label-caps text-label-caps uppercase shadow">
            Thả để tách ra cửa sổ riêng
          </span>
        </div>
      )}
      <header
        onPointerDown={onDragDown}
        onPointerMove={onDragMove}
        onPointerUp={onDragUp}
        className="h-8 shrink-0 flex items-center gap-2 px-2 bg-surface-container-low border-b border-outline-variant cursor-move select-none touch-none"
      >
        <span className="material-symbols-outlined text-primary" style={{ fontSize: "15px" }}>
          {icon}
        </span>
        <span className="font-label-caps text-label-caps uppercase text-on-surface-variant truncate">
          {title}
        </span>
        <span className="flex-1" />
        <div data-no-drag className="flex items-center gap-1">
          {headerExtra}
          <button
            type="button"
            onClick={onClose}
            title="Đóng bảng"
            aria-label="Đóng bảng"
            className="h-5 w-5 grid place-items-center text-on-surface-variant hover:bg-error hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">{children}</div>

      {/* SE resize handle */}
      <div
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        title="Kéo để đổi kích thước"
        className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize touch-none"
        style={{
          background:
            "linear-gradient(135deg, transparent 0 50%, var(--color-outline-variant, #555) 50% 60%, transparent 60% 70%, var(--color-outline-variant, #555) 70% 80%, transparent 80%)",
        }}
      />
    </section>
  );
}
