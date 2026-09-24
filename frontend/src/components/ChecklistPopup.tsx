"use client";

import { useEffect, useState } from "react";
import { getPlaybook } from "@/lib/api";
import { parseChecklist, type ChecklistSection } from "@/lib/simpleMarkdown";

/**
 * Quick checklist popup — renders the current Playbook's "- " bullets as
 * checkboxes for an in-session reminder while screening. Check state is NOT
 * persisted (closing loses nothing); it's a visual nudge, not tracking.
 */
export default function ChecklistPopup() {
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState<ChecklistSection[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || sections !== null) return;
    getPlaybook()
      .then((p) => setSections(parseChecklist(p.content)))
      .catch((e) => setError(e instanceof Error ? e.message : "Lỗi tải checklist"));
  }, [open, sections]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 border border-outline-variant font-label-caps text-label-caps uppercase hover:bg-surface-container transition-colors flex items-center gap-1.5"
      >
        <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
          checklist
        </span>
        Checklist
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Checklist quy trình"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-surface-container border border-outline w-full max-w-lg max-h-[80vh] overflow-y-auto custom-scrollbar p-5"
          >
            <div className="flex items-center justify-between border-b border-outline-variant pb-3">
              <h2 className="font-headline-md text-headline-md text-on-surface">Checklist quy trình</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Đóng"
                className="text-on-surface-variant hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {error ? (
              <p className="text-error font-data-md text-data-md mt-4">{error}</p>
            ) : sections === null ? (
              <p className="text-on-surface-variant font-data-md text-data-md mt-4">Đang tải…</p>
            ) : sections.length === 0 ? (
              <p className="text-on-surface-variant text-body-md mt-4">
                Quy trình chưa có mục “- …”. Thêm trong trang Quy Trình.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {sections.map((sec, si) => (
                  <div key={si} className="space-y-1.5">
                    {sec.heading && (
                      <div className="font-label-caps text-label-caps text-primary uppercase tracking-widest">
                        {sec.heading}
                      </div>
                    )}
                    {sec.items.map((item, ii) => {
                      const id = `${si}-${ii}`;
                      const on = checked.has(id);
                      return (
                        <label
                          key={id}
                          className="flex items-start gap-2 cursor-pointer text-body-md text-on-surface"
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggle(id)}
                            className="mt-1 accent-primary"
                          />
                          <span className={on ? "line-through opacity-60" : ""}>{item}</span>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            <p className="text-data-sm text-on-surface-variant opacity-60 mt-4">
              Nhắc việc trong phiên — trạng thái tick không được lưu.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
