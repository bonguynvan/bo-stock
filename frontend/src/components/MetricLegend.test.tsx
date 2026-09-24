import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MetricLegend from "@/components/MetricLegend";
import { METRIC_TOOLTIPS } from "@/lib/metricTooltips";

describe("MetricLegend", () => {
  it("opens a dialog listing the metric definitions and closes again", async () => {
    const user = userEvent.setup();
    render(<MetricLegend />);

    // Closed initially.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByText("Chú thích chỉ số"));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    // Shows a real definition from the shared config (e.g. ROE).
    const roe = METRIC_TOOLTIPS.roe;
    expect(screen.getByText(roe.definition)).toBeInTheDocument();
    expect(screen.getByText(roe.benchmark)).toBeInTheDocument();

    await user.click(screen.getByLabelText("Đóng"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
