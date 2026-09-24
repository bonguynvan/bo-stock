/**
 * Loading skeletons for market-data panels — a subtle shimmer that mirrors the panel's
 * real shape (list rows / grid tiles) so the layout doesn't jump when data arrives.
 * Shimmer is disabled under prefers-reduced-motion (see globals.css .skeleton).
 */
export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton rounded-sm ${className}`} style={style} aria-hidden />;
}

const _ROW_WIDTHS = ["58%", "44%", "66%", "38%", "52%", "48%", "60%", "42%"];

/** List/table panels (world markets, movers, watchlist…): N shimmering label+value rows. */
export function PanelSkeleton({ rows = 6, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`p-3 space-y-2.5 ${className}`} role="status" aria-label="Đang tải dữ liệu">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <Skeleton className="h-3.5" style={{ width: _ROW_WIDTHS[i % _ROW_WIDTHS.length] }} />
          <Skeleton className="h-3.5 w-14 shrink-0" />
        </div>
      ))}
      <span className="sr-only">Đang tải…</span>
    </div>
  );
}

/** Grid panels (sector heatmap): a shimmering tile grid. */
export function GridSkeleton({ count = 12, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`p-3 grid grid-cols-3 gap-2 ${className}`} role="status" aria-label="Đang tải dữ liệu">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-12" />
      ))}
      <span className="sr-only">Đang tải…</span>
    </div>
  );
}
