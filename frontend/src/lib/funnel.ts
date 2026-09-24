// 4-tier funnel: pure helpers (Tier-1 filter, Tier-2 flags, ranking) — the
// orchestration reuses existing APIs (screener filter + compass). No new backend.
import type { FunnelFlag, FunnelRow, ScreenerFilterBody, StockResult } from "@/types/stock";

// Tier 1 — hard filter (reuses the existing screener query).
// NOTE: avg_volume_30d isn't synced in the DB (null universe-wide), so the
// "volume > 500k" criterion can't be auto-applied — it'd filter everything out.
// It stays a manual check in the playbook until a daily price/volume refresh lands.
export const TIER1_BODY: ScreenerFilterBody = {
  roe_min: 15,
  pe_max: 20,
  market_cap_min: 1000, // tỷ VND
  exchange: ["HOSE"],
  sort_by: "quant_score",
  sort_order: "desc",
  limit: 2000,
};

// Tier 3 caps how many survivors get an on-the-fly Compass short-term calc
// (each is one OHLC fetch — no AI). Tier 1 usually leaves well under this.
export const TIER3_COMPASS_CAP = 40;

export const LIQUIDITY_MIN = 500_000; // avg 30d volume

// Tier 1.5 — liquidity guard (capital safety). Drops symbols whose avg 30d
// volume is KNOWN to be below the threshold; symbols with no volume data yet
// (avg_volume_30d == null, before the price/volume sync runs) are KEPT so the
// funnel never silently empties — it just can't assert their liquidity.
export function filterLiquidity(rows: StockResult[]): {
  kept: StockResult[];
  droppedIlliquid: number;
  unknown: number;
} {
  let droppedIlliquid = 0;
  let unknown = 0;
  const kept = rows.filter((r) => {
    if (r.avg_volume_30d == null) {
      unknown += 1;
      return true;
    }
    if (r.avg_volume_30d < LIQUIDITY_MIN) {
      droppedIlliquid += 1;
      return false;
    }
    return true;
  });
  return { kept, droppedIlliquid, unknown };
}

export const FLAG_INFO: Record<FunnelFlag, { label: string; tip: string }> = {
  earnings_spike: {
    label: "Lợi nhuận bất thường?",
    tip: "EPS tăng mạnh nhưng doanh thu không tăng tương ứng — có thể do khoản bất thường. Mở chi tiết để xem chuỗi ROE nhiều năm (Kim Chỉ Nam) xác nhận lợi nhuận có bền vững không.",
  },
  high_leverage: {
    label: "Đòn bẩy cao",
    tip: "Nợ/Vốn CSH > 2 — đòn bẩy tài chính cao.",
  },
};

// Tier 2 — earnings-quality flags from raw metrics only (no AI, no BCTC).
export function tier2Flags(s: StockResult): FunnelFlag[] {
  const flags: FunnelFlag[] = [];
  if (
    s.eps_growth != null &&
    s.eps_growth > 50 &&
    (s.revenue_growth == null || s.revenue_growth < s.eps_growth / 2)
  ) {
    flags.push("earnings_spike");
  }
  if (s.debt_equity != null && s.debt_equity > 2) flags.push("high_leverage");
  return flags;
}

// Rank: clean (unflagged) first, then by Compass short-term desc; flagged last.
export function rankFunnel(rows: FunnelRow[]): FunnelRow[] {
  return [...rows].sort((a, b) => {
    const af = a.flags.length > 0 ? 1 : 0;
    const bf = b.flags.length > 0 ? 1 : 0;
    if (af !== bf) return af - bf;
    return (b.shortTerm ?? -1) - (a.shortTerm ?? -1);
  });
}

// Run async fn over items with bounded concurrency, preserving order.
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
