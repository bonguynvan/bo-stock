// Terminal HOME tile registry + pure ordering helpers. Mirrors the backend's
// canonical tile keys (services/dashboard.py) so a saved layout stays renderable.

export interface TileMeta {
  key: string;
  title: string;
  icon: string; // material symbol
  expand: string; // command code the "expand" button fires
}

export const TILES: readonly TileMeta[] = [
  { key: "world", title: "Thị trường thế giới", icon: "public", expand: "WORLD" },
  { key: "fx", title: "Ngoại hối (FX)", icon: "currency_exchange", expand: "WORLD" },
  { key: "commodities", title: "Hàng hóa", icon: "oil_barrel", expand: "WORLD" },
  { key: "movers", title: "Dẫn đầu Quant (VN)", icon: "leaderboard", expand: "SCREEN" },
  { key: "watchlist", title: "Danh mục theo dõi", icon: "visibility", expand: "PORT" },
  { key: "crypto", title: "Crypto", icon: "currency_bitcoin", expand: "CRYPTO" },
  { key: "macro", title: "Vĩ mô toàn cầu", icon: "account_balance", expand: "WORLD" },
  { key: "worldbank", title: "Vĩ mô Việt Nam", icon: "account_balance_wallet", expand: "WORLD" },
  { key: "dbnomics", title: "IMF WEO (VN)", icon: "public", expand: "WORLD" },
  { key: "asean", title: "So sánh ASEAN", icon: "leaderboard", expand: "WORLD" },
  { key: "news", title: "Tin tức (đa nguồn)", icon: "newspaper", expand: "NEWS" },
  { key: "sectorheat", title: "Bản đồ nhiệt ngành", icon: "grid_view", expand: "SECTOR" },
  { key: "pulse", title: "Nhịp thị trường", icon: "monitoring", expand: "MKT" },
  { key: "foreign", title: "Khối ngoại", icon: "swap_horiz", expand: "MKT" },
];

export const DEFAULT_TILE_KEYS: readonly string[] = TILES.map((t) => t.key);
export const TILE_BY_KEY: Record<string, TileMeta> = Object.fromEntries(
  TILES.map((t) => [t.key, t]),
);

/** Keep only known keys, de-duplicated, order preserved. */
export function normalizeTiles(keys: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of keys) {
    if (TILE_BY_KEY[k] && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

/** Move `key` one slot toward the start (dir -1) or end (dir +1). Returns a new array. */
export function moveTile(keys: readonly string[], key: string, dir: -1 | 1): string[] {
  const i = keys.indexOf(key);
  const j = i + dir;
  if (i === -1 || j < 0 || j >= keys.length) return [...keys];
  const next = [...keys];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Keys not currently in the visible list (candidates to add back). */
export function hiddenTiles(visible: readonly string[]): TileMeta[] {
  return TILES.filter((t) => !visible.includes(t.key));
}
