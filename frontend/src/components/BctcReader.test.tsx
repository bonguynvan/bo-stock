import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BctcReader from "@/components/BctcReader";
import type { DocumentMeta } from "@/types/stock";

vi.mock("@/lib/api", () => ({
  getDocuments: vi.fn(),
  uploadDocument: vi.fn(),
  analyzeDocument: vi.fn(),
  deleteDocument: vi.fn(),
  fetchReport: vi.fn(),
  getAvailableReports: vi.fn(),
}));

import { analyzeDocument, getDocuments } from "@/lib/api";

const analyzedDoc: DocumentMeta = {
  id: 1,
  symbol: "FPT",
  filename: "bctc-q1.pdf",
  size_bytes: 2048,
  analysis: {
    key_figures: [{ label: "Doanh thu", value: "12,480", unit: "tỷ" }],
    summary: "Doanh thu tăng trưởng tốt.",
    yoy_changes: ["LN sau thuế +14%"],
    risk_flags: ["Phải thu tăng nhanh"],
  },
  analysis_model: "claude-sonnet-4-6",
  uploaded_at: null,
  analyzed_at: null,
};

const noop = () => {};

beforeEach(() => {
  vi.mocked(getDocuments).mockResolvedValue([]);
  vi.mocked(analyzeDocument).mockResolvedValue(analyzedDoc);
});
afterEach(() => vi.clearAllMocks());

describe("BctcReader", () => {
  it("shows the empty state and reports no analyzed docs", async () => {
    const onHasAnalyzedChange = vi.fn();
    render(<BctcReader symbol="FPT" onToast={noop} onHasAnalyzedChange={onHasAnalyzedChange} />);
    expect(await screen.findByText(/Chưa có BCTC/)).toBeInTheDocument();
    await waitFor(() => expect(onHasAnalyzedChange).toHaveBeenCalledWith(false));
  });

  it("reports hasAnalyzed=true and renders analysis when a doc is analyzed", async () => {
    vi.mocked(getDocuments).mockResolvedValue([analyzedDoc]);
    const onHasAnalyzedChange = vi.fn();
    render(<BctcReader symbol="FPT" onToast={noop} onHasAnalyzedChange={onHasAnalyzedChange} />);
    expect(await screen.findByText("Doanh thu")).toBeInTheDocument();
    await waitFor(() => expect(onHasAnalyzedChange).toHaveBeenCalledWith(true));
  });

  it("confirms then analyzes, firing onAnalyzed", async () => {
    const user = userEvent.setup();
    vi.mocked(getDocuments).mockResolvedValue([{ ...analyzedDoc, analysis: null }]);
    const onAnalyzed = vi.fn();
    render(<BctcReader symbol="FPT" onToast={noop} onAnalyzed={onAnalyzed} />);
    await screen.findByText("bctc-q1.pdf");
    await user.click(screen.getByText("Phân tích AI"));
    expect(analyzeDocument).not.toHaveBeenCalled();
    await user.click(screen.getByText("Phân tích (dùng credit)"));
    await waitFor(() => expect(analyzeDocument).toHaveBeenCalledWith(1, false));
    await waitFor(() => expect(onAnalyzed).toHaveBeenCalled());
  });
});
