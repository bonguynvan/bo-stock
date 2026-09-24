"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addRecent, loadRecent, saveRecent } from "@/lib/recentSymbols";

export interface CommandDef {
  code: string; // typed token, e.g. "SCREEN"
  label: string; // human label
  hint: string;
}

// Function codes → actions are resolved by the parent (ScreenerApp).
export const COMMANDS: readonly CommandDef[] = [
  { code: "HOME", label: "Bảng điều khiển", hint: "Dashboard đa panel" },
  { code: "SCREEN", label: "Bộ lọc", hint: "Screener cổ phiếu" },
  { code: "CMP", label: "So sánh", hint: "Đặt nhiều mã cạnh nhau" },
  { code: "FACTOR", label: "Xếp hạng yếu tố", hint: "Giá trị/Chất lượng/Tăng trưởng" },
  { code: "AI", label: "Trợ lý AI", hint: "Hỏi đáp nghiên cứu" },
  { code: "MKT", label: "Nhịp thị trường", hint: "Tăng/giảm/thanh khoản VN" },
  { code: "WORLD", label: "Thị trường TG", hint: "Chỉ số/hàng hóa" },
  { code: "FX", label: "Ngoại hối", hint: "Tỷ giá USD/VND…" },
  { code: "COMMOD", label: "Hàng hóa", hint: "Vàng/dầu/kim loại/khí" },
  { code: "CRYPTO", label: "Crypto", hint: "Giá + vốn hóa 24h" },
  { code: "ECON", label: "Kinh tế", hint: "Màn vĩ mô tổng hợp" },
  { code: "MACRO", label: "Vĩ mô toàn cầu", hint: "Lãi suất/lạm phát/VIX" },
  { code: "WBANK", label: "Vĩ mô Việt Nam", hint: "GDP/lạm phát (World Bank)" },
  { code: "DBN", label: "IMF WEO (VN)", hint: "Vĩ mô VN từ DBnomics" },
  { code: "ASEAN", label: "So sánh ASEAN", hint: "GDP: VN vs khu vực" },
  { code: "CONN", label: "Connectors", hint: "Nguồn dữ liệu + kết nối" },
  { code: "SECTOR", label: "Ngành", hint: "Tổng quan ngành" },
  { code: "QUALITY", label: "Nền tảng vững", hint: "Cổ phiếu nền tảng tốt" },
  { code: "PORT", label: "Portfolio", hint: "Danh mục theo dõi" },
  { code: "ALERT", label: "Cảnh báo", hint: "Ngưỡng theo mã" },
  { code: "NEWS", label: "Tin tức", hint: "Tin thị trường VN" },
  { code: "ANALYTICS", label: "Phân tích", hint: "Bối cảnh & danh mục" },
  { code: "JOURNAL", label: "Nhật ký", hint: "Luận điểm đầu tư" },
  { code: "PLAYBOOK", label: "Quy trình", hint: "Playbook cá nhân" },
  { code: "SETTINGS", label: "Cài đặt", hint: "Nguồn dữ liệu, cấu hình" },
  { code: "HELP", label: "Trợ giúp", hint: "Phím tắt & danh sách lệnh" },
];

const CODES = new Set(COMMANDS.map((c) => c.code));

interface CommandBarProps {
  onCommand: (code: string) => void;
  onSymbol: (symbol: string) => void;
}

/**
 * Bloomberg-style function bar. `Ctrl/Cmd+K` or `/` opens it; type a function
 * code (SCREEN, WORLD, …) to switch panels, or a ticker (FPT) to open a symbol.
 * Research-only: it only navigates/opens research views — never places orders.
 */
