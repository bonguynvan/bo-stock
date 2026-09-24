"use client";

import type {
  AnalysisResult,
  CashflowActivity,
  StructureItem,
} from "@/types/stock";

const fmtB = (v: number | null): string =>
  v == null ? "—" : `${v.toLocaleString("vi-VN")} tỷ`;
const fmtPct = (v: number | null): string => (v == null ? "" : `${v.toFixed(1)}%`);

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-label-caps text-label-caps text-primary uppercase tracking-widest">
      {children}
    </h3>
  );
}

function StructureList({ items }: { items: StructureItem[] }) {
  return (
    <div className="space-y-1">
      {items.map((it, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-3 bg-surface-container p-2 border border-outline-variant"
        >
          <span className="text-body-md text-on-surface-variant truncate">{it.label}</span>
          <span className="flex items-baseline gap-2 shrink-0">
            <span className="font-data-md text-data-md text-on-surface">{fmtB(it.value)}</span>
            {it.pct != null && (
              <span className="font-data-sm text-data-sm text-on-surface-variant opacity-70">
                {fmtPct(it.pct)}
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function CashflowBlock({ label, activity }: { label: string; activity: CashflowActivity }) {
  if (activity.net == null && activity.items.length === 0) return null;
  const tone = (activity.net ?? 0) >= 0 ? "text-secondary" : "text-error";
  return (
    <div className="bg-surface-container p-3 border border-outline-variant">
      <div className="flex items-center justify-between">
        <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
          {label}
        </span>
        <span className={`font-data-md text-data-md ${tone}`}>{fmtB(activity.net)}</span>
      </div>
      {activity.items.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {activity.items.map((it, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-3 text-body-md text-on-surface-variant"
            >
              <span className="truncate">{it.label}</span>
              <span className="font-data-sm text-data-sm shrink-0">{fmtB(it.value)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AnalysisDetails({ analysis }: { analysis: AnalysisResult }) {
  const ratios = analysis.ratios ?? [];
  const capital = analysis.capital_structure ?? [];
  const breakdown = analysis.revenue_breakdown;
  const cf = analysis.cashflow;
  const notes = analysis.notes ?? [];
  const trendNote = analysis.multi_year_trend?.note;

  const hasCashflow =
    !!cf &&
    [cf.operating, cf.investing, cf.financing].some(
      (a) => a.net != null || a.items.length > 0,
    );

  return (
    <>
      {trendNote && (
        <p className="text-data-sm text-on-surface-variant opacity-70">ⓘ {trendNote}</p>
      )}

      {ratios.length > 0 && (
        <div className="space-y-2">
          <SectionTitle>Chỉ số tài chính</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {ratios.map((r, i) => (
              <div key={i} className="bg-surface-container p-2 border border-outline-variant">
                <div className="text-data-sm text-on-surface-variant">{r.label}</div>
                <div className="font-data-md text-data-md text-on-surface">{r.value}</div>
                {r.benchmark && (
                  <div className="text-data-sm text-secondary opacity-80 mt-0.5">
                    {r.benchmark}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {capital.length > 0 && (
        <div className="space-y-2">
          <SectionTitle>Cơ cấu nguồn vốn</SectionTitle>
          <StructureList items={capital} />
        </div>
      )}

      {breakdown && (breakdown.items.length > 0 || breakdown.note) && (
        <div className="space-y-2">
          <SectionTitle>Cơ cấu doanh thu</SectionTitle>
          {breakdown.items.length > 0 ? (
            <StructureList items={breakdown.items} />
          ) : (
            <p className="text-body-md text-on-surface-variant opacity-70">{breakdown.note}</p>
          )}
        </div>
      )}

      {hasCashflow && cf && (
        <div className="space-y-2">
          <SectionTitle>Dòng tiền chi tiết</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <CashflowBlock label="Hoạt động KD" activity={cf.operating} />
            <CashflowBlock label="Hoạt động đầu tư" activity={cf.investing} />
            <CashflowBlock label="Hoạt động tài chính" activity={cf.financing} />
          </div>
        </div>
      )}

      {notes.length > 0 && (
        <div className="space-y-2">
          <SectionTitle>Thuyết minh quan trọng</SectionTitle>
          <ul className="list-disc list-inside text-body-md text-on-surface space-y-0.5">
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
