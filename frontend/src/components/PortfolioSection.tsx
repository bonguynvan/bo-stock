"use client";

import { useState } from "react";
import PortfolioView from "./PortfolioView";
import AnalyticsView from "./AnalyticsView";
import TabBar, { type TabItem } from "./ui/Tabs";

interface PortfolioSectionProps {
  onOpenDetail: (symbol: string) => void;
  onToast: (message: string) => void;
}

type Tab = "holdings" | "analytics";

const TABS: readonly TabItem[] = [
  { id: "holdings", label: "Danh mục", icon: "account_balance_wallet" },
  { id: "analytics", label: "Phân tích", icon: "insights" },
];

/**
 * Portfolio hub — holdings plus their analytics in one destination. Folds the former
 * standalone Analytics view in as a tab (market context + concentration/allocation vs
 * the market belong next to the portfolio they describe). Research-only, self-entered.
 */
export default function PortfolioSection({ onOpenDetail, onToast }: PortfolioSectionProps) {
  const [tab, setTab] = useState<Tab>("holdings");

  return (
    <>
      <TabBar tabs={TABS} active={tab} onChange={(id) => setTab(id as Tab)} ariaLabel="Chế độ danh mục" />
      {tab === "holdings" ? (
        <>
          <header className="p-4 border-b border-outline-variant bg-surface-container-low">
            <h1 className="font-headline-md text-headline-md text-on-surface">Danh mục</h1>
            <p className="text-on-surface-variant font-body-md text-body-md mt-1">
              Theo dõi cổ phiếu bạn nắm giữ — giá trị, lãi/lỗ, phân bổ. Tự nhập, không đặt lệnh.
            </p>
          </header>
          <PortfolioView onOpenDetail={onOpenDetail} onToast={onToast} />
        </>
      ) : (
        <>
          <header className="p-4 border-b border-outline-variant bg-surface-container-low">
            <h1 className="font-headline-md text-headline-md text-on-surface">Phân tích</h1>
            <p className="text-on-surface-variant font-body-md text-body-md mt-1">
              Bối cảnh thị trường (VN-Index) &amp; phân tích danh mục — tập trung, phân bổ, so với thị trường.
            </p>
          </header>
          <AnalyticsView onToast={onToast} />
        </>
      )}
    </>
  );
}
