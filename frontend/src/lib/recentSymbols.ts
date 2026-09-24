// Recently-opened tickers for the command bar. Pure list ops + thin localStorage
// wrappers so the ordering logic stays unit-testable without a DOM.

const KEY = "vios.recentSymbols";
const CAP = 8;

/** Move `symbol` to the front, de-duplicated and capped. Returns a new array. */
export function addRecent(list: readonly string[], symbol: string): string[] {
  const s = symbol.trim().toUpperCase();
  if (!s) return [...list];
  return [s, ...list.filter((x) => x !== s)].slice(0, CAP);
}

export function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveRecent(list: readonly string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full / unavailable — non-fatal */
  }
}
