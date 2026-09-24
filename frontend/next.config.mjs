/** @type {import('next').NextConfig} */

// Desktop (Tauri) builds set DESKTOP_BUILD=1 → emit a fully static export into `out/`
// that Tauri bundles. The web build (next build + next start) is untouched. The app has
// no SSR (all "use client", no cookies()/getServerSideProps), so static export is clean.
const isDesktop = process.env.DESKTOP_BUILD === "1";

const nextConfig = {
  reactStrictMode: true,
  ...(isDesktop
    ? {
        output: "export",
        images: { unoptimized: true },
        // Static hosting serves /app as /app/index.html — trailing slash keeps links resolving.
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
