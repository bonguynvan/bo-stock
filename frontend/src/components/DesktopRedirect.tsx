"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { IS_DESKTOP } from "@/lib/desktop";

/**
 * Desktop build: skip the marketing landing and go straight to the app. No-op on web.
 * Rendered at the top of the landing page so the Tauri window (which loads "/") lands on
 * the terminal instead of the public homepage.
 */
export default function DesktopRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (IS_DESKTOP) router.replace("/app");
  }, [router]);
  return null;
}
