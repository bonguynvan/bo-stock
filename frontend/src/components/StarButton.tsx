"use client";

interface StarButtonProps {
  active: boolean; // in a watchlist
  onToggle: () => void;
  size?: number;
  label?: boolean; // show a text label beside the icon
}

/** Watchlist star toggle — filled amber when the symbol is in a watchlist. */
export default function StarButton({ active, onToggle, size = 20, label = false }: StarButtonProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation(); // don't trigger the parent card/row navigation
        onToggle();
      }}
      title={active ? "Bỏ khỏi danh sách theo dõi" : "Thêm vào danh sách theo dõi"}
      aria-label={active ? "Bỏ theo dõi" : "Thêm vào theo dõi"}
      aria-pressed={active}
      className={`inline-flex items-center gap-1 transition-colors ${
        active ? "text-primary" : "text-on-surface-variant hover:text-primary"
      }`}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: `${size}px`, fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
      >
        star
      </span>
      {label && (
        <span className="font-label-caps text-label-caps uppercase">
          {active ? "Đang theo dõi" : "Theo dõi"}
        </span>
      )}
    </button>
  );
}
