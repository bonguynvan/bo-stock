"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getConnectors,
  getConnectorsHealth,
  type Connector,
  type ConnectorHealth,
} from "@/lib/api";

const STATUS_META: Record<
  ConnectorHealth["status"],
  { dot: string; text: string; label: string }
> = {
  ok: { dot: "bg-secondary", text: "text-secondary", label: "Hoạt động" },
  error: { dot: "bg-error", text: "text-error", label: "Lỗi" },
  unreachable: { dot: "bg-error", text: "text-error", label: "Không kết nối" },
  not_configured: { dot: "bg-on-surface-variant/50", text: "text-on-surface-variant", label: "Chưa cấu hình" },
};

/**
 * Connectors hub — the Fincept-style registry of aggregated free/public sources
 * with a live reachability probe. Research-only data infrastructure view.
 */
export default function ConnectorsView() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [health, setHealth] = useState<Record<string, ConnectorHealth>>({});
  const [probing, setProbing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getConnectors()
      .then((list) => !cancelled && setConnectors(list))
      .catch(() => {
        /* registry optional */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const probe = useCallback(() => {
    setProbing(true);
    getConnectorsHealth()
      .then((list) => setHealth(Object.fromEntries(list.map((h) => [h.key, h]))))
      .catch(() => {
        /* leave prior health */
      })
      .finally(() => setProbing(false));
  }, []);

  useEffect(() => {
    probe();
  }, [probe]);

  return (
    <>
      <header className="p-4 border-b border-outline-variant bg-surface-container-low flex items-start justify-between gap-3">
        <div>
          <h1 className="font-headline-md text-headline-md text-on-surface">Connectors</h1>
          <p className="text-on-surface-variant font-body-md text-body-md mt-1">
            Các nguồn dữ liệu công khai được tổng hợp cho terminal. VN (cổ phiếu) đi qua VCI/TCBS
            ở tab Cài đặt; đây là các nguồn bối cảnh toàn cầu. Chỉ để nghiên cứu.
          </p>
        </div>
        <button
          type="button"
          onClick={probe}
          disabled={probing}
          className="shrink-0 px-3 py-1.5 border border-primary text-primary font-label-caps text-label-caps uppercase hover:bg-primary/10 transition-colors flex items-center gap-1.5 disabled:opacity-50"
        >
          <span className={`material-symbols-outlined ${probing ? "animate-spin" : ""}`} style={{ fontSize: "16px" }}>
            {probing ? "progress_activity" : "refresh"}
          </span>
          {probing ? "Đang kiểm tra…" : "Kiểm tra kết nối"}
        </button>
      </header>

      <div className="flex-1 overflow-auto custom-scrollbar p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {connectors.map((c) => {
            const h = health[c.key];
            const st = h ? STATUS_META[h.status] : null;
            return (
              <div key={c.key} className="border border-outline-variant bg-surface-container-lowest">
                <div className="flex items-center gap-2 px-3 h-9 border-b border-outline-variant bg-surface-container-low">
                  <span className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface truncate">
                    {c.label}
                  </span>
                  <span className="ml-auto flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${st?.dot ?? "bg-on-surface-variant/30"}`} />
                    <span className={`font-data-md text-data-sm ${st?.text ?? "text-on-surface-variant"}`}>
                      {st?.label ?? "—"}
                    </span>
                  </span>
                </div>
                <dl className="p-3 space-y-1.5 font-data-md text-data-sm">
                  <Row label="Nguồn" value={c.source} />
                  <Row label="Dữ liệu" value={c.domain} />
                  <Row label="Cần API key" value={c.requires_key ? (c.configured ? "Có · đã cấu hình" : "Có · chưa cấu hình") : "Không"} />
                  {h && (
                    <>
                      <Row label="Host" value={h.host} />
                      <Row
                        label="Độ trễ"
                        value={h.latency_ms !== null ? `${h.latency_ms} ms` : "—"}
                      />
                      <Row label="Chi tiết" value={h.detail} />
                    </>
                  )}
                </dl>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-on-surface-variant w-24 shrink-0">{label}</dt>
      <dd className="text-on-surface min-w-0">{value}</dd>
    </div>
  );
}
