import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TabBar, { type TabItem } from "@/components/ui/Tabs";

const TABS: TabItem[] = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
  { id: "c", label: "Gamma" },
];

describe("TabBar", () => {
  it("marks the active tab as selected and roving-focusable", () => {
    render(<TabBar tabs={TABS} active="b" onChange={vi.fn()} ariaLabel="Modes" />);
    const beta = screen.getByRole("tab", { name: "Beta" });
    expect(beta).toHaveAttribute("aria-selected", "true");
    expect(beta).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute("tabindex", "-1");
  });

  it("fires onChange when a tab is clicked", () => {
    const onChange = vi.fn();
    render(<TabBar tabs={TABS} active="a" onChange={onChange} ariaLabel="Modes" />);
    fireEvent.click(screen.getByRole("tab", { name: "Gamma" }));
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("moves selection with ArrowRight and wraps at the end", () => {
    const onChange = vi.fn();
    render(<TabBar tabs={TABS} active="c" onChange={onChange} ariaLabel="Modes" />);
    fireEvent.keyDown(screen.getByRole("tab", { name: "Gamma" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("jumps to the first tab with Home and last with End", () => {
    const onChange = vi.fn();
    render(<TabBar tabs={TABS} active="b" onChange={onChange} ariaLabel="Modes" />);
    fireEvent.keyDown(screen.getByRole("tab", { name: "Beta" }), { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("c");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Beta" }), { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("a");
  });
});
