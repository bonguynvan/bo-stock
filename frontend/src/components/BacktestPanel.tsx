"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Backtest, BacktestStats } from "@/types/stock";
import { getBacktest } from "@/lib/api";
import { EMPTY, changeColor, fmtDecimal, fmtPercent, isNum } from "@/lib/format";

/** Dual equity curve — strategy (primary) vs buy-and-hold (muted). */
function EquityChart({ points }: { points: NonNullable<Backtest["equity"]> }) {
  if (points.length < 2) return null;
  const vals = points.flatMap((p) => [p.s, p.b]);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const w = 460;
  const h = 90;
  const line = (key: "s" | "b") =>
    points
      .map((p, i) => `${(i / (points.length - 1)) * w},${h - ((p[key] - min) / span) * h}`)
      .join(" ");
  return (
    <div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        style={{ maxWidth: 480 }}
        preserveAspectRatio="none"
        role="img"
        aria-label="Đường vốn: nét đậm = chiến lược, nét mờ = mua và giữ"
      >
        <polyline points={line("b")} fill="none" strokeWidth="1.5" className="stroke-on-surface-variant/50" />
        <polyline points={line("s")} fill="none" strokeWidth="2" className="stroke-primary" />
      </svg>
      <div className="flex gap-3 text-data-sm mt-1">
        <span className="flex items-center gap-1 text-primary">
          <span className="inline-block w-3 h-0.5 bg-primary" /> Chiến lược
        </span>
        <span className="flex items-center gap-1 text-on-surface-variant">
          <span className="inline-block w-3 h-0.5 bg-on-surface-variant/50" /> Mua &amp; giữ
        </span>
      </div>
    </div>
  );
}

function StatRow({ label, s, b, fmt }: { label: string; s: number | null; b: number | null; fmt: (v: number | null) => string }) {
  return (
    <tr className="border-b border-outline-variant/50">
      <td className="py-1 text-on-surface-variant">{label}</td>
      <td className="py-1 text-right font-bold text-primary tabular-nums">{fmt(s)}</td>
      <td className="py-1 text-right text-on-surface tabular-nums">{fmt(b)}</td>
    </tr>
  );
}

const pctOf = (v: number | null | undefined) => (isNum(v) ? fmtPercent(v * 100, 1) : EMPTY);
const dec = (v: number | null | undefined) => (isNum(v) ? fmtDecimal(v, 2) : EMPTY);

export default function BacktestPanel({ symbol }: { symbol: string }) {
  const [fast, setFast] = useState(20);
  const [slow, setSlow] = useState(50);
  const [data, setData] = useState<Backtest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<(() => void) | undefined>(undefined);

  const run = useCallback(
    (f: number, s: number) => {
      let cancelled = false;
      setLoading(true);
      setError(null);
      getBacktest(symbol, f, s)
        .then((d) => !cancelled && setData(d))
        .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Lỗi tải dữ liệu"))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    },
    [symbol],
  );

  // Cancel any in-flight run before starting a new one (manual re-run or symbol change).
  const runNow = useCallback(
    (f: number, s: number) => {
      cancelRef.current?.();
      cancelRef.current = run(f, s);
    },
    [run],
  );

  useEffect(() => {
    runNow(fast, slow);
    return () => cancelRef.current?.();
  }, [symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  const st: BacktestStats = data?.strategy ?? { annual_volatility: null, sharpe: null, max_drawdown: null };
  const bh: BacktestStats = data?.buyhold ?? { annual_volatility: null, sharpe: null, max_drawdown: null };

  return (
    <div className="p-3 space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runNow(fast, slow);
        }}
        className="flex items-end gap-2 flex-wrap"
      >
        <label className="text-data-sm text-on-surface-variant">
          SMA nhanh
          <input
            type="number"
            min={2}
            max={100}
            value={fast}
            onChange={(e) => setFast(Number(e.target.value))}
            aria-label="SMA nhanh"
            className="ml-1 w-16 bg-surface-container-high border border-outline-variant px-2 py-0.5 font-data-md text-data-md text-on-surface outline-none focus:border-primary"
          />
        </label>
        <label className="text-data-sm text-on-surface-variant">
          SMA chậm
          <input
            type="number"
            min={5}
            max={250}
            value={slow}
            onChange={(e) => setSlow(Number(e.target.value))}
            aria-label="SMA chậm"
            className="ml-1 w-16 bg-surface-container-high border border-outline-variant px-2 py-0.5 font-data-md text-data-md text-on-surface outline-none focus:border-primary"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="px-3 py-1 border border-primary text-primary font-label-caps text-label-caps uppercase hover:bg-primary/10 transition disabled:opacity-50"
        >
          {loading ? "Đang chạy…" : "Chạy lại"}
        </button>
      </form>

      {error ? (
        <p className="text-data-sm text-error">{error}</p>
      ) : loading && !data ? (
        <p className="text-data-sm text-on-surface-variant">Đang mô phỏng…</p>
      ) : !data || !data.available ? (
        <p className="text-data-sm text-on-surface-variant border border-outline-variant border-dashed p-2">
          {data?.note ?? "Chưa đủ dữ liệu giá để backtest."}
        </p>
      ) : (
        <>
          {data.equity && <EquityChart points={data.equity} />}
          <table className="w-full border-collapse font-data-md text-data-md">
            <thead>
              <tr className="text-on-surface-variant border-b border-outline-variant">
                <th className="py-1 text-left font-label-caps text-label-caps uppercase">Chỉ tiêu</th>
                <th className="py-1 text-right font-label-caps text-label-caps uppercase">Chiến lược</th>
                <th className="py-1 text-right font-label-caps text-label-caps uppercase">Mua &amp; giữ</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-outline-variant/50">
                <td className="py-1 text-on-surface-variant">Lợi nhuận</td>
                <td className={`py-1 text-right font-bold tabular-nums ${changeColor(data.strategy_return)}`}>
                  {isNum(data.strategy_return) ? fmtPercent(data.strategy_return, 1, true) : EMPTY}
                </td>
                <td className={`py-1 text-right tabular-nums ${changeColor(data.buyhold_return)}`}>
                  {isNum(data.buyhold_return) ? fmtPercent(data.buyhold_return, 1, true) : EMPTY}
                </td>
              </tr>
              <StatRow label="Biến động (năm)" s={st.annual_volatility} b={bh.annual_volatility} fmt={pctOf} />
              <StatRow label="Sharpe" s={st.sharpe} b={bh.sharpe} fmt={dec} />
              <StatRow label="Sụt giảm tối đa" s={st.max_drawdown} b={bh.max_drawdown} fmt={pctOf} />
            </tbody>
          </table>

          <div className="flex flex-wrap gap-3 text-data-sm text-on-surface-variant">
            <span>Số lệnh: <b className="text-on-surface">{data.trades ?? EMPTY}</b></span>
            <span>Tỉ lệ thắng: <b className="text-on-surface">{isNum(data.win_rate) ? fmtPercent(data.win_rate! * 100, 0) : EMPTY}</b></span>
            <span>Thời gian nắm giữ: <b className="text-on-surface">{isNum(data.time_in_market) ? fmtPercent(data.time_in_market! * 100, 0) : EMPTY}</b></span>
            <span>{data.days} phiên</span>
          </div>

          <p className="text-data-sm text-on-surface-variant opacity-60">
            Mô phỏng lịch sử giả định một quy tắc kỹ thuật — <b>không phải tín hiệu hay khuyến nghị</b>,
            hiệu suất quá khứ không đảm bảo tương lai. Chưa tính phí/thuế/trượt giá.
          </p>
        </>
      )}
    </div>
  );
}