export default function CommandBar({ onCommand, onSymbol }: CommandBarProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [showHelp, setShowHelp] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // Close and return focus to whatever was focused when the bar opened (a11y).
  const close = () => {
    setOpen(false);
    restoreRef.current?.focus?.();
  };

  // Global open shortcut: Ctrl/Cmd+K, or "/" when not typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField =
        e.target instanceof HTMLElement &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName);
      const openBar = () => {
        restoreRef.current = document.activeElement as HTMLElement | null;
        setOpen(true);
      };
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        openBar();
      } else if (e.key === "/" && !inField && !open) {
        e.preventDefault();
        openBar();
      } else if (e.key === "Escape" && open) {
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setShowHelp(false);
      setRecent(loadRecent());
      // Focus after the overlay paints.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const trimmed = query.trim();
  const upper = trimmed.toUpperCase();
  const looksLikeTicker = /^[A-Z0-9]{2,6}$/.test(upper) && !CODES.has(upper);

  const matches = useMemo(() => {
    if (!trimmed) return COMMANDS;
    return COMMANDS.filter(
      (c) => c.code.includes(upper) || c.label.toUpperCase().includes(upper),
    );
  }, [trimmed, upper]);

  const openSymbol = (sym: string) => {
    const next = addRecent(recent, sym);
    setRecent(next);
    saveRecent(next);
    onSymbol(sym.toUpperCase());
    setOpen(false);
  };

  const submit = (index: number) => {
    if (looksLikeTicker) {
      openSymbol(upper);
      return;
    }
    const chosen = matches[index] ?? matches[0];
    if (!chosen) return;
    if (chosen.code === "HELP") {
      setShowHelp(true);
      return;
    }
    onCommand(chosen.code);
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/60"
      onClick={close}
      role="presentation"
    >
      <div
        className="w-[min(640px,92vw)] border border-primary bg-surface-container-lowest shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Bảng lệnh"
      >
        <div className="flex items-center gap-2 px-3 h-11 border-b border-outline-variant">
          <span className="material-symbols-outlined text-primary">terminal</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit(active);
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, matches.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              }
            }}
            placeholder="Nhập mã (FPT) hoặc lệnh (SCREEN, WORLD…)  ·  Enter ↵"
            className="flex-1 bg-transparent outline-none font-data-md text-body-md text-on-surface placeholder:text-on-surface-variant/60"
            aria-label="Thanh lệnh terminal"
          />
          <kbd className="font-data-md text-data-sm text-on-surface-variant border border-outline-variant px-1.5 py-0.5">
            ESC
          </kbd>
        </div>

        {showHelp ? (
          <div className="max-h-[46vh] overflow-auto custom-scrollbar p-3 space-y-3">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowHelp(false)}
              className="flex items-center gap-1 font-data-md text-data-sm text-on-surface-variant hover:text-primary"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                arrow_back
              </span>
              Quay lại
            </button>
            <div className="space-y-1">
              <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">Phím tắt</p>
              <p className="font-data-md text-data-sm text-on-surface">
                <kbd className="border border-outline-variant px-1">Ctrl</kbd>+
                <kbd className="border border-outline-variant px-1">K</kbd> hoặc{" "}
                <kbd className="border border-outline-variant px-1">/</kbd> mở ·{" "}
                <kbd className="border border-outline-variant px-1">↑</kbd>
                <kbd className="border border-outline-variant px-1">↓</kbd> chọn ·{" "}
                <kbd className="border border-outline-variant px-1">Enter</kbd> chạy ·{" "}
                <kbd className="border border-outline-variant px-1">ESC</kbd> đóng
              </p>
              <p className="font-data-md text-data-sm text-on-surface-variant">
                Gõ mã (VD: FPT) để mở cổ phiếu, hoặc một mã lệnh bên dưới.
              </p>
            </div>
            <div className="space-y-1">
              <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">Mã lệnh</p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                {COMMANDS.filter((c) => c.code !== "HELP").map((c) => (
                  <li key={c.code} className="flex items-center gap-2 py-0.5">
                    <span className="font-data-md text-data-md text-primary w-20 shrink-0">{c.code}</span>
                    <span className="font-data-md text-data-sm text-on-surface truncate">{c.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <>
            {!trimmed && recent.length > 0 && (
              <div className="px-3 pt-2 pb-2 border-b border-outline-variant/50">
                <p className="font-label-caps text-label-caps uppercase text-on-surface-variant opacity-70 mb-1.5">
                  Gần đây
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {recent.map((sym) => (
                    <button
                      key={sym}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => openSymbol(sym)}
                      className="px-2 py-0.5 border border-outline-variant hover:border-primary hover:text-primary font-data-md text-data-sm text-on-surface transition-colors"
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <ul className="max-h-[46vh] overflow-auto custom-scrollbar py-1">
              {looksLikeTicker ? (
                <li>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => submit(0)}
                    className="w-full flex items-center gap-3 px-3 py-2 bg-surface-container-high text-left"
                  >
                    <span className="material-symbols-outlined text-primary" style={{ fontSize: "18px" }}>
                      north_east
                    </span>
                    <span className="font-data-md text-body-md text-on-surface">
                      Mở mã <span className="text-primary font-bold">{upper}</span>
                    </span>
                  </button>
                </li>
              ) : matches.length === 0 ? (
                <li className="px-3 py-3 text-data-sm text-on-surface-variant">Không có lệnh khớp.</li>
              ) : (
                matches.map((c, i) => (
                  <li key={c.code}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => submit(i)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                        i === active ? "bg-surface-container-high" : "hover:bg-surface-container-low"
                      }`}
                    >
                      <span className="font-data-md text-data-md text-primary w-20 shrink-0">{c.code}</span>
                      <span className="font-data-md text-body-md text-on-surface">{c.label}</span>
                      <span className="ml-auto text-data-sm text-on-surface-variant opacity-70">{c.hint}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
