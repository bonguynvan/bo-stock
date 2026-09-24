import type { KeyboardEvent } from "react";

/**
 * Props that make a non-button element (e.g. a table row) behave like a button:
 * clickable, focusable, and activatable by Enter/Space. Spread onto the element.
 */
export function rowButtonProps(onActivate: () => void, label?: string) {
  return {
    role: "button" as const,
    tabIndex: 0,
    ...(label ? { "aria-label": label } : {}),
    onClick: onActivate,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    },
  };
}
