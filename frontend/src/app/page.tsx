import Link from "next/link";
import WaitlistForm from "@/components/landing/WaitlistForm";
import ProductPreview from "@/components/landing/ProductPreview";
import DesktopRedirect from "@/components/DesktopRedirect";
import { IS_DESKTOP } from "@/lib/desktop";

const FEATURES: { icon: string; title: string; body: string; accent?: boolean }[] = [
  {
    icon: "fact_check",
    title: "Pháp y báo cáo tài chính",
    body: "Beneish M-Score, Altman Z″ (thị trường mới nổi), Piotroski F-Score — chạy cho toàn sàn để soi rủi ro thao túng & kiệt quệ.",
    accent: true,
  },
  {
    icon: "water_drop",
    title: "Chất lượng lợi nhuận (QoE)",
    body: "Lợi nhuận có dòng tiền thực đỡ lưng đến đâu — dồn tích Sloan, chuyển đổi tiền mặt, phải thu, biên gộp. Chấm 0–100.",
  },
  {
    icon: "balance",
    title: "Định giá theo ngành",
    body: "So bội số P/E, P/B với trung vị ngành — mã đang đắt hay rẻ hơn mặt bằng, kèm định giá nội tại nhiều phương pháp.",
  },
  {
    icon: "radar",
    title: "Radar tín hiệu",
    body: "Nơi rủi ro cơ bản gặp tin tức: các mã bị gắn cờ, kèm tin gần đây nhất và phân loại sự kiện bằng AI.",
  },
  {
    icon: "filter_list",
    title: "Bộ lọc & xếp hạng",
    body: "Lọc theo hàng chục chỉ số, lọc bằng lời (AI), xếp hạng yếu tố giá trị / chất lượng / tăng trưởng toàn thị trường.",
  },
  {
    icon: "smart_toy",
    title: "Trợ lý nghiên cứu AI",
    body: "Đọc BCTC, tóm tắt, so sánh — AI chỉ trích xuất & giải thích số liệu, không bao giờ khuyến nghị mua/bán.",
  },
];

const STEPS: { n: string; title: string; body: string }[] = [
  { n: "01", title: "Sàng lọc", body: "Chấm pháp y + chất lượng lợi nhuận cho cả sàn, gắn cờ mã đáng ngờ." },
  { n: "02", title: "Radar", body: "Mã bị gắn cờ hiện lên kèm tin gần đây — rủi ro cơ bản gặp diễn biến thực." },
  { n: "03", title: "Đào sâu", body: "Định giá theo ngành, phân loại tín hiệu tin, hồ sơ tin cậy tổng hợp." },
];

