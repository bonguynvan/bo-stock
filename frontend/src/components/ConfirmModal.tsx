"use client";

import { useEffect } from "react";

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Minimal, keyboard-accessible confirm dialog (used for the AI-credit gate). */
export default function ConfirmModal({
  title,
  message,
  confirmLabel = "Xác nhận",
  cancelLabel = "Hủy",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, onConfirm]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onCancel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-container border border-outline w-full max-w-md p-5 space-y-4"
      >
        <h2 className="font-headline-sm text-headline-sm text-on-surface">{title}</h2>
        <p className="text-body-md text-on-surface-variant whitespace-pre-line">{message}</p>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-1.5 border border-outline text-on-surface-variant font-label-caps text-label-caps uppercase hover:bg-surface-container-high transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-1.5 bg-primary text-on-primary font-label-caps text-label-caps uppercase hover:brightness-110 transition"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
