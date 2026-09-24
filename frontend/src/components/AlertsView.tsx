"use client";

import { useEffect, useRef, useState } from "react";
import type { AlertRule, AlertsConfig, RadarWatchItem, TriggeredAlert } from "@/types/stock";
import { getAlerts, getRadarWatch, getTriggeredAlerts, updateAlerts } from "@/lib/api";
import { fmtDecimal } from "@/lib/format";
import { rowButtonProps } from "@/lib/a11y";

const CONVICTION_LABEL: Record<string, { label: string; tone: string }> = {
  elevated_risk: { label: "Rủi ro", tone: "text-error" },
  watch: { label: "Theo dõi", tone: "text-amber-400" },
  mixed: { label: "Hỗn hợp", tone: "text-amber-400" },
  solid: { label: "Tích cực", tone: "text-secondary" },
  insufficient: { label: "Thiếu dữ liệu", tone: "text-on-surface-variant" },
};

const METRIC_LABELS: Record<string, string> = {
  pe: "P/E",
  pb: "P/B",
  roe: "ROE %",
  roa: "ROA %",
  net_margin: "Biên LN %",
  revenue_growth: "Tăng DT %",
  debt_equity: "Nợ/VCSH",
  current_ratio: "Thanh khoản hiện hành",
  dividend_yield: "Cổ tức %",
  close_price: "Giá",
  change_pct: "% Ngày",
  market_cap: "Vốn hóa",
  quant_score: "Quant",
};

interface Draft {
  symbol: string;
  metric: string;
  op: string;
  value: string;
  note: string;
}

const EMPTY_DRAFT: Draft = { symbol: "", metric: "pe", op: "lt", value: "", note: "" };

interface AlertsViewProps {
  onToast?: (m: string) => void;
  onOpenSymbol?: (symbol: string) => void;
}

