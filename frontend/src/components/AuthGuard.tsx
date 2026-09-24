"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMe } from "@/lib/api";
import { IS_DESKTOP } from "@/lib/desktop";

/**
 * Client-side gate for the app shell: checks the session via /auth/me and redirects to
 * /login when there's no valid session. The backend enforces access independently (the
 * auth_gate middleware in prod); this is the UX layer so unauthed users never see the app.
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // Desktop build: no web auth gate — the local backend is the user's own (single-user).
  const [state, setState] = useState<"checking" | "authed">(IS_DESKTOP ? "authed" : "checking");

  useEffect(() => {
    if (IS_DESKTOP) return;
    let cancelled = false;
    getMe()
      .then((user) => {
        if (cancelled) return;
        if (user) setState("authed");
        else router.replace("/login");
      })
      .catch(() => !cancelled && router.replace("/login"));
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (state === "checking") {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <p className="text-on-surface-variant font-data-md text-data-md animate-pulse">
          Đang kiểm tra phiên đăng nhập…
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
