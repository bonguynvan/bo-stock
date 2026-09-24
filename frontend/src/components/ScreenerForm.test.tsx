import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ScreenerForm, {
  DEFAULT_FORM_STATE,
  toFilterBody,
  type ScreenerFormState,
} from "@/components/ScreenerForm";

function state(overrides: Partial<ScreenerFormState> = {}): ScreenerFormState {
  return { ...DEFAULT_FORM_STATE, ...overrides };
}

describe("toFilterBody", () => {
  it("maps the default form state to a baseline body without optional fields", () => {
    const body = toFilterBody(DEFAULT_FORM_STATE);
    expect(body).toEqual({
      pe_max: 30,
      roe_min: 10,
      roa_min: 0,
      sort_by: "quant_score",
      sort_order: "desc",
      limit: 2000,
    });
  });

  it("omits sector when empty and includes it when set", () => {
    expect(toFilterBody(state({ sector: "" })).sector).toBeUndefined();
    expect(toFilterBody(state({ sector: "Ngân hàng" })).sector).toBe("Ngân hàng");
  });

  it("omits exchange when none selected and includes the array when selected", () => {
    expect(toFilterBody(state({ exchanges: [] })).exchange).toBeUndefined();
    expect(toFilterBody(state({ exchanges: ["HOSE", "HNX"] })).exchange).toEqual([
      "HOSE",
      "HNX",
    ]);
  });

  it("omits debt_equity_max when 'all' and converts the preset to a number", () => {
    expect(toFilterBody(state({ debtEquity: "all" })).debt_equity_max).toBeUndefined();
    expect(toFilterBody(state({ debtEquity: "0.5" })).debt_equity_max).toBe(0.5);
    expect(toFilterBody(state({ debtEquity: "1.0" })).debt_equity_max).toBe(1);
  });

  it("omits dividend_yield_min when 'any' and converts the preset to a number", () => {
    expect(toFilterBody(state({ dividend: "any" })).dividend_yield_min).toBeUndefined();
    expect(toFilterBody(state({ dividend: "3" })).dividend_yield_min).toBe(3);
    expect(toFilterBody(state({ dividend: "7" })).dividend_yield_min).toBe(7);
  });

  it("maps pe/roe/roa slider values onto the matching body fields", () => {
    const body = toFilterBody(state({ peMax: 12.5, roeMin: 18, roaMin: 5 }));
    expect(body.pe_max).toBe(12.5);
    expect(body.roe_min).toBe(18);
    expect(body.roa_min).toBe(5);
  });

  it("includes every optional field when the form is fully specified", () => {
    const body = toFilterBody(
      state({
        sector: "Bán lẻ",
        exchanges: ["UPCOM"],
        debtEquity: "0.5",
        dividend: "7",
      }),
    );
    expect(body).toEqual({
      pe_max: 30,
      roe_min: 10,
      roa_min: 0,
      sort_by: "quant_score",
      sort_order: "desc",
      limit: 2000,
      sector: "Bán lẻ",
      exchange: ["UPCOM"],
      debt_equity_max: 0.5,
      dividend_yield_min: 7,
    });
  });
});

describe("ScreenerForm (rendered)", () => {
  it("renders the current state in its controls", () => {
    render(
      <ScreenerForm state={DEFAULT_FORM_STATE} onChange={vi.fn()} onReset={vi.fn()} />,
    );
    expect(screen.getByText("Phân loại & Sàn")).toBeInTheDocument();
    expect(screen.getByText("0 - 30.0")).toBeInTheDocument();
    expect(screen.getByText("> 10%")).toBeInTheDocument();
  });

  it("emits a sector change via onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ScreenerForm state={DEFAULT_FORM_STATE} onChange={onChange} onReset={vi.fn()} />,
    );

    await user.selectOptions(screen.getByDisplayValue("Tất cả các ngành"), "Ngân hàng");
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ sector: "Ngân hàng" }),
    );
  });

  it("toggles an exchange on and off immutably", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <ScreenerForm state={DEFAULT_FORM_STATE} onChange={onChange} onReset={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "HOSE" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ exchanges: ["HOSE"] }),
    );

    rerender(
      <ScreenerForm
        state={{ ...DEFAULT_FORM_STATE, exchanges: ["HOSE"] }}
        onChange={onChange}
        onReset={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "HOSE" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ exchanges: [] }),
    );
  });

  it("emits ROE and dividend changes and fires onReset", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onReset = vi.fn();
    render(
      <ScreenerForm
        state={DEFAULT_FORM_STATE}
        onChange={onChange}
        onReset={onReset}
      />,
    );

    const roeInput = screen.getByDisplayValue("10");
    await user.clear(roeInput);
    await user.type(roeInput, "15");
    expect(onChange).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "+7%" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ dividend: "7" }),
    );

    await user.click(screen.getByRole("button", { name: "Làm mới bộ lọc" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("emits a debt/equity selection change", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ScreenerForm state={DEFAULT_FORM_STATE} onChange={onChange} onReset={vi.fn()} />,
    );

    await user.selectOptions(screen.getByDisplayValue("Tất cả"), "0.5");
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ debtEquity: "0.5" }),
    );
  });
});
