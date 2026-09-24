"use client";

import { useEffect, useRef } from "react";
import type { OhlcBar } from "@/types/stock";

interface PriceChartProps {
  bars: OhlcBar[];
  height?: number;
}

// Minimal structural type for what we use off the Chart instance.
interface ChartInstance {
  setData(bars: { time: number; open: number; high: number; low: number; close: number; volume: number }[]): void;
  fitContent(): void;
  destroy(): void;
}

/**
 * Price chart powered by @tradecanvas/chart (canvas OHLC engine). Trading/alerts
 * features are disabled — this is a research tool, no order execution. Imported
 * dynamically so the canvas engine never runs during SSR.
 */
export default function PriceChart({ bars, height = 360 }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const candles = bars
      .filter((b) => b.open != null && b.high != null && b.low != null && b.close != null)
      .map((b) => ({
        time: new Date(b.time).getTime(), // OHLCBar.time = unix ms
        open: b.open as number,
        high: b.high as number,
        low: b.low as number,
        close: b.close as number,
        volume: b.volume ?? 0,
      }));
    if (candles.length === 0) return;

    let chart: ChartInstance | null = null;
    let cancelled = false;

    void (async () => {
      const { Chart, DARK_THEME } = await import("@tradecanvas/chart");
      if (cancelled || !containerRef.current) return;
      chart = new Chart(containerRef.current, {
        chartType: "candlestick",
        theme: DARK_THEME,
        autoScale: true,
        rightMargin: 5,
        features: {
          trading: false, // research-only: no order execution
          alerts: false,
          volume: true,
          crosshair: true,
          legend: true,
          screenshot: true,
          logScale: true,
          indicators: true,
          drawings: true,
          drawingMagnet: true,
          drawingUndoRedo: true,
          keyboard: true,
          barCountdown: false,
          watermark: false,
        },
      }) as unknown as ChartInstance;
      chart.setData(candles);
      chart.fitContent(); // show the full range (matters for sparse/illiquid tickers)
    })();

    return () => {
      cancelled = true;
      chart?.destroy();
    };
  }, [bars, height]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
}
