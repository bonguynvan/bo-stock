"use client";

import { useEffect, useState } from "react";
import { getChannelNews, getNewsChannels } from "@/lib/api";
import type { NewsChannel, NewsItem } from "@/types/stock";
import NewsList from "./NewsList";

/**
 * Multi-source news tile — channel tabs (VN / world / macro), each aggregating
 * several RSS feeds. Research-only relay of headlines to their source.
 */
export default function NewsTerminalPanel() {
  const [channels, setChannels] = useState<NewsChannel[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getNewsChannels()
      .then((list) => {
        if (cancelled) return;
        setChannels(list);
        if (list[0]) setActive((cur) => cur ?? list[0].key);
        else setLoading(false); // no channels → nothing to load, don't hang
      })
      .catch(() => {
        if (!cancelled) setLoading(false); // channel fetch failed → show empty state
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    getChannelNews(active)
      .then((data) => !cancelled && setItems(data))
      .catch(() => !cancelled && setItems([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [active]);

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-outline-variant/50 shrink-0">
        {channels.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setActive(c.key)}
            className={`px-2 py-0.5 font-label-caps text-label-caps uppercase transition-colors ${
              c.key === active
                ? "text-primary border-b-2 border-primary"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto custom-scrollbar p-2">
        {loading && items.length === 0 ? (
          <p className="p-2 text-data-sm text-on-surface-variant">Đang tải tin…</p>
        ) : (
          <NewsList items={items} />
        )}
      </div>
    </div>
  );
}
