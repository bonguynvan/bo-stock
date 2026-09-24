"use client";

import { useEffect, useState } from "react";
import type { NewsItem } from "@/types/stock";
import { getMarketNews, getPersonalizedNews } from "@/lib/api";
import NewsList from "./NewsList";

type Tab = "market" | "mine";

export default function NewsView({ onToast }: { onToast: (msg: string) => void }) {
  const [tab, setTab] = useState<Tab>("market");
  const [market, setMarket] = useState<NewsItem[] | null>(null);
  const [mine, setMine] = useState<NewsItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = tab === "market" ? getMarketNews : getPersonalizedNews;
    const has = tab === "market" ? market : mine;
    if (has !== null) return; // already loaded this tab
    load()
      .then((d) => {
        if (cancelled) return;
        if (tab === "market") setMarket(d);
        else setMine(d);
      })
      .catch((e) => {
        if (cancelled) return;
        if (tab === "market") setMarket([]);
        else setMine([]);
        onToast(e instanceof Error ? e.message : "Lỗi tải tin tức");
      });
    return () => {
      cancelled = true;
    };
  }, [tab, market, mine, onToast]);

  const items = tab === "market" ? market : mine;

  return (
    <div className="flex-1 overflow-auto custom-scrollbar p-4 space-y-3">
      <div className="flex gap-2">
        {([
          ["market", "Thị trường"],
          ["mine", "Danh mục của tôi"],
        ] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={
              tab === t
                ? "px-3 py-1.5 border border-primary text-primary bg-primary/10 font-label-caps text-label-caps uppercase"
                : "px-3 py-1.5 border border-outline-variant text-on-surface-variant hover:border-primary transition-colors font-label-caps text-label-caps uppercase"
            }
          >
            {label}
          </button>
        ))}
      </div>

      <p className="text-data-sm text-on-surface-variant opacity-70">
        {tab === "market"
          ? "Tin thị trường tổng hợp từ CafeF & Vietstock (RSS công khai)."
          : "Tin cho các mã trong Danh mục & Danh sách theo dõi của bạn — bấm để đọc bài gốc."}
      </p>

      {items === null ? (
        <p className="text-on-surface-variant font-data-md text-data-md">Đang tải tin…</p>
      ) : tab === "mine" && items.length === 0 ? (
        <p className="text-on-surface-variant font-data-md text-data-md py-8 text-center border border-outline-variant border-dashed">
          Chưa có mã nào trong Danh mục/Theo dõi — thêm cổ phiếu để nhận tin liên quan.
        </p>
      ) : (
        <NewsList items={items} />
      )}
    </div>
  );
}
