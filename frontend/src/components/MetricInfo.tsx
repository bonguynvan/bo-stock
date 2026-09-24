"use client";

import { METRIC_TOOLTIPS } from "@/lib/metricTooltips";

interface MetricInfoProps {
  metricKey: string;
  // Which edge the tooltip aligns to (avoids clipping inside scroll containers).
  align?: "left" | "right";
}

/**
 * Tiny info icon with a CSS-only hover/focus tooltip (no deps). Renders nothing
 * if the metric has no configured tooltip. Content lives in metricTooltips.ts.
 */
export default function MetricInfo({ metricKey, align = "left" }: MetricInfoProps) {
  const t = METRIC_TOOLTIPS[metricKey];
  if (!t) return null;

  return (
    <span className="group/info relative inline-flex align-middle">
      <button
        type="button"
        aria-label={`Giải thích ${t.label}`}
        onClick={(e) => e.stopPropagation()}
        className="flex items-center text-on-surface-variant hover:text-primary cursor-help transition-colors"
      >
        <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
          info
        </span>
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute top-full mt-1 ${
          align === "right" ? "right-0" : "left-0"
        } z-50 w-56 p-2.5 bg-surface-container-highest border border-outline shadow-lg text-left normal-case tracking-normal opacity-0 invisible transition-opacity duration-150 group-hover/info:opacity-100 group-hover/info:visible group-focus-within/info:opacity-100 group-focus-within/info:visible`}
      >
        <span className="block font-bold text-primary text-data-sm">{t.label}</span>
        <span className="block text-on-surface text-body-md mt-1">{t.definition}</span>
        {t.formula && (
          <span className="block font-data-sm text-data-sm text-on-surface-variant mt-1">
            = {t.formula}
          </span>
        )}
        <span className="block text-secondary text-body-md mt-1">{t.benchmark}</span>
        {t.caveat && (
          <span className="block text-amber-400 text-data-sm mt-1.5 pt-1.5 border-t border-outline-variant">
            ⚠️ {t.caveat}
          </span>
        )}
      </span>
    </span>
  );
}
