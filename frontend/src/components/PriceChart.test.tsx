import { afterEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import PriceChart from "@/components/PriceChart";
import type { OhlcBar } from "@/types/stock";

const setData = vi.fn();
const fitContent = vi.fn();
const destroy = vi.fn();
const ChartMock = vi.fn(() => ({ setData, fitContent, destroy }));

vi.mock("@tradecanvas/chart", () => ({
  Chart: ChartMock,
  DARK_THEME: {},
}));

const bars: OhlcBar[] = [
  { time: "2024-01-01", open: 10, high: 12, low: 9, close: 11, volume: 100 },
  { time: "2024-01-02", open: 11, high: 13, low: 10, close: 12, volume: 200 },
  { time: "2024-01-03", open: 12, high: 12, low: 8, close: 9, volume: 150 },
];

afterEach(() => vi.clearAllMocks());

describe("PriceChart", () => {
  it("creates a tradecanvas chart and feeds it the mapped OHLC data", async () => {
    render(<PriceChart bars={bars} />);
    await waitFor(() => expect(ChartMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(setData).toHaveBeenCalledTimes(1));
    const fed = setData.mock.calls[0][0];
    expect(fed).toHaveLength(3);
    // time converted from YYYY-MM-DD to a unix-ms number
    expect(typeof fed[0].time).toBe("number");
    expect(fed[0].time).toBe(new Date("2024-01-01").getTime());
    expect(fed[0]).toMatchObject({ open: 10, high: 12, low: 9, close: 11, volume: 100 });
  });

  it("does not create a chart when there are no complete bars", async () => {
    render(
      <PriceChart bars={[{ time: "x", open: null, high: null, low: null, close: null, volume: null }]} />,
    );
    // allow any async import to settle
    await new Promise((r) => setTimeout(r, 0));
    expect(ChartMock).not.toHaveBeenCalled();
  });
});
