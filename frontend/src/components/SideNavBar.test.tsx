import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import SideNavBar from "./SideNavBar";

// SideNavBar self-fetches /auth/me (for the admin link) and can call logout.
vi.mock("@/lib/api", () => ({
  getMe: vi.fn().mockResolvedValue(null),
  logout: vi.fn().mockResolvedValue(undefined),
}));

describe("SideNavBar", () => {
  it("renders the five group headers and every destination", () => {
    render(<SideNavBar active="Terminal" onNavigate={() => {}} />);
    // "Thị trường" is both a group title and a destination label, so match ≥1 element.
    for (const g of ["Tổng quan", "Thị trường", "Nghiên cứu", "Danh mục", "Hệ thống"]) {
      expect(screen.getAllByText(g).length).toBeGreaterThan(0);
    }
    // A sampling across groups — all remain top-level destinations after consolidation.
    for (const label of ["Terminal", "Thị trường", "Screener", "Nhật ký", "Portfolio", "Settings"]) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it("no longer shows folded destinations (now tabs under their parent)", () => {
    render(<SideNavBar active="Screener" onNavigate={() => {}} />);
    // Yếu tố/Nền tảng → Screener tabs; Radar → Nhịp TT tab; Analytics → Portfolio tab;
    // Quy Trình → Nhật ký tab; Kinh tế → Thị trường tab.
    for (const gone of ["Yếu tố", "Nền tảng", "Radar", "Analytics", "Quy Trình", "Kinh tế"]) {
      expect(screen.queryByRole("button", { name: new RegExp(gone) })).not.toBeInTheDocument();
    }
  });

  it("fires onNavigate with the item label when clicked", () => {
    const onNavigate = vi.fn();
    render(<SideNavBar active="Terminal" onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: /Screener/ }));
    expect(onNavigate).toHaveBeenCalledWith("Screener");
  });
});
