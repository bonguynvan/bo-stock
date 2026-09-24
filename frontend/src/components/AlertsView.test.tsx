import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AlertsView from "@/components/AlertsView";
import type { AlertsConfig, TriggeredAlert } from "@/types/stock";

vi.mock("@/lib/api", () => ({
  getAlerts: vi.fn(),
  updateAlerts: vi.fn(),
  getTriggeredAlerts: vi.fn(),
  getRadarWatch: vi.fn(),
}));
import { getAlerts, getRadarWatch, getTriggeredAlerts, updateAlerts } from "@/lib/api";

const cfg = (rules: AlertsConfig["rules"]): AlertsConfig => ({
  rules,
  metrics: ["pe", "roe", "close_price"],
  ops: { lt: "<", lte: "≤", gt: ">", gte: "≥" },
  updated_at: null,
});

describe("AlertsView", () => {
  beforeEach(() => {
    vi.mocked(getAlerts).mockReset();
    vi.mocked(updateAlerts).mockReset();
    vi.mocked(getTriggeredAlerts).mockReset();
    vi.mocked(getRadarWatch).mockReset();
    vi.mocked(getRadarWatch).mockResolvedValue([]); // radar-watch defaults to empty
  });

  it("lists rules and shows the currently-firing ones", async () => {
    vi.mocked(getAlerts).mockResolvedValue(
      cfg([{ id: 1, symbol: "FPT", metric: "pe", op: "lt", value: 15 }]),
    );
    const fired: TriggeredAlert[] = [
      { id: 1, symbol: "FPT", metric: "pe", op: "lt", value: 15, current: 12 },
    ];
    vi.mocked(getTriggeredAlerts).mockResolvedValue(fired);

    render(<AlertsView />);
    await waitFor(() => expect(screen.getByText("Đang kích hoạt (1)")).toBeInTheDocument());
    expect(screen.getByText(/hiện 12/)).toBeInTheDocument();
  });

  it("surfaces followed symbols that are on the risk radar", async () => {
    vi.mocked(getAlerts).mockResolvedValue(cfg([]));
    vi.mocked(getTriggeredAlerts).mockResolvedValue([]);
    vi.mocked(getRadarWatch).mockResolvedValue([
      {
        symbol: "HAG", company_name: "HAGL", conviction_overall: "elevated_risk",
        earnings_quality_flag: "weak", beneish_flag: "high_risk", altman_em_zone: "distress",
        reasons: ["Beneish: rủi ro thao túng cao", "Chất lượng lợi nhuận thấp"],
      },
    ]);
    render(<AlertsView />);
    await waitFor(() =>
      expect(screen.getByText(/Radar rủi ro — mã đang theo dõi \(1\)/)).toBeInTheDocument(),
    );
    expect(screen.getByText("HAG")).toBeInTheDocument();
    expect(screen.getByText(/Beneish: rủi ro thao túng cao/)).toBeInTheDocument();
  });

  it("adds a rule → saves normalized config and re-evaluates", async () => {
    const user = userEvent.setup();
    vi.mocked(getAlerts).mockResolvedValue(cfg([]));
    vi.mocked(getTriggeredAlerts).mockResolvedValue([]);
    vi.mocked(updateAlerts).mockResolvedValue(
      cfg([{ id: 1, symbol: "VCB", metric: "roe", op: "gt", value: 18 }]),
    );

    render(<AlertsView />);
    await waitFor(() => expect(screen.getByText("Quy tắc (0)")).toBeInTheDocument());

    await user.type(screen.getByLabelText("Mã"), "vcb");
    await user.selectOptions(screen.getByLabelText("Chỉ số"), "roe");
    await user.selectOptions(screen.getByLabelText("Điều kiện"), "gt");
    await user.type(screen.getByLabelText("Ngưỡng"), "18");
    await user.click(screen.getByRole("button", { name: "Thêm" }));

    await waitFor(() =>
      expect(vi.mocked(updateAlerts)).toHaveBeenCalledWith([
        { symbol: "VCB", metric: "roe", op: "gt", value: 18, note: undefined },
      ]),
    );
  });
});
