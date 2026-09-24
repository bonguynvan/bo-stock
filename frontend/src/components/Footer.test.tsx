import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Footer from "@/components/Footer";

describe("Footer", () => {
  it("renders the filtered and total result counts", () => {
    render(<Footer filtered={12} total={345} lastUpdate={null} />);
    expect(screen.getByText("12")).toBeInTheDocument();
    // The total is rendered inline alongside the filtered count.
    expect(screen.getByText(/345/)).toBeInTheDocument();
  });

  it("shows an em-dash for the last update when none is provided", () => {
    render(<Footer filtered={0} total={0} lastUpdate={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("formats the last update timestamp when provided", () => {
    const iso = new Date(2024, 0, 5, 9, 3, 7).toISOString();
    render(<Footer filtered={1} total={1} lastUpdate={iso} />);
    expect(screen.getByText("09:03:07 05/01/2024")).toBeInTheDocument();
  });
});
