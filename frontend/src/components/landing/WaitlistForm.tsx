"use client";

import { useState } from "react";
import { joinWaitlist } from "@/lib/api";

export default function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || state === "loading") return;
    setState("loading");
    try {
      await joinWaitlist(email.trim());
      setState("done");
      setMsg("Đã ghi nhận — cảm ơn bạn! Sẽ báo khi mở beta.");
    } catch (err) {
      setState("error");
      setMsg(err instanceof Error ? err.message : "Có lỗi, thử lại sau.");
    }
  };

  if (state === "done") {
    return (
      <p className="text-secondary font-data-md text-data-md border border-secondary/40 bg-secondary/10 px-4 py-3">
        ✓ {msg}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2 w-full max-w-md">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email@cua-ban.com"
        aria-label="Email nhận thông báo beta"
        maxLength={255}
        className="flex-1 bg-surface-container border border-outline-variant px-4 py-3 font-data-md text-data-md text-on-surface outline-none focus:border-primary"
      />
      <button
        type="submit"
        disabled={state === "loading"}
        className="shrink-0 px-5 py-3 bg-primary text-on-primary font-label-caps text-label-caps uppercase tracking-wide hover:brightness-110 transition disabled:opacity-50"
      >
        {state === "loading" ? "Đang gửi…" : "Nhận thông báo"}
      </button>
      {state === "error" && (
        <span className="sm:hidden text-error text-data-sm">{msg}</span>
      )}
    </form>
  );
}
