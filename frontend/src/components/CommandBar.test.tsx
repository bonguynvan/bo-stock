import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CommandBar from "@/components/CommandBar";

function setup() {
  const onCommand = vi.fn();
  const onSymbol = vi.fn();
  render(<CommandBar onCommand={onCommand} onSymbol={onSymbol} />);
  return { onCommand, onSymbol };
}

describe("CommandBar", () => {
  beforeEach(() => window.localStorage.clear());

  it("is hidden until opened", () => {
    setup();
    expect(screen.queryByLabelText("Thanh lệnh terminal")).not.toBeInTheDocument();
  });

  it("opens on Ctrl+K and lists function codes", async () => {
    const user = userEvent.setup();
    setup();
    await user.keyboard("{Control>}k{/Control}");
    expect(screen.getByLabelText("Thanh lệnh terminal")).toBeInTheDocument();
    expect(screen.getByText("SCREEN")).toBeInTheDocument();
    expect(screen.getByText("WORLD")).toBeInTheDocument();
  });

  it("treats a ticker-like input as a symbol and emits onSymbol", async () => {
    const user = userEvent.setup();
    const { onSymbol, onCommand } = setup();
    await user.keyboard("{Control>}k{/Control}");
    await user.type(screen.getByLabelText("Thanh lệnh terminal"), "fpt");
    await user.keyboard("{Enter}");
    expect(onSymbol).toHaveBeenCalledWith("FPT");
    expect(onCommand).not.toHaveBeenCalled();
  });

  it("emits onCommand for a matched function code", async () => {
    const user = userEvent.setup();
    const { onCommand } = setup();
    await user.keyboard("{Control>}k{/Control}");
    await user.type(screen.getByLabelText("Thanh lệnh terminal"), "WORLD");
    await user.keyboard("{Enter}");
    expect(onCommand).toHaveBeenCalledWith("WORLD");
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    setup();
    await user.keyboard("{Control>}k{/Control}");
    expect(screen.getByLabelText("Thanh lệnh terminal")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText("Thanh lệnh terminal")).not.toBeInTheDocument();
  });

  it("HELP opens an in-bar help overlay instead of navigating", async () => {
    const user = userEvent.setup();
    const { onCommand } = setup();
    await user.keyboard("{Control>}k{/Control}");
    await user.type(screen.getByLabelText("Thanh lệnh terminal"), "HELP");
    await user.keyboard("{Enter}");
    expect(screen.getByText("Phím tắt")).toBeInTheDocument();
    expect(onCommand).not.toHaveBeenCalled();
    // Bar stays open on help.
    expect(screen.getByLabelText("Thanh lệnh terminal")).toBeInTheDocument();
  });

  it("remembers recently opened symbols and reopens them from a chip", async () => {
    const user = userEvent.setup();
    const { onSymbol } = setup();
    // Open FPT once (records it), which closes the bar.
    await user.keyboard("{Control>}k{/Control}");
    await user.type(screen.getByLabelText("Thanh lệnh terminal"), "fpt");
    await user.keyboard("{Enter}");
    expect(onSymbol).toHaveBeenCalledWith("FPT");

    // Reopen: the "Gần đây" chip is present and reuses it.
    await user.keyboard("{Control>}k{/Control}");
    expect(screen.getByText("Gần đây")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "FPT" }));
    expect(onSymbol).toHaveBeenLastCalledWith("FPT");
  });
});
