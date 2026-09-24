"use client";

import type { NewsItem } from "@/types/stock";

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 60) return `${Math.max(mins, 0)} phút trước`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} giờ trước`;
  return `${Math.round(hrs / 24)} ngày trước`;
}

/** Renders a list of news items as external-link cards. Research-only relay. */
export default function NewsList({ items }: { items: NewsItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-on-surface-variant font-data-md text-data-md py-6 text-center border border-outline-variant border-dashed">
        Chưa lấy được tin — thử lại sau.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((n) => (
        <li key={n.link}>
          <a
            href={n.link}
            target="_blank"
            rel="noopener noreferrer"
            className="block border border-outline-variant bg-surface-container-low hover:bg-surface-container hover:border-primary transition-colors p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-data-md text-data-md text-on-surface flex-1">
                {n.symbol && (
                  <span className="text-primary font-bold mr-1.5">{n.symbol}</span>
                )}
                {n.title}
              </h3>
              <span className="material-symbols-outlined text-on-surface-variant shrink-0" style={{ fontSize: "16px" }}>
                open_in_new
              </span>
            </div>
            {n.summary && (
              <p className="text-data-sm text-on-surface-variant mt-1 line-clamp-2">{n.summary}</p>
            )}
            <div className="text-data-sm text-on-surface-variant opacity-60 mt-1.5 flex gap-2">
              {n.source && <span className="text-primary">{n.source}</span>}
              <span>{timeAgo(n.published_iso)}</span>
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}
