import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SymbolNotesPanel from "@/components/SymbolNotesPanel";
import type { Note } from "@/types/stock";

vi.mock("@/lib/api", () => ({
  getNotes: vi.fn(),
  createNote: vi.fn(),
  deleteNote: vi.fn(),
}));
import { createNote, deleteNote, getNotes } from "@/lib/api";

const note = (id: number, content: string): Note => ({
  id,
  symbol: "FPT",
  content,
  created_at: "2026-07-30T10:00:00",
  updated_at: null,
});

describe("SymbolNotesPanel", () => {
  beforeEach(() => {
    vi.mocked(getNotes).mockReset();
    vi.mocked(createNote).mockReset();
    vi.mocked(deleteNote).mockReset();
  });

  it("lists existing notes for the symbol", async () => {
    vi.mocked(getNotes).mockResolvedValue([note(1, "ROE bền")]);
    render(<SymbolNotesPanel symbol="FPT" />);
    await waitFor(() => expect(screen.getByText("ROE bền")).toBeInTheDocument());
    expect(getNotes).toHaveBeenCalledWith("FPT");
  });

  it("adds a note and prepends it", async () => {
    const user = userEvent.setup();
    vi.mocked(getNotes).mockResolvedValue([]);
    vi.mocked(createNote).mockResolvedValue(note(2, "Định giá hấp dẫn"));
    render(<SymbolNotesPanel symbol="FPT" />);
    await waitFor(() => expect(screen.getByText(/Chưa có ghi chú/)).toBeInTheDocument());

    await user.type(screen.getByLabelText("Ghi chú về FPT"), "Định giá hấp dẫn");
    await user.click(screen.getByRole("button", { name: "Thêm ghi chú" }));

    await waitFor(() => expect(createNote).toHaveBeenCalledWith("Định giá hấp dẫn", "FPT"));
    await waitFor(() => expect(screen.getByText("Định giá hấp dẫn")).toBeInTheDocument());
  });

  it("deletes a note", async () => {
    const user = userEvent.setup();
    vi.mocked(getNotes).mockResolvedValue([note(3, "Xóa tôi")]);
    vi.mocked(deleteNote).mockResolvedValue(undefined);
    render(<SymbolNotesPanel symbol="FPT" />);
    await waitFor(() => expect(screen.getByText("Xóa tôi")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Xóa ghi chú 3" }));
    await waitFor(() => expect(deleteNote).toHaveBeenCalledWith(3));
    expect(screen.queryByText("Xóa tôi")).not.toBeInTheDocument();
  });
});