export default function AlertsView({ onToast, onOpenSymbol }: AlertsViewProps) {
  const [config, setConfig] = useState<AlertsConfig | null>(null);
  const [fired, setFired] = useState<TriggeredAlert[]>([]);
  const [radar, setRadar] = useState<RadarWatchItem[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);

  const mounted = useRef(true);

  const refresh = async () => {
    const [cfg, triggered, radarWatch] = await Promise.all([
      getAlerts(), getTriggeredAlerts(), getRadarWatch(),
    ]);
    if (!mounted.current) return;
    setConfig(cfg);
    setFired(triggered);
    setRadar(radarWatch);
  };

  useEffect(() => {
    mounted.current = true;
    refresh()
      .catch(() => mounted.current && onToast?.("Lỗi tải cảnh báo"))
      .finally(() => mounted.current && setLoading(false));
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (rules: AlertRule[]) => {
    try {
      const cfg = await updateAlerts(rules);
      if (!mounted.current) return;
      setConfig(cfg);
      setFired(await getTriggeredAlerts());
    } catch {
      if (mounted.current) onToast?.("Lỗi lưu cảnh báo");
    }
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(draft.value);
    if (!draft.symbol.trim() || !Number.isFinite(value)) {
      onToast?.("Nhập mã và ngưỡng hợp lệ");
      return;
    }
    const next: AlertRule[] = [
      ...(config?.rules ?? []),
      {
        symbol: draft.symbol.trim().toUpperCase(),
        metric: draft.metric,
        op: draft.op,
        value,
        note: draft.note.trim() || undefined,
      },
    ];
    setDraft(EMPTY_DRAFT);
    void save(next);
  };

  const remove = (id?: number) => {
    void save((config?.rules ?? []).filter((r) => r.id !== id));
  };

  const ops = config?.ops ?? { lt: "<", lte: "≤", gt: ">", gte: "≥" };
  const metrics = config?.metrics ?? Object.keys(METRIC_LABELS);
  const label = (m: string) => METRIC_LABELS[m] ?? m;

  return (
    <>
      <header className="p-4 border-b border-outline-variant bg-surface-container-low">
        <h1 className="font-headline-md text-headline-md text-on-surface">Cảnh báo</h1>
        <p className="text-on-surface-variant font-body-md text-body-md mt-1">
          Đặt ngưỡng theo mã (VD: P/E &lt; 15, giá ≥ 30.000) — hệ thống chỉ **gắn cờ** khi chạm
          ngưỡng để bạn xem xét, không tự động đặt lệnh.
        </p>
      </header>

      <div className="flex-1 overflow-auto custom-scrollbar p-4 space-y-5">
        {/* Radar watch — followed symbols currently flagged by the forensic/QoE synthesis */}
        <section className="space-y-2">
          <h2 className="font-label-caps text-label-caps text-primary uppercase tracking-widest">
            Radar rủi ro — mã đang theo dõi ({radar.length})
          </h2>
          {radar.length === 0 ? (
            <p className="text-data-sm text-on-surface-variant">
              Không có mã nào trong danh mục/theo dõi đang bị gắn cờ rủi ro cơ bản.
            </p>
          ) : (
            <ul className="space-y-1">
              {radar.map((r) => {
                const c = CONVICTION_LABEL[r.conviction_overall] ?? CONVICTION_LABEL.insufficient;
                return (
                  <li
                    key={r.symbol}
                    {...(onOpenSymbol ? rowButtonProps(() => onOpenSymbol(r.symbol), `Mở ${r.symbol}`) : {})}
                    className={`flex items-center gap-2 flex-wrap border border-error/40 bg-error/5 px-3 py-1.5 ${
                      onOpenSymbol ? "cursor-pointer hover:bg-error/10 focus:outline focus:outline-1 focus:outline-primary" : ""
                    }`}
                  >
                    <span className="font-bold text-primary font-data-md text-data-md">{r.symbol}</span>
                    <span className={`font-label-caps text-label-caps uppercase ${c.tone}`}>{c.label}</span>
                    <span className="text-data-sm text-on-surface-variant">
                      {r.reasons.join(" · ")}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Currently firing */}
        <section className="space-y-2">
          <h2 className="font-label-caps text-label-caps text-primary uppercase tracking-widest">
            Đang kích hoạt ({fired.length})
          </h2>
          {fired.length === 0 ? (
            <p className="text-data-sm text-on-surface-variant">Chưa có cảnh báo nào chạm ngưỡng.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {fired.map((f) => (
                <span
                  key={f.id ?? `${f.symbol}-${f.metric}-${f.value}`}
                  className="px-2.5 py-1 border border-error/50 bg-error/10 text-on-surface font-data-md text-data-md"
                >
                  <span className="font-bold text-primary">{f.symbol}</span> {label(f.metric)}{" "}
                  {ops[f.op]} {fmtDecimal(f.value, 2)} · hiện {fmtDecimal(f.current, 2)}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Add rule */}
        <form
          onSubmit={add}
          className="flex flex-wrap items-end gap-2 border border-outline-variant bg-surface-container-lowest p-3"
        >
          <input
            value={draft.symbol}
            onChange={(e) => setDraft({ ...draft, symbol: e.target.value })}
            placeholder="Mã"
            aria-label="Mã"
            className="w-24 bg-surface-container-high border border-outline-variant px-2 py-1 font-data-md text-data-md text-on-surface outline-none focus:border-primary uppercase"
          />
          <select
            value={draft.metric}
            onChange={(e) => setDraft({ ...draft, metric: e.target.value })}
            aria-label="Chỉ số"
            className="bg-surface-container-high border border-outline-variant px-2 py-1 font-data-md text-data-md text-on-surface outline-none focus:border-primary"
          >
            {metrics.map((m) => (
              <option key={m} value={m}>
                {label(m)}
              </option>
            ))}
          </select>
          <select
            value={draft.op}
            onChange={(e) => setDraft({ ...draft, op: e.target.value })}
            aria-label="Điều kiện"
            className="bg-surface-container-high border border-outline-variant px-2 py-1 font-data-md text-data-md text-on-surface outline-none focus:border-primary"
          >
            {Object.entries(ops).map(([k, sym]) => (
              <option key={k} value={k}>
                {sym}
              </option>
            ))}
          </select>
          <input
            value={draft.value}
            onChange={(e) => setDraft({ ...draft, value: e.target.value })}
            placeholder="Ngưỡng"
            aria-label="Ngưỡng"
            inputMode="decimal"
            className="w-24 bg-surface-container-high border border-outline-variant px-2 py-1 font-data-md text-data-md text-on-surface outline-none focus:border-primary"
          />
          <input
            value={draft.note}
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            placeholder="Ghi chú (tùy chọn)"
            aria-label="Ghi chú"
            className="flex-1 min-w-[140px] bg-surface-container-high border border-outline-variant px-2 py-1 font-data-md text-data-md text-on-surface outline-none focus:border-primary"
          />
          <button
            type="submit"
            className="px-3 py-1 bg-primary-container text-on-primary font-label-caps text-label-caps uppercase hover:brightness-110 transition"
          >
            Thêm
          </button>
        </form>

        {/* Rule list */}
        <section className="space-y-2">
          <h2 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">
            Quy tắc ({config?.rules.length ?? 0})
          </h2>
          {loading ? (
            <p className="text-data-sm text-on-surface-variant">Đang tải…</p>
          ) : (config?.rules.length ?? 0) === 0 ? (
            <p className="text-data-sm text-on-surface-variant">Chưa có quy tắc nào.</p>
          ) : (
            <ul className="space-y-1">
              {config!.rules.map((r) => {
                const isFired = fired.some((f) => f.id === r.id);
                return (
                  <li
                    key={r.id ?? `${r.symbol}-${r.metric}-${r.value}`}
                    className="flex items-center gap-2 border border-outline-variant bg-surface-container-lowest px-3 py-1.5"
                  >
                    {isFired && <span className="w-1.5 h-1.5 rounded-full bg-error" title="Đang kích hoạt" />}
                    <span className="font-data-md text-data-md text-on-surface">
                      <span className="font-bold text-primary">{r.symbol}</span> {label(r.metric)}{" "}
                      {ops[r.op]} {fmtDecimal(r.value, 2)}
                    </span>
                    {r.note && (
                      <span className="text-data-sm text-on-surface-variant opacity-70">— {r.note}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => remove(r.id)}
                      aria-label={`Xóa quy tắc ${r.id}`}
                      className="ml-auto text-on-surface-variant hover:text-error"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>delete</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
