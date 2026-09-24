import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NewsTerminalPanel from "@/components/NewsTerminalPanel";
import type { NewsChannel, NewsItem } from "@/types/stock";

vi.mock("@/lib/api", () => ({
  getNewsChannels: vi.fn(),
  getChannelNews: vi.fn(),
}));

import { getChannelNews, getNewsChannels } from "@/lib/api";

const channels: NewsChannel[] = [
  { key: "vn", label: "Việt Nam" },
  { key: "world", label: "Thế giới" },
];

const vnItems: NewsItem[] = [
  { title: "Tin VN 1", link: "http://x/vn1", published: "", published_iso: null, source: "CafeF", summary: "" },
];
const worldItems: NewsItem[] = [
  { title: "World news 1", link: "http://x/w1", published: "", published_iso: null, source: "CNBC", summary: "" },
];

describe("NewsTerminalPanel", () => {
  beforeEach(() => {
    vi.mocked(getNewsChannels).mockReset();
    vi.mocked(getChannelNews).mockReset();
  });

  it("loads the first channel and switches on tab click", async () => {
    const user = userEvent.setup();
    vi.mocked(getNewsChannels).mockResolvedValue(channels);
    vi.mocked(getChannelNews).mockImplementation(async (key: string) =>
      key === "vn" ? vnItems : worldItems,
    );

    render(<NewsTerminalPanel />);
    // Default = first channel (vn).
    await waitFor(() => expect(screen.getByText("Tin VN 1")).toBeInTheDocument());
    expect(getChannelNews).toHaveBeenCalledWith("vn");

    // Switch to the world tab.
    await user.click(screen.getByRole("button", { name: "Thế giới" }));
    await waitFor(() => expect(screen.getByText("World news 1")).toBeInTheDocument());
    expect(getChannelNews).toHaveBeenCalledWith("world");
  });
});
