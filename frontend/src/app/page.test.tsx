import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import LandingPage from "@/app/page";

vi.mock("@/lib/api", () => ({ joinWaitlist: vi.fn() }));

describe("LandingPage", () => {
  it("renders the hero, the how-it-works steps, features and a waitlist input", () => {
    render(<LandingPage />);
    expect(screen.getByRole("heading", { name: /Ý nghĩa mới là khác biệt/ })).toBeInTheDocument();
    expect(screen.getByText("Radar")).toBeInTheDocument(); // how-it-works step
    expect(screen.getByText("Pháp y báo cáo tài chính")).toBeInTheDocument(); // feature
    // two waitlist forms (hero + closing CTA), each with an email input
    expect(screen.getAllByLabelText(/Email nhận thông báo/).length).toBeGreaterThanOrEqual(1);
    // research-only positioning, no buy/sell
    expect(screen.getByText(/không phải khuyến nghị/)).toBeInTheDocument();
  });
});
