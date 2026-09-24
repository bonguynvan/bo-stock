import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NlScreenerBar from "@/components/NlScreenerBar";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, nlScreener: vi.fn() };
});
import { nlScreener } from "@/lib/api";

describe("NlScreenerBar", () => {
  beforeEach(() => vi.mocked(nlScreener).mockReset());

  it("applies the AI-built filter and toasts", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onToast = vi.fn();
    vi.mocked(nlScreener).mockResolvedValue({ sector: "Ngân hàng", roe_min: 18, pb_max: 1.5 });

    render(<NlScreenerBar onApply={onApply} onToast={onToast} />);
    await user.type(screen.getByLabelText("Lọc bằng lời"), "ngân hàng ROE>18 P/B<1.5");
    await user.click(screen.getByRole("button", { name: "Tạo bộ lọc" }));

    await waitFor(() =>
      expect(onApply).toHaveBeenCalledWith({ sector: "Ngân hàng", roe_min: 18, pb_max: 1.5 }),
    );
    expect(onToast).toHaveBeenCalledWith("Đã tạo bộ lọc từ mô tả.");
  });

  it("toasts when no criteria were recognized", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onToast = vi.fn();
    vi.mocked(nlScreener).mockResolvedValue({});
    render(<NlScreenerBar onApply={onApply} onToast={onToast} />);
    await user.type(screen.getByLabelText("Lọc bằng lời"), "gì đó mơ hồ");
    await user.click(screen.getByRole("button", { name: "Tạo bộ lọc" }));
    await waitFor(() => expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/Không nhận ra/)));
    expect(onApply).not.toHaveBeenCalled();
  });
});
