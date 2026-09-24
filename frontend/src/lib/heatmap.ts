// Heatmap color for a day-change %. Green for gains, red for losses, intensity by
// magnitude (clamped at ±3%). Null / near-zero → transparent (neutral surface).
// Pure + unit-tested so the visual mapping is verifiable without a DOM.

const CLAMP_PCT = 3;

export function heatColor(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct) || pct === 0) return "transparent";
  const t = Math.min(Math.abs(pct) / CLAMP_PCT, 1);
  const alpha = (0.15 + 0.55 * t).toFixed(3);
  return pct > 0 ? `rgba(34,197,94,${alpha})` : `rgba(239,68,68,${alpha})`;
}

/** Treemap-ish flex weight for a tile: bigger market cap → bigger tile (floored). */
export function tileWeight(cap: number | null | undefined, maxCap: number): number {
  if (cap == null || !Number.isFinite(cap) || maxCap <= 0) return 1;
  // sqrt compresses the range so mega-caps don't dwarf everything.
  return 1 + 4 * Math.sqrt(Math.max(cap, 0) / maxCap);
}
