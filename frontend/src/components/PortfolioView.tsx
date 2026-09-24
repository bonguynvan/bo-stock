"use client";

import { useCallback, useEffect, useState } from "react";
import type { Holding, PortfolioAnalysis } from "@/types/stock";
import { createPosition, deletePosition, getPortfolioAnalysis } from "@/lib/api";
import { changeColor, EMPTY, fmtNumber, fmtPercent } from "@/lib/format";

function scoreColor(s: number | null | undefined): string {
  if (s == null) return "text-on-surface-variant";
  if (s >= 65) return "text-secondary";
  if (s >= 40) return "text-primary";
  return "text-error";
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="border border-outline-variant bg-surface-container-low p-3">
      <div className="text-data-sm text-on-surface-variant uppercase font-label-caps">{label}</div>
      <div className={`font-display-sm text-display-sm ${tone ?? "text-on-surface"}`}>{value}</div>
    </div>
  );
}

interface PortfolioViewProps {
  onOpenDetail: (symbol: string) => void;
  onToast: (msg: string) => void;
}

export default function PortfolioView({ onOpenDetail, onToast }: PortfolioViewProps) {
  const [data, setData] = useState<PortfolioAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ symbol: "", quantity: "", avg_cost: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getPortfolioAnalysis());
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Lỗi tải danh mục");
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const quantity = Number(form.quantity);
      const avg_cost = Number(form.avg_cost);
      if (!form.symbol.trim() || !(quantity > 0) || !(avg_cost > 0)) {
        onToast("Nhập mã, số lượng và giá vốn hợp lệ.");
        return;
      }
      setSaving(true);
      try {
        await createPosition({ symbol: form.symbol.trim().toUpperCase(), quantity, avg_cost });
        setForm({ symbol: "", quantity: "", avg_cost: "" });
        await load();
        onToast("Đã thêm vị thế");
      } catch (err) {
        onToast(err instanceof Error ? err.message : "Lỗi thêm vị thế");
      } finally {
        setSaving(false);
      }
    },
    [form, load, onToast],
  );

  const handleDelete = useCallback(
    async (h: Holding) => {
      if (!window.confirm(`Xóa vị thế ${h.symbol}?`)) return;
      try {
        await deletePosition(h.id);
        await load();
        onToast("Đã xóa vị thế");
      } catch (err) {
        onToast(err instanceof Error ? err.message : "Lỗi xóa");
      }
    },
    [load, onToast],
  );

  if (loading) {
    return <p className="p-6 text-on-surface-variant font-data-md text-data-md">Đang tải danh mục…</p>;
  }
  if (!data) return null;

  const t = data.totals;

  return (
    <div className="flex-1 overflow-auto custom-scrollbar p-4 space-y-4">
      <div className="border-l-2 border-primary bg-primary/10 p-3 text-body-md text-on-surface">
        {data.disclaimer}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Tổng giá trị" value={`${fmtNumber(t.market_value)} đ`} />
        <SummaryCard label="Tổng vốn" value={`${fmtNumber(t.cost_basis)} đ`} />
        <SummaryCard
          label="Lãi/Lỗ tạm tính"
          value={`${t.pnl >= 0 ? "+" : ""}${fmtNumber(t.pnl)} đ (${fmtPercent(t.pnl_pct, 2, true)})`}
          tone={changeColor(t.pnl)}
        />
        <SummaryCard label="Số mã" value={`${t.positions}${t.priced < t.positions ? ` (${t.priced} có giá)` : ""}`} />
      </div>

      {/* Add position */}
      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2 border border-outline-variant p-3">
        <label className="flex flex-col text-data-sm text-on-surface-variant">
          Mã
          <input
            value={form.symbol}
            onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value.toUpperCase() }))}
            className="mt-0.5 w-24 bg-surface-container border border-outline px-2 py-1 font-data-md text-data-md text-on-surface uppercase"
            placeholder="VD: FPT"
          />
        </label>
        <label className="flex flex-col text-data-sm text-on-surface-variant">
          Số lượng
          <input
            type="number"
            value={form.quantity}
            onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
            className="mt-0.5 w-28 bg-surface-container border border-outline px-2 py-1 font-data-md text-data-md text-on-surface"
            placeholder="1000"
          />
        </label>
        <label className="flex flex-col text-data-sm text-on-surface-variant">
          Giá vốn (đ/cp)
          <input
            type="number"
            value={form.avg_cost}
            onChange={(e) => setForm((f) => ({ ...f, avg_cost: e.target.value }))}
            className="mt-0.5 w-32 bg-surface-container border border-outline px-2 py-1 font-data-md text-data-md text-on-surface"
            placeholder="80000"
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-1.5 bg-primary text-on-primary font-label-caps text-label-caps uppercase hover:brightness-110 transition disabled:opacity-50"
        >
          {saving ? "Đang thêm…" : "Thêm vị thế"}
        </button>
      </form>

      {data.holdings.length === 0 ? (
        <p className="text-on-surface-variant font-data-md text-data-md py-8 text-center border border-outline-variant border-dashed">
          Chưa có vị thế nào. Thêm cổ phiếu bạn đang nắm giữ để theo dõi giá trị & phân bổ.
        </p>
      ) : (
        <>
          {/* Holdings table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left font-data-md text-data-md">
              <thead className="font-label-caps text-label-caps text-on-surface-variant uppercase border-b border-outline-variant">
                <tr>
                  <th className="py-2 pr-2">Mã</th>
                  <th className="py-2 px-2 text-right">SL</th>
                  <th className="py-2 px-2 text-right">Giá vốn</th>
                  <th className="py-2 px-2 text-right">Giá TT</th>
                  <th className="py-2 px-2 text-right">Giá trị</th>
                  <th className="py-2 px-2 text-right">Lãi/Lỗ</th>
                  <th className="py-2 px-2 text-right">Tỷ trọng</th>
                  <th className="py-2 px-2 text-right">La bàn DH</th>
                  <th className="py-2 pl-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {data.holdings.map((h) => (
                  <tr key={h.id} className="hover:bg-surface-container-high">
                    <td className="py-2 pr-2">
                      <button
                        type="button"
                        onClick={() => onOpenDetail(h.symbol)}
                        className="font-bold text-primary hover:underline"
                      >
                        {h.symbol}
                      </button>
                    </td>
                    <td className="py-2 px-2 text-right">{fmtNumber(h.quantity)}</td>
                    <td className="py-2 px-2 text-right">{fmtNumber(h.avg_cost)}</td>
                    <td className="py-2 px-2 text-right">{h.price == null ? EMPTY : fmtNumber(h.price)}</td>
                    <td className="py-2 px-2 text-right">{h.market_value == null ? EMPTY : fmtNumber(h.market_value)}</td>
                    <td className={`py-2 px-2 text-right ${changeColor(h.pnl)}`}>
                      {h.pnl == null ? EMPTY : `${h.pnl >= 0 ? "+" : ""}${fmtNumber(h.pnl)} (${fmtPercent(h.pnl_pct, 1, true)})`}
                    </td>
                    <td className="py-2 px-2 text-right text-on-surface-variant">
                      {h.weight == null ? EMPTY : `${h.weight}%`}
                    </td>
                    <td className={`py-2 px-2 text-right font-bold ${scoreColor(h.compass?.long)}`}>
                      {h.compass?.long == null ? EMPTY : Math.round(h.compass.long)}
                    </td>
                    <td className="py-2 pl-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(h)}
                        aria-label={`Xóa ${h.symbol}`}
                        className="text-on-surface-variant hover:text-error transition-colors"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                          delete
                        </span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Sector allocation */}
          <section className="space-y-2">
            <h3 className="font-label-caps text-label-caps text-on-surface uppercase tracking-wide">
              Phân bổ theo ngành
            </h3>
            {data.allocation_sector.map((s) => (
              <div key={s.label} className="flex items-center gap-2">
                <div className="w-40 shrink-0 text-data-sm text-on-surface-variant truncate">{s.label}</div>
                <div className="flex-1 h-4 bg-surface-container-high overflow-hidden">
                  <div className="h-4 bg-primary" style={{ width: `${s.pct ?? 0}%` }} />
                </div>
                <div className="w-14 shrink-0 text-right text-data-sm text-on-surface-variant">{s.pct}%</div>
              </div>
            ))}
          </section>
        </>
      )}

      {data.unpriced.length > 0 && (
        <p className="text-data-sm text-on-surface-variant opacity-70">
          Chưa có giá đồng bộ cho: {data.unpriced.join(", ")} — chạy đồng bộ chỉ số để tính giá trị.
        </p>
      )}
    </div>
  );
}
