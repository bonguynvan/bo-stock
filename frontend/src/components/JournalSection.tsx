"use client";

import { useState } from "react";
import JournalView from "./JournalView";
import PlaybookView from "./PlaybookView";
import TabBar, { type TabItem } from "./ui/Tabs";

interface JournalSectionProps {
  prefillSymbol: string | null;
  onToast: (message: string) => void;
}

type Tab = "journal" | "playbook";

const TABS: readonly TabItem[] = [
  { id: "journal", label: "Nhật ký", icon: "menu_book" },
  { id: "playbook", label: "Quy Trình", icon: "fact_check" },
];

/**
 * Discipline hub — the investment journal and the personal playbook/process in one
 * destination. Folds the former standalone Quy Trình view in as a tab (both are the
 * kỷ luật đầu tư surface: log decisions, and the rules you read before deciding).
 */
export default function JournalSection({ prefillSymbol, onToast }: JournalSectionProps) {
  // Deep-link from a symbol row lands on the journal tab with its prefill.
  const [tab, setTab] = useState<Tab>("journal");

  return (
    <>
      <TabBar tabs={TABS} active={tab} onChange={(id) => setTab(id as Tab)} ariaLabel="Chế độ nhật ký" />
      {tab === "journal" ? (
        <>
          <header className="p-4 border-b border-outline-variant bg-surface-container-low">
            <h1 className="font-headline-md text-headline-md text-on-surface">Nhật ký Đầu tư</h1>
            <p className="text-on-surface-variant font-body-md text-body-md mt-1">
              Ghi lại luận điểm, giá kỳ vọng và catalyst — để nhìn lại quyết định sau này.
            </p>
          </header>
          <JournalView prefillSymbol={prefillSymbol} onToast={onToast} />
        </>
      ) : (
        <PlaybookView onToast={onToast} />
      )}
    </>
  );
}
