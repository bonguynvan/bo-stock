/**
 * Desktop (Tauri) build flag, baked at build time by `DESKTOP_BUILD=1` builds.
 *
 * Gates genuinely desktop-only features (multi-window, detach, room sync). The desktop app
 * points at the user's LOCAL backend on their own machine.
 */
export const IS_DESKTOP = process.env.NEXT_PUBLIC_DESKTOP === "1";
