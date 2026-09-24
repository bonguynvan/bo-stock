import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminView from "@/components/AdminView";
import type { WaitlistItem } from "@/types/stock";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, getAdminWaitlist: vi.fn(), getAdminStats: vi.fn() };
});

import { ApiError, getAdminStats, getAdminWaitlist } from "@/lib/api";

const rows: WaitlistItem[] = [
  { id: 1, email: "a@x.co", note: "quan tâm QoE", created_at: "2026-08-01T08:00:00+07:00" },
];

afterEach(() => vi.clearAllMocks());

describe("AdminView", () => {
  it("lists waitlist entries + stats for an admin", async () => {
    vi.mocked(getAdminWaitlist).mockResolvedValue(rows);
    vi.mocked(getAdminStats).mockResolvedValue({ users: 3, waitlist: 1 });
    render(<AdminView />);
    expect(await screen.findByText("a@x.co")).toBeInTheDocument();
    expect(screen.getByText(/3 tài khoản · 1 đăng ký/)).toBeInTheDocument();
    expect(screen.getByText(/quan tâm QoE/)).toBeInTheDocument();
  });

  it("shows a no-access message on 403", async () => {
    vi.mocked(getAdminWaitlist).mockRejectedValue(new ApiError("forbidden", 403));
    vi.mocked(getAdminStats).mockRejectedValue(new ApiError("forbidden", 403));
    render(<AdminView />);
    expect(await screen.findByText(/không có quyền/)).toBeInTheDocument();
  });
});