export default function LandingPage() {
  // Desktop build has no marketing landing — go straight to the terminal (no flash of
  // landing markup). The window is configured to load /app directly; this is the fallback.
  if (IS_DESKTOP) return <DesktopRedirect />;
  return (
    <main className="min-h-screen bg-background text-on-surface overflow-x-hidden">
      {/* Nav */}
      <header className="sticky top-0 z-20 border-b border-outline-variant/60 bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="font-display-lg text-headline-md text-primary leading-none">Quant Terminal</span>
            <span className="hidden sm:inline font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant">
              V-Investment OS
            </span>
          </div>
          <nav className="flex items-center gap-3">
            <Link href="/login" className="font-label-caps text-label-caps uppercase tracking-wide text-on-surface-variant hover:text-on-surface transition">
              Đăng nhập
            </Link>
            <Link href="/register" className="px-3 py-1.5 border border-primary/50 text-primary font-label-caps text-label-caps uppercase tracking-wide hover:bg-primary/10 transition">
              Đăng ký
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        <div className="pointer-events-none absolute inset-0 landing-grid" aria-hidden />
        <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-72 w-[42rem] max-w-full rounded-full bg-primary/20 blur-[120px]" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-6 pt-16 md:pt-24 pb-16 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="reveal reveal-1 font-label-caps text-label-caps uppercase tracking-[0.3em] text-primary mb-5">
              Nghiên cứu cổ phiếu Việt Nam
            </p>
            <h1 className="reveal reveal-1 font-display-lg text-display-lg leading-[1.05]">
              Số liệu là của chung.{" "}
              <span className="text-primary">Ý nghĩa mới là khác biệt.</span>
            </h1>
            <p className="reveal reveal-2 mt-6 max-w-xl text-body-lg text-on-surface-variant">
              Một terminal nghiên cứu tập trung vào câu hỏi mà bảng giá không trả lời:{" "}
              <strong className="text-on-surface">lợi nhuận có thật không, và giá đã hợp lý chưa</strong>.
              Pháp y BCTC, chất lượng lợi nhuận, định giá theo ngành và radar tín hiệu — trong một chỗ.
            </p>
            <div className="reveal reveal-3 mt-9 flex flex-col gap-3">
              <span className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant">
                Đăng ký nhận thông báo khi mở beta
              </span>
              <WaitlistForm />
              <p className="text-data-sm text-on-surface-variant opacity-70">
                Công cụ nghiên cứu — cung cấp số liệu & phân tích, không phải khuyến nghị mua/bán.
              </p>
            </div>
          </div>
          <div className="reveal reveal-4 lg:pl-6">
            <ProductPreview />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-6 py-16 border-t border-outline-variant/60">
        <h2 className="font-headline-md text-headline-md">Sàng lọc cả sàn</h2>
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          {STEPS.map((s) => (
            <div key={s.n} className="relative pl-14">
              <span className="absolute left-0 top-0 font-display-lg text-headline-md text-primary/40 tabular-nums">
                {s.n}
              </span>
              <h3 className="font-headline-sm text-headline-sm">{s.title}</h3>
              <p className="mt-1.5 text-body-md text-on-surface-variant">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Feature bento */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className={`group p-6 border transition-colors ${
                f.accent
                  ? "md:col-span-2 border-primary/40 bg-primary/5 hover:bg-primary/10"
                  : "border-outline-variant bg-surface-container-low hover:border-primary/40"
              }`}
            >
              <span className="material-symbols-outlined text-primary transition-transform group-hover:scale-110" style={{ fontSize: "28px" }}>
                {f.icon}
              </span>
              <h3 className="mt-3 font-headline-sm text-headline-sm text-on-surface">{f.title}</h3>
              <p className="mt-2 text-body-md text-on-surface-variant">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust / scope band */}
      <section className="border-y border-outline-variant/60 bg-surface-container-lowest">
        <div className="mx-auto max-w-6xl px-6 py-14 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="font-display-lg text-headline-md text-primary">1.700+</div>
            <p className="mt-1 text-body-md text-on-surface-variant">mã có lịch sử chỉ số & BCTC</p>
          </div>
          <div>
            <div className="font-display-lg text-headline-md text-primary">Chỉ phân tích</div>
            <p className="mt-1 text-body-md text-on-surface-variant">
              không đặt lệnh, không khuyến nghị — bạn tự quyết định
            </p>
          </div>
          <div>
            <div className="font-display-lg text-headline-md text-primary">Minh bạch</div>
            <p className="mt-1 text-body-md text-on-surface-variant">
              mọi điểm số đều kèm công thức & thành phần, không hộp đen
            </p>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h2 className="font-display-lg text-display-lg leading-tight">
          Sẵn sàng soi kỹ hơn?
        </h2>
        <p className="mt-4 text-body-lg text-on-surface-variant">
          Để lại email — chúng tôi sẽ mời bạn khi beta mở cửa.
        </p>
        <div className="mt-8 flex justify-center">
          <WaitlistForm />
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-3 text-data-sm text-on-surface-variant border-t border-outline-variant/60">
        <span>© Quant Terminal · V-Investment OS — công cụ nghiên cứu, không phải tư vấn đầu tư.</span>
        <Link href="/login" className="hover:text-on-surface transition">Đăng nhập →</Link>
      </footer>
    </main>
  );
}
