"use client";

import { useCallback, useRef } from "react";

export interface TabItem {
  id: string;
  label: string;
  icon?: string;
}

interface TabBarProps {
  tabs: readonly TabItem[];
  active: string;
  onChange: (id: string) => void;
  /** Accessible name for the tablist (e.g. "Chế độ thị trường"). */
  ariaLabel: string;
  className?: string;
}

/**
 * Horizontal, accessible tab strip that sits under a view header. Renders only the
 * tab controls — the consumer switches the panel body by `active` id. Shared across
 * every consolidated surface so merged views scan as one set of modes, not a menu.
 *
 * Keyboard: ArrowLeft/Right move focus+selection, Home/End jump to ends (WAI-ARIA
 * automatic-activation tabs pattern).
 */
export default function TabBar({ tabs, active, onChange, ariaLabel, className = "" }: TabBarProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      const last = tabs.length - 1;
      let next = -1;
      if (e.key === "ArrowRight") next = index === last ? 0 : index + 1;
      else if (e.key === "ArrowLeft") next = index === 0 ? last : index - 1;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = last;
      if (next < 0) return;
      e.preventDefault();
      onChange(tabs[next].id);
      refs.current[next]?.focus();
    },
    [tabs, onChange],
  );

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex items-center gap-1 px-3 border-b border-outline-variant bg-surface-container-low overflow-x-auto custom-scrollbar ${className}`}
    >
      {tabs.map((tab, i) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`flex items-center gap-1.5 px-3 py-2.5 font-label-caps text-label-caps uppercase whitespace-nowrap border-b-2 -mb-px transition-colors ${
              isActive
                ? "text-primary border-primary"
                : "text-on-surface-variant border-transparent hover:text-on-surface"
            }`}
          >
            {tab.icon && (
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                {tab.icon}
              </span>
            )}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
