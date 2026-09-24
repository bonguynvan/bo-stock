"use client";

import type { SavedScreen, Watchlist } from "@/types/stock";

interface WatchlistPanelProps {
  watchlists: Watchlist[];
  activeId: number | null;
  onSelect: (id: number | null) => void;
  onCreate: () => void;
  onDelete: (id: number) => void;
  savedScreens: SavedScreen[];
  onLoadScreen: (id: number) => void;
  onDeleteScreen: (id: number) => void;
}

const SECTION_HEADING =
  "font-label-caps text-label-caps text-primary uppercase tracking-widest mb-2 flex items-center justify-between";

function RowButton({
  active,
  onClick,
  onRemove,
  label,
  meta,
  removeTitle,
}: {
  active?: boolean;
  onClick: () => void;
  onRemove: () => void;
  label: string;
  meta?: string;
  removeTitle: string;
}) {
  return (
    <div
      className={
        active
          ? "group flex items-center gap-2 px-2 py-1.5 border-l-2 border-primary bg-surface-container-high cursor-pointer"
          : "group flex items-center gap-2 px-2 py-1.5 border-l-2 border-transparent hover:bg-surface-container cursor-pointer transition-colors"
      }
    >
      <button
        type="button"
        onClick={onClick}
        className="flex-1 text-left flex items-center justify-between gap-2 min-w-0"
      >
        <span
          className={`font-data-sm text-data-sm truncate ${active ? "text-primary" : "text-on-surface"}`}
        >
          {label}
        </span>
        {meta && (
          <span className="font-data-sm text-data-sm text-on-surface-variant shrink-0">
            {meta}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={onRemove}
        title={removeTitle}
        aria-label={removeTitle}
        className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-error transition-opacity"
      >
        <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
          close
        </span>
      </button>
    </div>
  );
}

export default function WatchlistPanel({
  watchlists,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  savedScreens,
  onLoadScreen,
  onDeleteScreen,
}: WatchlistPanelProps) {
  return (
    <div className="border-b border-outline-variant bg-surface-container-lowest p-4 flex flex-col gap-5 max-h-[45%] overflow-y-auto custom-scrollbar shrink-0">
      <section>
        <h3 className={SECTION_HEADING}>
          Danh mục theo dõi
          <button
            type="button"
            onClick={onCreate}
            title="Tạo danh mục mới"
            aria-label="Tạo danh mục mới"
            className="text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
              add
            </span>
          </button>
        </h3>
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => onSelect(null)}
            className={
              activeId === null
                ? "w-full text-left px-2 py-1.5 border-l-2 border-primary bg-surface-container-high font-data-sm text-data-sm text-primary"
                : "w-full text-left px-2 py-1.5 border-l-2 border-transparent hover:bg-surface-container font-data-sm text-data-sm text-on-surface-variant transition-colors"
            }
          >
            Tất cả cổ phiếu (Screener)
          </button>
          {watchlists.length === 0 && (
            <p className="px-2 py-1 text-body-md text-on-surface-variant opacity-70">
              Chưa có danh mục. Nhấn ＋ hoặc ngôi sao trên mỗi mã.
            </p>
          )}
          {watchlists.map((w) => (
            <RowButton
              key={w.id}
              active={w.id === activeId}
              onClick={() => onSelect(w.id)}
              onRemove={() => onDelete(w.id)}
              label={w.name}
              meta={`${w.symbols.length}`}
              removeTitle={`Xóa danh mục ${w.name}`}
            />
          ))}
        </div>
      </section>

      <section>
        <h3 className={SECTION_HEADING}>Bộ lọc đã lưu</h3>
        <div className="space-y-0.5">
          {savedScreens.length === 0 && (
            <p className="px-2 py-1 text-body-md text-on-surface-variant opacity-70">
              Chưa có bộ lọc. Nhấn “Lưu Bộ Lọc”.
            </p>
          )}
          {savedScreens.map((s) => (
            <RowButton
              key={s.id}
              onClick={() => onLoadScreen(s.id)}
              onRemove={() => onDeleteScreen(s.id)}
              label={s.name}
              removeTitle={`Xóa bộ lọc ${s.name}`}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
