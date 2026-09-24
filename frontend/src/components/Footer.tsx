"use client";

import { fmtTime } from "@/lib/format";

interface FooterProps {
  filtered: number;
  total: number;
  lastUpdate: string | null;
}

export default function Footer({ filtered, total, lastUpdate }: FooterProps) {
  return (
    <footer className="h-8 bg-surface-container-lowest border-t border-outline-variant px-4 flex items-center justify-between text-data-sm font-data-sm">
      <div className="flex items-center gap-4 text-on-surface-variant">
        <span>
          Kết quả lọc: <strong className="text-primary">{filtered}</strong>/{total} cổ
          phiếu
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 bg-secondary" /> Market Open
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-on-surface-variant">
          Last Update:{" "}
          <span className="text-on-surface">
            {lastUpdate ? fmtTime(lastUpdate) : "—"}
          </span>
        </span>
        <span className="flex items-center gap-1 text-on-surface-variant">
          <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
            cloud_done
          </span>
          Sync OK
        </span>
      </div>
    </footer>
  );
}
