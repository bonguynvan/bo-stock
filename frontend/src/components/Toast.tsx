"use client";

interface ToastProps {
  message: string | null;
}

export default function Toast({ message }: ToastProps) {
  if (!message) return null;
  return (
    <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[110] bg-surface-container-high border border-primary-container px-4 py-2 text-on-surface font-data-md text-data-md shadow-xl">
      {message}
    </div>
  );
}
