import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { usePolling } from "@/lib/usePolling";

describe("usePolling", () => {
  it("starts loading, then exposes the fetched data", async () => {
    const fetcher = vi.fn().mockResolvedValue([1, 2, 3]);
    const { result } = renderHook(() => usePolling(fetcher));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([1, 2, 3]);
    expect(result.current.error).toBeNull();
  });

  it("surfaces an error message on rejection (data stays null)", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => usePolling(fetcher));
    await waitFor(() => expect(result.current.error).toBe("boom"));
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("does not set an interval when intervalMs is omitted", async () => {
    const fetcher = vi.fn().mockResolvedValue(1);
    renderHook(() => usePolling(fetcher));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    // No interval → still one call shortly after.
    await new Promise((r) => setTimeout(r, 20));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
