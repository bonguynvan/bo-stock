"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** No landing/auth: the root goes straight to the terminal. Client-side redirect so it
 *  also works in the static export used by the desktop build. */
export default function RootPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/app");
  }, [router]);
  return (
    <main className="min-h-screen flex items-center justify-center bg-background text-on-surface">
      <a href="/app" className="text-primary hover:underline">
        Mở Quant Terminal →
      </a>
    </main>
  );
}
