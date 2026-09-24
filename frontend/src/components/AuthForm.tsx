"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { login, register } from "@/lib/api";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const isRegister = mode === "register";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (isRegister) await register(email.trim(), password, invite.trim() || undefined);
      else await login(email.trim(), password);
      router.replace("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi, thử lại.");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-on-surface flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="font-display-lg text-headline-md text-primary">Quant Terminal</Link>
        <h1 className="mt-6 font-headline-md text-headline-md">
          {isRegister ? "Tạo tài khoản" : "Đăng nhập"}
        </h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          {isRegister ? "Beta giới hạn — cần mã mời." : "Chào mừng trở lại."}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <label className="block">
            <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">Email</span>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              autoComplete="email" maxLength={255}
              className="w-full mt-1 bg-surface-container border border-outline-variant px-3 py-2 font-data-md text-data-md text-on-surface outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">Mật khẩu</span>
            <input
              type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete={isRegister ? "new-password" : "current-password"} minLength={8} maxLength={200}
              className="w-full mt-1 bg-surface-container border border-outline-variant px-3 py-2 font-data-md text-data-md text-on-surface outline-none focus:border-primary"
            />
          </label>
          {isRegister && (
            <label className="block">
              <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">Mã mời</span>
              <input
                value={invite} onChange={(e) => setInvite(e.target.value)} maxLength={100}
                className="w-full mt-1 bg-surface-container border border-outline-variant px-3 py-2 font-data-md text-data-md text-on-surface outline-none focus:border-primary"
              />
            </label>
          )}
          {error && <p className="text-error text-data-sm">{error}</p>}
          <button
            type="submit" disabled={loading}
            className="w-full px-4 py-2.5 bg-primary text-on-primary font-label-caps text-label-caps uppercase tracking-wide hover:brightness-110 transition disabled:opacity-50"
          >
            {loading ? "Đang xử lý…" : isRegister ? "Đăng ký" : "Đăng nhập"}
          </button>
        </form>

        <p className="mt-5 text-data-sm text-on-surface-variant">
          {isRegister ? (
            <>Đã có tài khoản? <Link href="/login" className="text-primary hover:underline">Đăng nhập</Link></>
          ) : (
            <>Chưa có tài khoản? <Link href="/register" className="text-primary hover:underline">Đăng ký</Link></>
          )}
        </p>
      </div>
    </main>
  );
}
