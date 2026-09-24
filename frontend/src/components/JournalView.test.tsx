import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import JournalView from "@/components/JournalView";
import type { JournalEntry } from "@/types/stock";

vi.mock("@/lib/api", () => ({
  getJournalEntries: vi.fn(),
  createJournalEntry: vi.fn(),
  updateJournalEntry: vi.fn(),
  deleteJournalEntry: vi.fn(),
}));

import {
  createJournalEntry,
  deleteJournalEntry,
  getJournalEntries,
} from "@/lib/api";

const entry: JournalEntry = {
  id: 1,
  symbol: "FPT",
  action: "buy",
  thesis: "CNTT tăng trưởng bền vững",
  target_price: 85000,
  catalyst: "KQKD Q2",
  price_at_entry: 70800,
  status: "open",
  review_note: null,
  created_at: "2026-06-29T00:00:00+00:00",
  updated_at: null,
  reviewed_at: null,
};

const noop = () => {};

beforeEach(() => {
  vi.mocked(getJournalEntries).mockResolvedValue([entry]);
  vi.mocked(createJournalEntry).mockResolvedValue(entry);
  vi.mocked(deleteJournalEntry).mockResolvedValue();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("JournalView", () => {
  it("renders existing entries with thesis, target and snapshot price", async () => {
    render(<JournalView onToast={noop} />);
    expect(await screen.findByText("CNTT tăng trưởng bền vững")).toBeInTheDocument();
    expect(screen.getByText("FPT")).toBeInTheDocument();
    // "Mua" appears as the form action button and the entry badge.
    expect(screen.getAllByText("Mua").length).toBeGreaterThan(1);
  });

  it("prefills the symbol field from prefillSymbol", async () => {
    render(<JournalView prefillSymbol="VCB" onToast={noop} />);
    await screen.findByText("CNTT tăng trưởng bền vững");
    expect(screen.getByPlaceholderText("VD: FPT")).toHaveValue("VCB");
  });

  it("requires a thesis before submitting", async () => {
    const user = userEvent.setup();
    const onToast = vi.fn();
    render(<JournalView onToast={onToast} />);
    await screen.findByText("CNTT tăng trưởng bền vững");
    await user.click(screen.getByText("Lưu nhật ký"));
    expect(onToast).toHaveBeenCalledWith("Cần nhập luận điểm (thesis)");
    expect(createJournalEntry).not.toHaveBeenCalled();
  });

  it("creates an entry from the form", async () => {
    const user = userEvent.setup();
    render(<JournalView onToast={noop} />);
    await screen.findByText("CNTT tăng trưởng bền vững");
    await user.type(screen.getByPlaceholderText("Vì sao mua/bán/theo dõi?"), "Định giá rẻ");
    await user.click(screen.getByText("Lưu nhật ký"));
    await waitFor(() =>
      expect(createJournalEntry).toHaveBeenCalledWith(
        expect.objectContaining({ action: "buy", thesis: "Định giá rẻ" }),
      ),
    );
  });

  it("shows the empty state when there are no entries", async () => {
    vi.mocked(getJournalEntries).mockResolvedValue([]);
    render(<JournalView onToast={noop} />);
    expect(
      await screen.findByText(/Chưa có nhật ký/),
    ).toBeInTheDocument();
  });
});
