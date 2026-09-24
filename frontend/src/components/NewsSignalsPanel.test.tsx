import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NewsSignalsPanel from "@/components/NewsSignalsPanel";
import type { NewsSignals } from "@/types/stock";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, postNewsSignals: vi.fn() };
});

import { postNewsSignals } from "@/lib/api";

const result: NewsSignals = {
  available: true,
  symbol: "ABC",
  analyzed_count: 8,
  signals: [
    {
      headline: "Chủ tịch ABC đăng ký bán 2 triệu cổ phiếu",
      event_type: "insider_shareholder", sentiment: "negative",
      extract: "Chủ tịch đăng ký bán cổ phiếu.",
      published: "2026-07-30T08:00:00+07:00", source: "CafeF", link: "https://x/1",
    },
  ],
  summary: { net_sentiment: "negative", dominant_events: ["insider_shareholder"], note: "Tin chưa kiểm chứng." },
};

afterEach(() => vi.clearAllMocks());

describe("NewsSignalsPanel", () => {
  it("only calls the AI on an explicit button press, then renders signals", async () => {
    vi.mocked(postNewsSignals).mockResolvedValue(result);
    const user = userEvent.setup();
    render(<NewsSignalsPanel symbol="ABC" />);
    // nothing fetched on mount (AI runs only on explicit action)
    expect(postNewsSignals).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Phân tích tin gần đây/ }));
    await waitFor(() => expect(postNewsSignals).toHaveBeenCalledWith("ABC"));
    expect(await screen.findByText("Nội bộ/Cổ đông lớn")).toBeInTheDocument();
    expect(screen.getByText(/Tiêu cực/)).toBeInTheDocument();
    expect(screen.queryByText(/MUA|BÁN cổ phiếu ngay/)).not.toBeInTheDocument();
  });

  it("shows the setup hint on a 503", async () => {
    const { ApiError } = await import("@/lib/api");
    vi.mocked(postNewsSignals).mockRejectedValue(new ApiError("no key", 503));
    const user = userEvent.setup();
    render(<NewsSignalsPanel symbol="ABC" />);
    await user.click(screen.getByRole("button", { name: /Phân tích tin gần đây/ }));
    expect(await screen.findByText(/ANTHROPIC_API_KEY/)).toBeInTheDocument();
  });
});
