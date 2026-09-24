"use client";

import { useEffect, useState } from "react";
import { METRIC_TOOLTIPS } from "@/lib/metricTooltips";

/**
 * "Chú thích chỉ số" — interim metric legend. The grid (bo-grid) can't show
 * per-header definition tooltips yet, so this keeps the definitions one click
 * away. Content is the shared METRIC_TOOLTIPS config.
 */
export default function MetricLegend() {
  const [open, setOpen] = useState(false);
  const entries = Object.values(METRIC_TOOLTIPS);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-4 py-1.5 border border-outline-variant text-body-md font-medium hover:bg-surface-container transition-colors flex items-center gap-2"
      >
        <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
          info
        </span>
        Chú thích chỉ số
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Chú thích chỉ số"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-surface-container border border-outline w-full max-w-3xl max-h-[80vh] overflow-y-auto custom-scrollbar p-5"
          >
            <div className="flex items-center justify-between border-b border-outline-variant pb-3">
              <h2 className="font-headline-md text-headline-md text-on-surface">
                Chú thích chỉ số
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Đóng"
                className="text-on-surface-variant hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              {entries.map((t) => (
                <div
                  key={t.label}
                  className="bg-surface-container-low p-3 border border-outline-variant"
                >
                  <div className="font-data-md text-data-md font-bold text-primary">
                    {t.label}
                  </div>
                  <div className="text-body-md text-on-surface mt-1">{t.definition}</div>
                  {t.formula && (
                    <div className="font-data-sm text-data-sm text-on-surface-variant mt-1">
                      = {t.formula}
                    </div>
                  )}
                  <div className="text-body-md text-secondary mt-1">{t.benchmark}</div>
                  {t.caveat && (
                    <div className="text-data-sm text-amber-400 mt-2 pt-2 border-t border-outline-variant">
                      ⚠️ {t.caveat}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <p className="text-data-sm text-on-surface-variant opacity-60 mt-4">
              Benchmark mang tính tham khảo chung, chưa điều chỉnh theo ngành.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
