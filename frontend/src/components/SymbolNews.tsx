"use client";

import { useEffect, useState } from "react";
import type { NewsItem } from "@/types/stock";
import { getSymbolNews } from "@/lib/api";
import NewsList from "./NewsList";

export default function SymbolNews({ symbol }: { symbol: string }) {
  const [items, setItems] = useState<NewsItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    getSymbolNews(symbol)
      .then((d) => !cancelled && setItems(d))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  if (items !== null && items.length === 0) return null; // hide section if no news

  return (
    <section className="space-y-3">
      <h2 className="font-label-caps text-label-caps text-primary uppercase tracking-widest">
        Tin tức liên quan
      </h2>
      {items === null ? (
        <p className="text-on-surface-variant font-data-md text-data-md">Đang tải tin…</p>
      ) : (
        <NewsList items={items.slice(0, 8)} />
      )}
    </section>
  );
}
