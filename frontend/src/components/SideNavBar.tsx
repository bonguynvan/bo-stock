"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMe, logout } from "@/lib/api";
import { IS_DESKTOP } from "@/lib/desktop";

interface NavItem {
  icon: string;
  label: string;
  available?: boolean; // implemented views; others are "Sắp có" placeholders
}

interface NavGroup {
  title: string;
  items: readonly NavItem[];
}

// Grouped so the ~18 destinations scan as five themed clusters instead of one long
// flat list. Grouping only — every view is still a top-level destination (no merging).
const NAV_GROUPS: readonly NavGroup[] = [
  {
    title: "Tổng quan",
    items: [
      { icon: "dashboard", label: "Terminal", available: true },
      { icon: "dashboard_customize", label: "Bàn làm việc", available: true },
      { icon: "smart_toy", label: "AI Assistant", available: true },
      { icon: "newspaper", label: "News", available: true },
    ],
  },
  {
    title: "Thị trường",
    items: [
      { icon: "public", label: "Thị trường", available: true },
      { icon: "monitoring", label: "Nhịp TT", available: true },
      { icon: "donut_small", label: "Ngành", available: true },
    ],
  },
  {
    title: "Nghiên cứu",
    items: [
      { icon: "filter_list", label: "Screener", available: true },
      { icon: "compare_arrows", label: "So sánh", available: true },
    ],
  },
  {
    title: "Danh mục",
    items: [
      { icon: "account_balance_wallet", label: "Portfolio", available: true },
      { icon: "notifications_active", label: "Cảnh báo", available: true },
      { icon: "menu_book", label: "Nhật ký", available: true },
    ],
  },
  {
    title: "Hệ thống",
    items: [
      { icon: "hub", label: "Connectors", available: true },
      { icon: "settings", label: "Settings", available: true },
    ],
  },
];

interface SideNavBarProps {
  active: string;
  onNavigate: (label: string) => void;
}

export default function SideNavBar({ active, onNavigate }: SideNavBarProps) {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (IS_DESKTOP) return; // no auth in desktop mode → no admin link, no session probe
    let cancelled = false;
    getMe().then((u) => !cancelled && setIsAdmin(Boolean(u?.is_admin))).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const signOut = async () => {
    try {
      await logout();
    } finally {
      router.replace("/login");
    }
  };
  return (
    <aside className="flex flex-col h-full w-16 md:w-64 bg-surface-container-lowest border-r border-outline-variant transition-all duration-300">
      <div className="p-4 border-b border-outline-variant hidden md:block">
        <div className="text-primary font-display-lg text-display-lg leading-tight">
          Quant Terminal
        </div>
        <div className="text-on-surface-variant font-label-caps text-label-caps uppercase tracking-widest mt-1">
          V-Investment OS
        </div>
      </div>
      <nav className="flex-1 py-3 overflow-y-auto custom-scrollbar">
        {NAV_GROUPS.map((group) => (
          <div
            key={group.title}
            className="px-2 py-1 border-t border-outline-variant/40 first:border-t-0"
          >
            <div className="px-3 pt-2 pb-1 font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant opacity-50 hidden md:block">
              {group.title}
            </div>
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive = item.label === active;
                const base =
                  "w-full flex items-center gap-3 px-3 py-2 transition-all duration-150";
                const cls = isActive
                  ? `${base} text-primary border-r-2 border-primary bg-surface-container-high cursor-pointer active:scale-95`
                  : item.available
                    ? `${base} text-on-surface-variant hover:text-on-surface hover:bg-surface-container cursor-pointer active:scale-95`
                    : `${base} text-on-surface-variant opacity-40 cursor-not-allowed`;
                return (
                  <button
                    key={item.label}
                    type="button"
                    disabled={!item.available && !isActive}
                    onClick={() => onNavigate(item.label)}
                    title={item.available ? group.title : "Sắp có"}
                    className={cls}
                  >
                    <span className="material-symbols-outlined">{item.icon}</span>
                    <span className="font-label-caps text-label-caps hidden md:inline uppercase">
                      {item.label}
                    </span>
                    {!item.available && (
                      <span className="ml-auto hidden md:inline text-data-sm normal-case opacity-80">
                        Sắp có
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      {/* Research-only tool: no order execution. A scope reminder replaces the
          design mock's "Execute Order" CTA. */}
      <div className="p-3 border-t border-outline-variant space-y-2">
        {isAdmin && (
          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="w-full flex items-center gap-3 px-3 py-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all duration-150 cursor-pointer active:scale-95"
            title="Quản trị"
          >
            <span className="material-symbols-outlined">admin_panel_settings</span>
            <span className="font-label-caps text-label-caps hidden md:inline uppercase">Quản trị</span>
          </button>
        )}
        {!IS_DESKTOP && (
          <button
            type="button"
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all duration-150 cursor-pointer active:scale-95"
            title="Đăng xuất"
          >
            <span className="material-symbols-outlined">logout</span>
            <span className="font-label-caps text-label-caps hidden md:inline uppercase">Đăng xuất</span>
          </button>
        )}
        <div className="text-on-surface-variant font-label-caps text-label-caps uppercase tracking-widest text-center opacity-60 hidden md:block">
          Research Only
        </div>
      </div>
    </aside>
  );
}
