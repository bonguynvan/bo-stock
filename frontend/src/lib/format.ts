// Display helpers. Every metric can be null — always degrade to an em-dash.

export const EMPTY = "—";

export function isNum(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function fmtNumber(
  value: number | null | undefined,
  fractionDigits = 0,
): string {
  if (!isNum(value)) return EMPTY;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function fmtDecimal(
  value: number | null | undefined,
  fractionDigits = 1,
): string {
  if (!isNum(value)) return EMPTY;
  return value.toFixed(fractionDigits);
}

export function fmtPercent(
  value: number | null | undefined,
  fractionDigits = 2,
  withSign = false,
): string {
  if (!isNum(value)) return EMPTY;
  const sign = withSign && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(fractionDigits)}%`;
}

// Color class for day-change style values: green up, red down, neutral flat.
export function changeColor(value: number | null | undefined): string {
  if (!isNum(value) || value === 0) return "text-on-surface-variant";
  return value > 0 ? "text-secondary" : "text-error";
}

// ROE coloring rule: > 20% green, < 10% red, otherwise neutral.
export function roeColor(value: number | null | undefined): string {
  if (!isNum(value)) return "text-on-surface-variant";
  if (value > 20) return "text-secondary";
  if (value < 10) return "text-error";
  return "text-on-surface";
}

// Map a 0-100 quant score to a bar width percentage (clamped).
export function scoreWidth(value: number | null | undefined): number {
  if (!isNum(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return EMPTY;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return EMPTY;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${pad(
    d.getDate(),
  )}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
