"use client";

import { useState } from "react";
import { getVnIndices } from "@/lib/api";
import { changeColor, fmtNumber, fmtPercent } from "@/lib/format";
import { usePolling } from "@/lib/usePolling";
import { IS_DESKTOP } from "@/lib/desktop";
import { openAppWindow } from "@/lib/desktopWindows";

const REFRESH_MS = 60_000;

interface TopNavBarProps {
  search: string;
  onSearchChange: (value: string) => void;
}

export default function TopNavBar({ search, onSearchChange }: TopNavBarProps) {
  const [focused, setFocused] = useState(false);
  // Live VN index tape — real synced levels, or nothing (never fake numbers).
  const { data: indices } = usePolling(getVnIndices, REFRESH_MS);

  return (
    <nav className="flex justify-between items-center w-full px-4 h-12 bg-surface-container-lowest border-b border-outline-variant z-50">
      <div className="flex items-center gap-6">
        <span className="font-display-lg text-display-lg font-bold text-primary tracking-tighter">
          V-Investment OS
        </span>
        <div className="hidden md:flex gap-4 items-center">
          {(indices ?? []).map((idx) => (
            <span
              key={idx.symbol}
              className={`font-data-md text-data-md flex items-center gap-1 ${changeColor(idx.change_pct)}`}
              title={idx.as_of ? `Cập nhật ${idx.as_of}` : undefined}
            >
              {idx.name}: {fmtNumber(idx.level, 2)} ({fmtPercent(idx.change_pct, 2, true)})
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant">
            <span className="material-symbols-outlined">search</span>
          </span>
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className={`bg-surface-container-high border text-body-md py-1 pl-8 pr-4 w-64 outline-none transition-all ${
              focused ? "border-primary-container" : "border-outline-variant"
            }`}
            placeholder="Tìm kiếm mã CP..."
            type="text"
            aria-label="Tìm kiếm mã cổ phiếu"
          />
        </div>
        {IS_DESKTOP && (
          <button
            type="button"
            onClick={() => openAppWindow()}
            title="Mở cửa sổ terminal mới"
            aria-label="Mở cửa sổ mới"
            className="material-symbols-outlined text-on-surface-variant cursor-pointer hover:text-primary transition-colors"
          >
            open_in_new
          </button>
        )}
        <span className="material-symbols-outlined text-on-surface-variant cursor-pointer hover:text-primary transition-colors">
          schedule
        </span>
        <span className="material-symbols-outlined text-on-surface-variant cursor-pointer hover:text-primary transition-colors">
          account_circle
        </span>
      </div>
    </nav>
  );
}
