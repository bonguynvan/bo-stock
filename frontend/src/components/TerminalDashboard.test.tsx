import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TerminalDashboard from "@/components/TerminalDashboard";

vi.mock("@/lib/api", () => ({
  getDashboardLayout: vi.fn(),
  updateDashboardLayout: vi.fn().mockResolvedValue({ tiles: [], allowed: [], updated_at: null }),
  getWorldMarkets: vi.fn().mockResolvedValue([]),
  getCryptoMarkets: vi.fn().mockResolvedValue([]),
  getFxMarkets: vi.fn().mockResolvedValue([]),
  getWorldBank: vi.fn().mockResolvedValue([]),
  getCommodities: vi.fn().mockResolvedValue([]),
  getAseanGdp: vi.fn().mockResolvedValue([]),
  getNewsChannels: vi.fn().mockResolvedValue([]),
  getChannelNews: vi.fn().mockResolvedValue([]),
  getSectorsOverview: vi.fn().mockResolvedValue({ sectors: [], count: 0, change_available: false }),
  getMovers: vi.fn().mockResolvedValue({
    gainers: [], losers: [], most_active: [],
    breadth: { advancers: 0, decliners: 0, unchanged: 0, total: 0 },
    change_available: false,
  }),
  getDbnomics: vi.fn().mockResolvedValue([]),
  getForeignFlow: vi.fn().mockResolvedValue({ available: false }),
  screenerFilter: vi.fn().mockResolvedValue({ data: [], meta: null }),
  getWatchlists: vi.fn().mockResolvedValue([]),
  getWatchlistMetrics: vi.fn().mockResolvedValue([]),
  getMacro: vi.fn().mockResolvedValue({ points: [], configured: false, note: null }),
}));

import { getDashboardLayout, updateDashboardLayout } from "@/lib/api";

function setup() {
  return render(<TerminalDashboard onOpenSymbol={vi.fn()} onCommand={vi.fn()} />);
}

describe("TerminalDashboard", () => {
  beforeEach(() => {
    vi.mocked(getDashboardLayout).mockReset();
    vi.mocked(updateDashboardLayout).mockClear();
  });

  it("renders only the saved tiles in order", async () => {
    vi.mocked(getDashboardLayout).mockResolvedValue({
      tiles: ["world", "crypto"],
      allowed: [],
      updated_at: null,
    });
    setup();
    await waitFor(() => expect(screen.getByText("Thị trường thế giới")).toBeInTheDocument());
    expect(screen.getByText("Crypto")).toBeInTheDocument();
    // Hidden tile is absent.
    expect(screen.queryByText("Vĩ mô toàn cầu")).not.toBeInTheDocument();
  });

  it("hides a panel in edit mode and persists the new layout", async () => {
    const user = userEvent.setup();
    vi.mocked(getDashboardLayout).mockResolvedValue({
      tiles: ["world", "crypto"],
      allowed: [],
      updated_at: null,
    });
    setup();
    await waitFor(() => expect(screen.getByText("Thị trường thế giới")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Tùy chỉnh/ }));
    // First tile (world) hide button.
    const hideButtons = screen.getAllByRole("button", { name: "Ẩn panel" });
    await user.click(hideButtons[0]);

    expect(updateDashboardLayout).toHaveBeenCalledWith(["crypto"]);
  });

  it("shows an add-panel row for hidden tiles in edit mode", async () => {
    const user = userEvent.setup();
    vi.mocked(getDashboardLayout).mockResolvedValue({
      tiles: ["world"],
      allowed: [],
      updated_at: null,
    });
    setup();
    await waitFor(() => expect(screen.getByText("Thị trường thế giới")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /Tùy chỉnh/ }));
    expect(screen.getByText("Thêm panel:")).toBeInTheDocument();
    // Adding macro persists it appended.
    await user.click(screen.getByRole("button", { name: /Vĩ mô toàn cầu/ }));
    expect(updateDashboardLayout).toHaveBeenCalledWith(["world", "macro"]);
  });
});
