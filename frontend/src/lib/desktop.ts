/**
 * Desktop (Tauri) build flag, baked at build time by `DESKTOP_BUILD=1` builds.
 *
 * The desktop app points at the user's LOCAL backend on their own machine — a single-user
 * context — so it runs WITHOUT the web auth gate. The backend's per-user tables treat
 * `user_id = None` as unscoped (single-user mode), so watchlists/portfolio/journal all work
 * without a login. This also sidesteps cross-origin cookie friction between the Tauri
 * webview origin and localhost:8000.
 */
export const IS_DESKTOP = process.env.NEXT_PUBLIC_DESKTOP === "1";
