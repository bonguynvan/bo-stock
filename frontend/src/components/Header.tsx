"use client";

import MetricLegend from "./MetricLegend";

interface HeaderProps {
  onExportCsv: () => void;
  onSaveFilter: () => void;
  canExport: boolean;
}

export default function Header({ onExportCsv, onSaveFilter, canExport }: HeaderProps) {
  return (
    <header className="p-4 border-b border-outline-variant bg-surface-container-low flex justify-between items-end">
      <div>
        <h1 className="font-headline-md text-headline-md text-on-surface">
          Fundamental Screener — Vietnam Equity
        </h1>
        <p className="text-on-surface-variant font-body-md text-body-md mt-1">
          Lọc cổ phiếu dựa trên các chỉ số tài chính cơ bản và xếp hạng Quant AI.
        </p>
      </div>
      <div className="flex gap-2">
        <MetricLegend />
        <button
          type="button"
          onClick={onExportCsv}
          disabled={!canExport}
          className="px-4 py-1.5 border border-outline-variant text-body-md font-medium hover:bg-surface-container transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined">download</span> Xuất CSV
        </button>
        <button
          type="button"
          onClick={onSaveFilter}
          className="px-4 py-1.5 bg-primary-container text-on-primary font-bold text-body-md hover:brightness-110 transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined material-symbols-fill">save</span> Lưu
          Bộ Lọc
        </button>
      </div>
    </header>
  );
}
