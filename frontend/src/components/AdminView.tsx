"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AdminStats, WaitlistItem } from "@/types/stock";
import { ApiError, getAdminStats, getAdminWaitlist } from "@/lib/api";

export default function AdminView() {
  const [rows, setRows] = useState<WaitlistItem[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "forbidden" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    Promise.all([getAdminWaitlist(), getAdminStats()])
      .then(([wl, s]) => {
        if (cancelled) return;
        setRows(wl);
        setStats(s);
        setState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setState(err instanceof ApiError && (err.status === 403 || err.status === 401) ? "forbidden" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") {
    return <p className="p-6 text-on-surface-variant font-data-md text-data-md animate-pulse">Đang tải…</p>;
  }
  if (state === "forbidden") {
    return (
      <div className="p-6">
        <p className="text-error font-data-md text-data-md">Bạn không có quyền truy cập trang quản trị.</p>
        <Link href="/app" className="text-primary hover:underline text-data-sm">← Về ứng dụng</Link>
      </div>
    );
  }
  if (state === "error") {
    return <p className="p-6 text-error font-data-md text-data-md">Lỗi tải dữ liệu quản trị.</p>;
  }

  const csv = () => {
    const header = "email,note,created_at\n";
    const lines = rows.map((r) => `${r.email},"${(r.note ?? "").replace(/"/g, '""')}",${r.created_at ?? ""}`);
    return header + lines.join("\n");
  };
  const copyCsv = () => navigator.clipboard?.writeText(csv());

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <header className="border-b border-outline-variant bg-surface-container-low px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-headline-md text-headline-md">Quản trị</h1>
          <p className="text-data-sm text-on-surface-variant mt-0.5">
            {stats?.users ?? 0} tài khoản · {stats?.waitlist ?? 0} đăng ký waitlist
          </p>
        </div>
        <Link href="/app" className="text-primary hover:underline text-data-sm">← Về ứng dụng</Link>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-label-caps text-label-caps uppercase tracking-widest text-primary">
            Waitlist ({rows.length})
          </h2>
          {rows.length > 0 && (
            <button
              type="button"
              onClick={copyCsv}
              className="px-3 py-1 border border-outline-variant text-on-surface-variant hover:text-on-surface font-label-caps text-label-caps uppercase"
            >
              Copy CSV
            </button>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="text-data-sm text-on-surface-variant">Chưa có ai đăng ký.</p>
        ) : (
          <table className="w-full border-collapse font-data-md text-data-md">
            <thead>
              <tr className="border-b border-outline-variant text-left">
                <th className="py-2 pr-3 font-label-caps text-label-caps uppercase text-on-surface-variant">Email</th>
                <th className="py-2 px-3 font-label-caps text-label-caps uppercase text-on-surface-variant">Ghi chú</th>
                <th className="py-2 pl-3 font-label-caps text-label-caps uppercase text-on-surface-variant">Ngày</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-outline-variant/50">
                  <td className="py-1.5 pr-3 text-on-surface">{r.email}</td>
                  <td className="py-1.5 px-3 text-on-surface-variant">{r.note ?? ""}</td>
                  <td className="py-1.5 pl-3 text-on-surface-variant opacity-70 tabular-nums">
                    {r.created_at ? r.created_at.slice(0, 10) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}
