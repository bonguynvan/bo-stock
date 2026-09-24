"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProviderSource, ProvidersStatus, SourceStatus } from "@/types/stock";
import { getProvidersStatus, setProvider } from "@/lib/api";

interface SettingsViewProps {
  onToast: (message: string) => void;
}

const PROVIDER_LABELS: Record<string, string> = {
  resilient: "Resilient (VCI → TCBS)",
  vci: "VCI (Vietcap)",
  tcbs: "TCBS",
  fixtures: "Fixtures (mẫu)",
};

const PROVIDER_HINTS: Record<string, string> = {
  resilient: "Tự động chuyển VCI → TCBS khi một nguồn lỗi. Khuyến nghị.",
  vci: "Chỉ dùng VCI — nguồn chính, đã xác minh.",
  tcbs: "Chỉ dùng TCBS — bị geo-block ngoài Việt Nam.",
  fixtures: "Dữ liệu mẫu tĩnh, không gọi mạng (để kiểm thử).",
};

const STATUS_STYLE: Record<SourceStatus, { dot: string; text: string; label: string }> = {
  ok: { dot: "bg-secondary", text: "text-secondary", label: "Kết nối tốt" },
  error: { dot: "bg-primary", text: "text-primary", label: "Bị chặn / lỗi" },
  unreachable: { dot: "bg-error", text: "text-error", label: "Không kết nối" },
};

function SourceCard({ source }: { source: ProviderSource }) {
  const s = STATUS_STYLE[source.status];
  return (
    <div className="border border-outline-variant bg-surface-container-low p-4">
      <div className="flex items-center justify-between">
        <div className="font-data-md text-data-md text-on-surface">{source.label}</div>
        <div className={`flex items-center gap-2 ${s.text}`}>
          <span className={`inline-block w-2 h-2 rounded-full ${s.dot} animate-pulse`} />
          <span className="font-label-caps text-label-caps uppercase">{s.label}</span>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-data-sm text-on-surface-variant">
        <div>
          <span className="opacity-60">Host</span>
          <div className="font-data-sm text-on-surface truncate">{source.host}</div>
        </div>
        <div>
          <span className="opacity-60">HTTP</span>
          <div className="font-data-sm text-on-surface">{source.http_status ?? "—"}</div>
        </div>
        <div>
          <span className="opacity-60">Độ trễ</span>
          <div className="font-data-sm text-on-surface">
            {source.latency_ms != null ? `${source.latency_ms} ms` : "—"}
          </div>
        </div>
      </div>
      <p className="mt-2 text-body-md text-on-surface-variant opacity-80">{source.detail}</p>
    </div>
  );
}

export default function SettingsView({ onToast }: SettingsViewProps) {
  const [status, setStatus] = useState<ProvidersStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await getProvidersStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi khi kiểm tra nguồn dữ liệu");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSwitch = useCallback(
    async (provider: string) => {
      if (provider === status?.current) return;
      setSwitching(provider);
      try {
        await setProvider(provider);
        onToast(`Đã chuyển nguồn sang ${PROVIDER_LABELS[provider] ?? provider}`);
        await refresh();
      } catch (err) {
        onToast(err instanceof Error ? err.message : "Lỗi khi chuyển nguồn");
      } finally {
        setSwitching(null);
      }
    },
    [status?.current, onToast, refresh],
  );

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8 max-w-4xl">
      <header className="border-b border-outline-variant pb-4">
        <h1 className="font-headline-md text-headline-md text-on-surface">Nguồn dữ liệu</h1>
        <p className="text-on-surface-variant font-body-md text-body-md mt-1">
          Chọn nhà cung cấp dữ liệu và xem tình trạng kết nối trực tiếp từ nơi máy chủ đang chạy.
        </p>
      </header>

      {/* Provider selector */}
      <section className="space-y-3">
        <h2 className="font-label-caps text-label-caps text-primary uppercase tracking-widest">
          Nhà cung cấp đang dùng
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(status?.options ?? ["resilient", "vci", "tcbs", "fixtures"]).map((opt) => {
            const active = opt === status?.current;
            return (
              <button
                key={opt}
                type="button"
                disabled={switching !== null}
                onClick={() => handleSwitch(opt)}
                className={
                  "text-left p-4 border transition-colors disabled:opacity-50 " +
                  (active
                    ? "border-primary bg-primary/10"
                    : "border-outline-variant bg-surface-container-low hover:border-primary/50")
                }
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`font-data-md text-data-md ${active ? "text-primary" : "text-on-surface"}`}
                  >
                    {PROVIDER_LABELS[opt] ?? opt}
                  </span>
                  {active && (
                    <span className="font-label-caps text-label-caps uppercase text-primary">
                      {switching === opt ? "…" : "Đang dùng"}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-body-md text-on-surface-variant opacity-80">
                  {PROVIDER_HINTS[opt] ?? ""}
                </p>
              </button>
            );
          })}
        </div>
        <p className="text-data-sm text-on-surface-variant opacity-60">
          Thay đổi áp dụng ngay cho các truy vấn dữ liệu trực tiếp, và sẽ trở về mặc định
          (<code>{status?.default ?? "resilient"}</code> trong .env) khi khởi động lại máy chủ.
        </p>
      </section>

      {/* Connectivity */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-label-caps text-label-caps text-primary uppercase tracking-widest">
            Tình trạng kết nối
          </h2>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="px-3 py-1.5 border border-outline text-on-surface-variant hover:text-primary hover:border-primary font-label-caps text-label-caps uppercase transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
              {loading ? "hourglass_empty" : "refresh"}
            </span>
            {loading ? "Đang kiểm tra…" : "Kiểm tra lại"}
          </button>
        </div>

        {error ? (
          <p className="text-error font-data-md text-data-md border border-error/40 bg-error/10 p-3">
            {error}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(status?.sources ?? []).map((src) => (
              <SourceCard key={src.key} source={src} />
            ))}
          </div>
        )}
        <p className="text-data-sm text-on-surface-variant opacity-60">
          TCBS chỉ truy cập được từ IP Việt Nam — nếu máy chủ chạy ngoài VN, TCBS sẽ hiện
          “bị chặn / lỗi”. Đây là công cụ nghiên cứu: không đặt lệnh, không tư vấn mua/bán.
        </p>
      </section>
    </div>
  );
}
