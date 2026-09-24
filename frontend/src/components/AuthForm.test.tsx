import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AuthForm from "@/components/AuthForm";

vi.mock("@/lib/api", () => ({ login: vi.fn(), register: vi.fn() }));
import { login, register } from "@/lib/api";

afterEach(() => vi.clearAllMocks());

describe("AuthForm", () => {
  it("logs in with email + password", async () => {
    vi.mocked(login).mockResolvedValue({ id: 1, email: "a@b.co", is_admin: false });
    const user = userEvent.setup();
    render(<AuthForm mode="login" />);
    await user.type(screen.getByLabelText("Email"), "a@b.co");
    await user.type(screen.getByLabelText("Mật khẩu"), "supersecret");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
    await waitFor(() => expect(login).toHaveBeenCalledWith("a@b.co", "supersecret"));
  });

  it("register mode passes the invite code and shows the invite field", async () => {
    vi.mocked(register).mockResolvedValue({ id: 2, email: "c@d.co", is_admin: false });
    const user = userEvent.setup();
    render(<AuthForm mode="register" />);
    await user.type(screen.getByLabelText("Email"), "c@d.co");
    await user.type(screen.getByLabelText("Mật khẩu"), "supersecret");
    await user.type(screen.getByLabelText("Mã mời"), "BETA2026");
    await user.click(screen.getByRole("button", { name: "Đăng ký" }));
    await waitFor(() => expect(register).toHaveBeenCalledWith("c@d.co", "supersecret", "BETA2026"));
  });
});
