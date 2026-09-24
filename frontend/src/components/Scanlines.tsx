// Subtle scanline atmosphere overlay (purely decorative, non-interactive).
export default function Scanlines() {
  return (
    <div
      className="fixed inset-0 pointer-events-none opacity-[0.03] z-[100]"
      style={{
        background:
          "linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))",
        backgroundSize: "100% 2px, 3px 100%",
      }}
      aria-hidden="true"
    />
  );
}
