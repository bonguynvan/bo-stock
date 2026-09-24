"use client";

import { useEffect, useState } from "react";
import { getConnectors, type Connector } from "@/lib/api";
import TabBar, { type TabItem } from "./ui/Tabs";
import TerminalPanel from "./TerminalPanel";
import WorldMarketsPanel from "./WorldMarketsPanel";
import CryptoPanel from "./CryptoPanel";
import MacroPanel from "./MacroPanel";
import FxPanel from "./FxPanel";
import WorldBankPanel from "./WorldBankPanel";
import CommoditiesPanel from "./CommoditiesPanel";
import AseanGdpPanel from "./AseanGdpPanel";
import DbnomicsPanel from "./DbnomicsPanel";

/** Connector status chip — mirrors Fincept's connector registry. */
function ConnectorChip({ c }: { c: Connector }) {
  const ok = c.configured;
  const tone = ok ? "text-secondary border-secondary/40" : "text-on-surface-variant border-outline-variant";
  return (
    <span className={`flex items-center gap-1.5 px-2 py-1 border ${tone}`} title={`${c.source} · ${c.domain}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-secondary" : "bg-on-surface-variant/50"}`} />
      <span className="font-data-md text-data-sm">{c.source}</span>
      {c.requires_key && !ok && (
        <span className="font-label-caps text-label-caps uppercase opacity-70">cần key</span>
      )}
    </span>
  );
}

type Tab = "world" | "macro";

const TABS: readonly TabItem[] = [
  { id: "world", label: "Thế giới", icon: "public" },
  { id: "macro", label: "Vĩ mô", icon: "account_balance" },
];

/**
 * Full-width global + macro context view. Two modes fold what used to be two separate
 * destinations (Thị trường + Kinh tế) into one — Economics was a strict subset of the
 * world view's macro panels. Research-only aggregation of free/public sources.
 * Destination for WORLD/CRYPTO/MACRO/ECON commands and panel "expand".
 */
export default function GlobalMarketsView() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [tab, setTab] = useState<Tab>("world");

  useEffect(() => {
    let cancelled = false;
    getConnectors()
      .then((list) => !cancelled && setConnectors(list))
      .catch(() => {
        /* status strip is optional */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <header className="p-4 border-b border-outline-variant bg-surface-container-low">
        <h1 className="font-headline-md text-headline-md text-on-surface">Vĩ mô &amp; Thế giới</h1>
        <p className="text-on-surface-variant font-body-md text-body-md mt-1">
          Bối cảnh toàn cầu và vĩ mô tổng hợp từ nguồn công khai — chỉ số, hàng hóa, crypto,
          FX, và số liệu kinh tế Việt Nam/ASEAN. Chỉ để nghiên cứu, không phải khuyến nghị.
        </p>
        {connectors.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {connectors.map((c) => (
              <ConnectorChip key={c.key} c={c} />
            ))}
          </div>
        )}
      </header>

      <TabBar tabs={TABS} active={tab} onChange={(id) => setTab(id as Tab)} ariaLabel="Chế độ bối cảnh" />

      {tab === "world" ? (
        <div className="flex-1 min-h-0 grid gap-2 p-2 grid-cols-1 lg:grid-cols-2 auto-rows-fr overflow-auto">
          <TerminalPanel title="Chỉ số / Hàng hóa" icon="public" code="WORLD">
            <WorldMarketsPanel />
          </TerminalPanel>
          <TerminalPanel title="Ngoại hối (FX)" icon="currency_exchange" code="FX">
            <FxPanel />
          </TerminalPanel>
          <TerminalPanel title="Hàng hóa" icon="oil_barrel" code="COMMOD">
            <CommoditiesPanel />
          </TerminalPanel>
          <TerminalPanel title="Crypto" icon="currency_bitcoin" code="CRYPTO">
            <CryptoPanel />
          </TerminalPanel>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid gap-2 p-2 grid-cols-1 lg:grid-cols-2 auto-rows-fr overflow-auto">
          <TerminalPanel title="Vĩ mô Việt Nam · World Bank" icon="account_balance_wallet" code="WBANK">
            <WorldBankPanel />
          </TerminalPanel>
          <TerminalPanel title="Vĩ mô Việt Nam · IMF WEO" icon="public" code="DBN">
            <DbnomicsPanel />
          </TerminalPanel>
          <TerminalPanel title="So sánh ASEAN · GDP" icon="leaderboard" code="ASEAN">
            <AseanGdpPanel />
          </TerminalPanel>
          <TerminalPanel title="Vĩ mô toàn cầu · FRED" icon="account_balance" code="MACRO">
            <MacroPanel />
          </TerminalPanel>
        </div>
      )}
    </>
  );
}
