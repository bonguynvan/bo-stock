"use client";

import type { ReactNode } from "react";

interface PanelSectionProps {
  title: string;
  icon?: string;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

/**
 * Content-height terminal panel chrome for the symbol workspace. Unlike
 * TerminalPanel (fixed-height dashboard cells with inner scroll), this grows with
 * its content so it composes in a scrolling page.
 */
export default function PanelSection({
  title,
  icon,
  actions,
  className,
  bodyClassName,
  children,
}: PanelSectionProps) {
  return (
    <section
      className={`flex flex-col border border-outline-variant bg-surface-container-lowest ${className ?? ""}`}
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
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </header>
      <div className={bodyClassName ?? "p-3"}>{children}</div>
    </section>
  );
}
