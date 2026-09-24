import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { GridSkeleton, PanelSkeleton, Skeleton } from "@/components/ui/Skeleton";

describe("Skeleton loaders", () => {
  it("PanelSkeleton exposes a labelled loading status", () => {
    render(<PanelSkeleton rows={5} />);
    const status = screen.getByRole("status", { name: /Đang tải/ });
    expect(status).toBeInTheDocument();
    // 5 rows × (label + value) = 10 shimmer blocks
    expect(status.querySelectorAll(".skeleton").length).toBe(10);
  });

  it("GridSkeleton renders the requested tile count", () => {
    render(<GridSkeleton count={9} />);
    expect(screen.getByRole("status", { name: /Đang tải/ }).querySelectorAll(".skeleton").length).toBe(9);
  });

  it("Skeleton applies a custom width via style", () => {
    const { container } = render(<Skeleton className="h-4" style={{ width: "40%" }} />);
    const el = container.querySelector(".skeleton") as HTMLElement;
    expect(el).toHaveClass("h-4");
    expect(el.style.width).toBe("40%");
  });
});
