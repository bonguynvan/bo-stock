import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WatchlistPanel from "@/components/WatchlistPanel";
import type { SavedScreen, Watchlist } from "@/types/stock";

const watchlists: Watchlist[] = [
  { id: 1, name: "Bluechips", symbols: ["FPT", "VCB"], created_at: null },
];
const savedScreens: SavedScreen[] = [
  { id: 9, name: "ROE>20", criteria: { roe_min: 20 } },
];

function setup(overrides: Partial<Parameters<typeof WatchlistPanel>[0]> = {}) {
  const props = {
    watchlists,
    activeId: null as number | null,
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    onDelete: vi.fn(),
    savedScreens,
    onLoadScreen: vi.fn(),
    onDeleteScreen: vi.fn(),
    ...overrides,
  };
  render(<WatchlistPanel {...props} />);
  return props;
}

describe("WatchlistPanel", () => {
  it("lists watchlists with symbol counts and saved screens", () => {
    setup();
    expect(screen.getByText("Bluechips")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // symbol count
    expect(screen.getByText("ROE>20")).toBeInTheDocument();
  });

  it("selects a watchlist on click", async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByText("Bluechips"));
    expect(props.onSelect).toHaveBeenCalledWith(1);
  });

  it("clears to screener mode via 'Tất cả cổ phiếu'", async () => {
    const user = userEvent.setup();
    const props = setup({ activeId: 1 });
    await user.click(screen.getByText(/Tất cả cổ phiếu/));
    expect(props.onSelect).toHaveBeenCalledWith(null);
  });

  it("loads a saved screen on click", async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByText("ROE>20"));
    expect(props.onLoadScreen).toHaveBeenCalledWith(9);
  });

  it("triggers create + delete handlers", async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByLabelText("Tạo danh mục mới"));
    expect(props.onCreate).toHaveBeenCalled();
    await user.click(screen.getByLabelText("Xóa danh mục Bluechips"));
    expect(props.onDelete).toHaveBeenCalledWith(1);
  });

  it("shows empty hints when there are no watchlists or screens", () => {
    setup({ watchlists: [], savedScreens: [] });
    expect(screen.getByText(/Chưa có danh mục/)).toBeInTheDocument();
    expect(screen.getByText(/Chưa có bộ lọc/)).toBeInTheDocument();
  });
});
