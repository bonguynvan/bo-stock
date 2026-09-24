import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsView from "@/components/SettingsView";
import type { ProvidersStatus } from "@/types/stock";

vi.mock("@/lib/api", () => ({
  getProvidersStatus: vi.fn(),
  setProvider: vi.fn(),
}));

import { getProvidersStatus, setProvider } from "@/lib/api";

const status: ProvidersStatus = {
  current: "resilient",
  default: "resilient",
  options: ["resilient", "vci", "tcbs", "fixtures"],
  sources: [
    { key: "vci", label: "VCI (Vietcap)", host: "trading.vietcap.com.vn", status: "ok", http_status: 200, latency_ms: 152, detail: "Phản hồi bình thường" },
    { key: "tcbs", label: "TCBS", host: "apipubaws.tcbs.com.vn", status: "error", http_status: 404, latency_ms: 218, detail: "HTTP 404 — bị chặn hoặc lỗi" },
  ],
};

const noop = () => {};

beforeEach(() => {
  vi.mocked(getProvidersStatus).mockResolvedValue(status);
  vi.mocked(setProvider).mockResolvedValue("vci");
});

afterEach(() => vi.clearAllMocks());

describe("SettingsView", () => {
  it("renders each source with its connectivity status", async () => {
    render(<SettingsView onToast={noop} />);
    expect(await screen.findByText("VCI (Vietcap)")).toBeInTheDocument();
    expect(screen.getByText("Kết nối tốt")).toBeInTheDocument();
    expect(screen.getByText("Bị chặn / lỗi")).toBeInTheDocument();
    expect(screen.getByText("trading.vietcap.com.vn")).toBeInTheDocument();
    expect(screen.getByText("152 ms")).toBeInTheDocument();
  });

  it("marks the current provider as active", async () => {
    render(<SettingsView onToast={noop} />);
    expect(await screen.findByText("Đang dùng")).toBeInTheDocument();
  });

  it("switches provider on click", async () => {
    const user = userEvent.setup();
    const onToast = vi.fn();
    render(<SettingsView onToast={onToast} />);
    // Click the provider button (its hint text is unique to the selector).
    await user.click(await screen.findByText(/Chỉ dùng VCI/));
    await waitFor(() => expect(setProvider).toHaveBeenCalledWith("vci"));
    expect(onToast).toHaveBeenCalled();
  });

  it("re-probes when the refresh button is clicked", async () => {
    const user = userEvent.setup();
    render(<SettingsView onToast={noop} />);
    await screen.findByText("VCI (Vietcap)");
    expect(getProvidersStatus).toHaveBeenCalledTimes(1);
    await user.click(screen.getByText(/Kiểm tra lại/));
    await waitFor(() => expect(getProvidersStatus).toHaveBeenCalledTimes(2));
  });
});
