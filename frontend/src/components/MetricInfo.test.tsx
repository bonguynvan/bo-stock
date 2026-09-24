import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MetricInfo from "@/components/MetricInfo";
import { METRIC_TOOLTIPS } from "@/lib/metricTooltips";

describe("MetricInfo", () => {
  it("renders the definition, formula and benchmark for a known metric", () => {
    render(<MetricInfo metricKey="roe" />);
    const t = METRIC_TOOLTIPS.roe;
    expect(screen.getByText(t.definition)).toBeInTheDocument();
    expect(screen.getByText(t.benchmark)).toBeInTheDocument();
    expect(screen.getByText(`= ${t.formula}`)).toBeInTheDocument();
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("renders nothing for an unknown metric", () => {
    const { container } = render(<MetricInfo metricKey="nope" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("does not bubble clicks (so a header sort handler is not triggered)", async () => {
    const user = userEvent.setup();
    const onParentClick = vi.fn();
    render(
      <div onClick={onParentClick}>
        <MetricInfo metricKey="pe" />
      </div>,
    );
    await user.click(screen.getByLabelText("Giải thích P/E"));
    expect(onParentClick).not.toHaveBeenCalled();
  });
});
