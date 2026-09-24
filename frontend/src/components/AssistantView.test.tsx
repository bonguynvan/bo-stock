import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AssistantView from "@/components/AssistantView";
import type { AssistantAnswer } from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    getAssistantStatus: vi.fn(),
    askAssistant: vi.fn(),
  };
});

import { askAssistant, getAssistantStatus } from "@/lib/api";

describe("AssistantView", () => {
  beforeEach(() => {
    vi.mocked(getAssistantStatus).mockReset();
    vi.mocked(askAssistant).mockReset();
  });

  it("shows a setup note when the assistant is not configured", async () => {
    vi.mocked(getAssistantStatus).mockResolvedValue(false);
    render(<AssistantView />);
    await waitFor(() => expect(screen.getByText("ANTHROPIC_API_KEY")).toBeInTheDocument());
  });

  it("submits a question and renders the grounded answer + sources", async () => {
    const user = userEvent.setup();
    vi.mocked(getAssistantStatus).mockResolvedValue(true);
    const answer: AssistantAnswer = {
      answer: "ROE 27% cho thấy khả năng sinh lời cao.",
      symbol: "FPT",
      sources: ["metrics", "compass"],
      model: "claude-sonnet-4-6",
      disclaimer: "Không phải khuyến nghị.",
    };
    vi.mocked(askAssistant).mockResolvedValue(answer);

    render(<AssistantView />);
    await user.type(screen.getByLabelText("Mã cổ phiếu (tùy chọn)"), "fpt");
    await user.type(screen.getByLabelText("Câu hỏi"), "ROE nói gì?");
    await user.click(screen.getByRole("button", { name: "Gửi" }));

    await waitFor(() => expect(askAssistant).toHaveBeenCalledWith("ROE nói gì?", "FPT", []));
    await waitFor(() =>
      expect(screen.getByText(/ROE 27% cho thấy/)).toBeInTheDocument(),
    );
    expect(screen.getByText("metrics")).toBeInTheDocument();
    expect(screen.getByText("compass")).toBeInTheDocument();
  });

  it("sends prior turns as history on a follow-up, and clears the conversation", async () => {
    const user = userEvent.setup();
    vi.mocked(getAssistantStatus).mockResolvedValue(true);
    vi.mocked(askAssistant)
      .mockResolvedValueOnce({
        answer: "ROE 27%.",
        symbol: "FPT",
        sources: ["metrics"],
        model: "m",
        disclaimer: "d",
      })
      .mockResolvedValueOnce({
        answer: "ROA 18%.",
        symbol: "FPT",
        sources: ["metrics"],
        model: "m",
        disclaimer: "d",
      });

    render(<AssistantView />);
    await user.type(screen.getByLabelText("Câu hỏi"), "ROE?");
    await user.click(screen.getByRole("button", { name: "Gửi" }));
    await waitFor(() => expect(screen.getByText("ROE 27%.")).toBeInTheDocument());

    await user.type(screen.getByLabelText("Câu hỏi"), "Còn ROA?");
    await user.click(screen.getByRole("button", { name: "Gửi" }));
    await waitFor(() => expect(screen.getByText("ROA 18%.")).toBeInTheDocument());

    // Second call carries the first exchange as history.
    expect(vi.mocked(askAssistant).mock.calls[1][2]).toEqual([
      { role: "user", content: "ROE?" },
      { role: "assistant", content: "ROE 27%." },
    ]);

    // Clear wipes the transcript.
    await user.click(screen.getByRole("button", { name: /Xóa hội thoại/ }));
    expect(screen.queryByText("ROA 18%.")).not.toBeInTheDocument();
  });

  it("surfaces a friendly error when the API returns 503", async () => {
    const user = userEvent.setup();
    const { ApiError } = await import("@/lib/api");
    vi.mocked(getAssistantStatus).mockResolvedValue(true);
    vi.mocked(askAssistant).mockRejectedValue(new ApiError("no key", 503));

    render(<AssistantView />);
    await user.type(screen.getByLabelText("Câu hỏi"), "Hỏi?");
    await user.click(screen.getByRole("button", { name: "Gửi" }));
    await waitFor(() =>
      expect(screen.getByText(/Trợ lý AI chưa bật/)).toBeInTheDocument(),
    );
  });
});
