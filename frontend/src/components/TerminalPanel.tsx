"use client";

import type { ReactNode } from "react";

interface TerminalPanelProps {
  title: string;
  icon?: string;
  code?: string; // function code shown top-right (e.g. "WORLD")
  onExpand?: () => void;
  // Edit-mode controls (dashboard customization).
  editing?: boolean;
  onHide?: () => void;
  onMovePrev?: () => void;
  onMoveNext?: () => void;
  children: ReactNode;
}

/**
 * Chrome for a single dashboard tile — dense title bar + scrollable body.
 * Deliberately terminal-flavored: uppercase mono caption, thin borders.
 */
export default function TerminalPanel({
  title,
  icon,
  code,
  onExpand,
  editing,
  onHide,
  onMovePrev,
  onMoveNext,
  children,
}: TerminalPanelProps) {
  return (
    <section
      className={`flex flex-col min-h-0 border bg-surface-container-lowest ${
        editing ? "border-primary/60 border-dashed" : "border-outline-variant"
      }`}
    >
      <header className="flex items-center gap-2 px-3 h-8 border-b border-outline-variant bg-surface-container-low shrink-0">
        {icon && (
          <span className="material-symbols-outlined text-primary" style={{ fontSize: "16px" }}>
            {icon}
          </span>
        )}
        <h2 className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface truncate">
          {title}
        </h2>

        {editing ? (
          <div className="ml-auto flex items-center gap-0.5">
            <IconBtn icon="chevron_left" title="Chuyển sang trái" onClick={onMovePrev} />
            <IconBtn icon="chevron_right" title="Chuyển sang phải" onClick={onMoveNext} />
            <IconBtn icon="visibility_off" title="Ẩn panel" onClick={onHide} danger />
          </div>
        ) : (
          <>
            {code && (
              <span className="ml-auto font-data-md text-data-sm text-on-surface-variant opacity-70">
                {code}
              </span>
            )}
            {onExpand && (
              <IconBtn
                icon="open_in_full"
                title="Mở toàn màn hình"
                onClick={onExpand}
                className={code ? "ml-1" : "ml-auto"}
              />
            )}
          </>
        )}
      </header>
      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">{children}</div>
    </section>
  );
}

function IconBtn({
  icon,
  title,
  onClick,
  className = "",
  danger = false,
}: {
  icon: string;
  title: string;
  onClick?: () => void;
  className?: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`text-on-surface-variant transition-colors ${
        danger ? "hover:text-error" : "hover:text-primary"
      } ${className}`}
    >
      <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
        {icon}
      </span>
    </button>
  );
}
