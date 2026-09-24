import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WaitlistForm from "@/components/landing/WaitlistForm";

vi.mock("@/lib/api", () => ({ joinWaitlist: vi.fn() }));
import { joinWaitlist } from "@/lib/api";

afterEach(() => vi.clearAllMocks());

describe("WaitlistForm", () => {
  it("submits the email and shows confirmation", async () => {
    vi.mocked(joinWaitlist).mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<WaitlistForm />);
    await user.type(screen.getByLabelText(/Email nhận thông báo/), "me@example.com");
    await user.click(screen.getByRole("button", { name: /Nhận thông báo/ }));
    await waitFor(() => expect(joinWaitlist).toHaveBeenCalledWith("me@example.com"));
    expect(await screen.findByText(/Đã ghi nhận/)).toBeInTheDocument();
  });
});
