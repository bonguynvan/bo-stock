"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CompassScoresMap,
  FunnelRow,
  SavedScreen,
  ScreenerFilterBody,
  ScreenerMeta,
  StockDetail,
  StockResult,
  Watchlist,
} from "@/types/stock";
import {
  createWatchlist,
  deleteSavedScreen,
  deleteWatchlist,
  getCompass,
  getCompassScores,
  getSavedScreens,
  getSectors,
  getStockDetail,
  getWatchlistMetrics,
  getWatchlists,
  saveScreen,
  screenerFilter,
  updateWatchlist,
} from "@/lib/api";
import {
  TIER1_BODY,
  TIER3_COMPASS_CAP,
  filterLiquidity,
  mapPool,
  rankFunnel,
  tier2Flags,
} from "@/lib/funnel";
import { downloadCsv } from "@/lib/csv";
import TopNavBar from "./TopNavBar";
import SideNavBar from "./SideNavBar";
import Header from "./Header";
import Footer from "./Footer";
import Scanlines from "./Scanlines";
import Toast from "./Toast";
import ScreenerGrid from "./ScreenerGrid";
import DetailPanel from "./DetailPanel";
import WatchlistPanel from "./WatchlistPanel";
import JournalSection from "./JournalSection";
import StockDetailView from "./StockDetailView";
import SettingsView from "./SettingsView";
import SectorsView from "./SectorsView";
import QualityPicksView from "./QualityPicksView";
import PortfolioSection from "./PortfolioSection";
import NewsView from "./NewsView";
import WorkspaceView from "./workspace/WorkspaceView";
import TerminalDashboard from "./TerminalDashboard";
import GlobalMarketsView from "./GlobalMarketsView";
import ConnectorsView from "./ConnectorsView";
import ComparisonView from "./ComparisonView";
import AssistantView from "./AssistantView";
import NlScreenerBar from "./NlScreenerBar";
import MarketsMonitorView from "./MarketsMonitorView";
import FactorRankView from "./FactorRankView";
import AlertsView from "./AlertsView";
import CommandBar from "./CommandBar";
import ChecklistPopup from "./ChecklistPopup";
import FunnelModal from "./FunnelModal";
import ScreenerForm, {
  DEFAULT_FORM_STATE,
  SCREENER_PRESETS,
  fromFilterBody,
  toFilterBody,
  type ScreenerFormState,
} from "./ScreenerForm";
import TabBar, { type TabItem } from "./ui/Tabs";
import { listenForDock } from "@/lib/desktopWindows";
import { setRoomSymbol } from "@/lib/room";

const DEFAULT_WATCHLIST_NAME = "Danh mục của tôi";

// Stock-research family: one nav destination ("Screener") with three ranked-list modes.
// Folds the former Yếu tố (factor rank) + Nền tảng (quality picks) destinations in as tabs.
const SCREENER_TABS: readonly TabItem[] = [
  { id: "screener", label: "Lọc", icon: "filter_list" },
  { id: "factors", label: "Xếp hạng yếu tố", icon: "stacked_bar_chart" },
  { id: "quality", label: "Nền tảng vững", icon: "verified" },
];

const FILTER_DEBOUNCE_MS = 400;
const TOAST_DURATION_MS = 2500;

type View = "home" | "global" | "connectors" | "compare" | "assistant" | "pulse" | "alerts" | "factors" | "screener" | "journal" | "detail" | "settings" | "sectors" | "quality" | "portfolio" | "news" | "workspace";

// Terminal command codes → view navigation (research-only surfaces only).
const COMMAND_VIEW: Record<string, View> = {
  HOME: "home",
  WORLD: "global",
  FX: "global",
  COMMOD: "global",
  CRYPTO: "global",
  MACRO: "global",
  WBANK: "global",
  DBN: "global",
  ASEAN: "global",
  CONN: "connectors",
  CMP: "compare",
  AI: "assistant",
  MKT: "pulse",
  ECON: "global",
  ALERT: "alerts",
  FACTOR: "factors",
  SCREEN: "screener",
  SECTOR: "sectors",
  QUALITY: "quality",
  PORT: "portfolio",
  NEWS: "news",
  ANALYTICS: "portfolio",
  JOURNAL: "journal",
  PLAYBOOK: "journal",
  SETTINGS: "settings",
  WORKSPACE: "workspace",
};

// Which side-nav destination lights up for a given view. Folded surfaces map to the
// parent nav item they now live under as a tab (e.g. factors/quality → Screener).
const VIEW_TO_NAV: Record<View, string> = {
  home: "Terminal",
  global: "Thị trường",
  connectors: "Connectors",
  compare: "So sánh",
  assistant: "AI Assistant",
  pulse: "Nhịp TT",
  alerts: "Cảnh báo",
  factors: "Screener",
  screener: "Screener",
  journal: "Nhật ký",
  detail: "Screener",
  settings: "Settings",
  sectors: "Ngành",
  quality: "Screener",
  portfolio: "Portfolio",
  news: "News",
  workspace: "Bàn làm việc",
};

// Views a desktop window may deep-link to via ?view= (detail uses ?symbol= instead).
const DEEP_LINK_VIEWS = new Set<string>(Object.keys(VIEW_TO_NAV));

export default function ScreenerApp() {
  const [view, setView] = useState<View>("home");
  const [journalPrefill, setJournalPrefill] = useState<string | null>(null);
  const [detailSymbol, setDetailSymbol] = useState<string | null>(null);

  const [form, setForm] = useState<ScreenerFormState>(DEFAULT_FORM_STATE);
  const [search, setSearch] = useState("");

  const [stocks, setStocks] = useState<StockResult[]>([]);
  const [meta, setMeta] = useState<ScreenerMeta | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [sectors, setSectors] = useState<string[]>([]);

  // Watchlist + saved-screen state (single-user, no auth).
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [activeWatchlistId, setActiveWatchlistId] = useState<number | null>(null);
  const [watchlistStocks, setWatchlistStocks] = useState<StockResult[]>([]);
  const [savedScreens, setSavedScreens] = useState<SavedScreen[]>([]);
  const [compassScores, setCompassScores] = useState<CompassScoresMap>({});
  const [funnelResult, setFunnelResult] = useState<{
    rows: FunnelRow[];
    tier1Count: number;
    droppedIlliquid: number;
    unknownLiquidity: number;
  } | null>(null);
  const [funnelLoading, setFunnelLoading] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load sector list once (populates the filter dropdown from real data).
  useEffect(() => {
    let cancelled = false;
    getSectors()
      .then((list) => {
        if (!cancelled) setSectors(list);
      })
      .catch(() => {
        /* fall back to the form's built-in list */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Desktop multi-window: a popped-out window deep-links via ?symbol= (a stock detail) or
  // ?view= (a specific terminal view). Read once on first mount. (?view=detach is handled
  // upstream by AppRouter, not here.)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    if (p.get("view") === "detach") return;
    const sym = p.get("symbol");
    const v = p.get("view");
    if (sym) {
      setDetailSymbol(sym.toUpperCase());
      setView("detail");
    } else if (v && DEEP_LINK_VIEWS.has(v) && v !== "detail") {
      setView(v as View);
    }
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_DURATION_MS);
  }, []);

  const refreshWatchlists = useCallback(async () => {
    try {
      setWatchlists(await getWatchlists());
    } catch {
      /* leave existing list; surfaced elsewhere */
    }
  }, []);

  const refreshSavedScreens = useCallback(async () => {
    try {
      setSavedScreens(await getSavedScreens());
    } catch {
      /* non-fatal */
    }
  }, []);

  // Load watchlists + saved screens once.
  useEffect(() => {
    refreshWatchlists();
    refreshSavedScreens();
  }, [refreshWatchlists, refreshSavedScreens]);

  // When a watchlist is active, load its metrics for the table.
  useEffect(() => {
    if (activeWatchlistId === null) {
      setWatchlistStocks([]);
      return;
    }
    let cancelled = false;
    setListLoading(true);
    setListError(null);
    getWatchlistMetrics(activeWatchlistId)
      .then((rows) => {
        if (!cancelled) setWatchlistStocks(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setWatchlistStocks([]);
        setListError(err instanceof Error ? err.message : "Lỗi không xác định");
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeWatchlistId, watchlists]);

  // Fetch filtered stocks whenever the form changes (debounced). Skipped while a
  // watchlist is active — the table then shows the watchlist's metrics instead.
  useEffect(() => {
    if (activeWatchlistId !== null) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      setListLoading(true);
      setListError(null);
      screenerFilter(toFilterBody(form))
        .then((res) => {
          if (cancelled) return;
          setStocks(res.data);
          setMeta(res.meta);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setStocks([]);
          setMeta(null);
          setListError(err instanceof Error ? err.message : "Lỗi không xác định");
        })
        .finally(() => {
          if (!cancelled) setListLoading(false);
        });
    }, FILTER_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [form, activeWatchlistId]);

  // Fetch the detail panel payload when a symbol is selected.
  useEffect(() => {
    if (!selectedSymbol) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    getStockDetail(selectedSymbol)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDetail(null);
        setDetailError(err instanceof Error ? err.message : "Lỗi không xác định");
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSymbol]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // Table source: watchlist metrics when a watchlist is active, else screener results.
  const baseStocks = activeWatchlistId !== null ? watchlistStocks : stocks;

  // Precomputed Compass badges for the visible rows (batch DB read, no AI).
  useEffect(() => {
    const symbols = baseStocks.map((s) => s.symbol);
    if (symbols.length === 0) return;
    let cancelled = false;
    getCompassScores(symbols)
      .then((m) => !cancelled && setCompassScores((prev) => ({ ...prev, ...m })))
      .catch(() => {
        /* badges are optional */
      });
    return () => {
      cancelled = true;
    };
  }, [baseStocks]);

  // Search is delegated to bo-grid's quick-filter (matches across all columns),
  // fed via the `filter` prop below — so the grid receives the full result set.
  const visibleStocks = baseStocks;

  // The watchlist whose membership the row stars edit (active, else first).
  const targetWatchlist =
    watchlists.find((w) => w.id === activeWatchlistId) ?? watchlists[0] ?? null;
  const targetSymbols = useMemo(
    () => new Set(targetWatchlist?.symbols ?? []),
    [targetWatchlist],
  );

  const handleToggleWatchlist = useCallback(
    async (symbol: string) => {
      try {
        if (!targetWatchlist) {
          await createWatchlist(DEFAULT_WATCHLIST_NAME, [symbol]);
          await refreshWatchlists();
          showToast(`Đã tạo “${DEFAULT_WATCHLIST_NAME}” với ${symbol}`);
          return;
        }
        const has = targetWatchlist.symbols.includes(symbol);
        const next = has
          ? targetWatchlist.symbols.filter((s) => s !== symbol)
          : [...targetWatchlist.symbols, symbol];
        await updateWatchlist(targetWatchlist.id, { symbols: next });
        await refreshWatchlists();
        showToast(
          has
            ? `Đã bỏ ${symbol} khỏi ${targetWatchlist.name}`
            : `Đã thêm ${symbol} vào ${targetWatchlist.name}`,
        );
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Lỗi khi cập nhật danh mục");
      }
    },
    [targetWatchlist, refreshWatchlists, showToast],
  );

  const handleCreateWatchlist = useCallback(async () => {
    const name = window.prompt("Tên danh mục mới:", DEFAULT_WATCHLIST_NAME)?.trim();
    if (!name) return;
    try {
      const created = await createWatchlist(name);
      await refreshWatchlists();
      setActiveWatchlistId(created.id);
      showToast(`Đã tạo danh mục “${name}”`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi khi tạo danh mục");
    }
  }, [refreshWatchlists, showToast]);

  const handleDeleteWatchlist = useCallback(
    async (id: number) => {
      try {
        await deleteWatchlist(id);
        if (activeWatchlistId === id) setActiveWatchlistId(null);
        await refreshWatchlists();
        showToast("Đã xóa danh mục");
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Lỗi khi xóa danh mục");
      }
    },
    [activeWatchlistId, refreshWatchlists, showToast],
  );

  const handleSaveScreen = useCallback(async () => {
    const name = window.prompt("Tên bộ lọc:");
    if (!name?.trim()) return;
    try {
      await saveScreen(name.trim(), toFilterBody(form));
      await refreshSavedScreens();
      showToast(`Đã lưu bộ lọc “${name.trim()}”`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi khi lưu bộ lọc");
    }
  }, [form, refreshSavedScreens, showToast]);

  const handleLoadScreen = useCallback(
    (id: number) => {
      const screen = savedScreens.find((s) => s.id === id);
      if (!screen) return;
      setActiveWatchlistId(null);
      setForm(fromFilterBody(screen.criteria));
      showToast(`Đã tải bộ lọc “${screen.name}”`);
    },
    [savedScreens, showToast],
  );

  const handleDeleteScreen = useCallback(
    async (id: number) => {
      try {
        await deleteSavedScreen(id);
        await refreshSavedScreens();
        showToast("Đã xóa bộ lọc");
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Lỗi khi xóa bộ lọc");
      }
    },
    [refreshSavedScreens, showToast],
  );

  const handleReset = useCallback(() => {
    setForm(DEFAULT_FORM_STATE);
    setSearch("");
    showToast("Đã làm mới bộ lọc");
  }, [showToast]);

  // Apply an AI-derived filter (natural-language screener) to the form.
  const handleNlApply = useCallback((body: ScreenerFilterBody) => {
    setActiveWatchlistId(null);
    setForm(fromFilterBody(body));
  }, []);

  const handleExportCsv = useCallback(() => {
    if (visibleStocks.length === 0) {
      showToast("Không có dữ liệu để xuất");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(visibleStocks, `v-investment-screener-${stamp}.csv`);
    showToast(`Đã xuất ${visibleStocks.length} mã ra CSV`);
  }, [visibleStocks, showToast]);

  const handleNavigate = useCallback(
    (label: string) => {
      if (label === "Terminal") setView("home");
      else if (label === "Thị trường") setView("global");
      else if (label === "Connectors") setView("connectors");
      else if (label === "So sánh") setView("compare");
      else if (label === "AI Assistant") setView("assistant");
      else if (label === "Nhịp TT") setView("pulse");
      else if (label === "Yếu tố") setView("factors");
      else if (label === "Radar") setView("pulse");
      else if (label === "Cảnh báo") setView("alerts");
      else if (label === "Nhật ký") setView("journal");
      else if (label === "Screener") setView("screener");
      else if (label === "Portfolio") setView("portfolio");
      else if (label === "News") setView("news");
      else if (label === "Bàn làm việc") setView("workspace");
      else if (label === "Analytics") setView("portfolio");
      else if (label === "Nền tảng") setView("quality");
      else if (label === "Ngành") setView("sectors");
      else if (label === "Settings") setView("settings");
      else if (label === "Quy Trình") setView("journal");
      else showToast(`${label} chưa khả dụng`);
    },
    [showToast],
  );

  const handleOpenJournal = useCallback((symbol: string) => {
    setJournalPrefill(symbol);
    setView("journal");
  }, []);

  const handleOpenDetail = useCallback((symbol: string) => {
    setDetailSymbol(symbol);
    setView("detail");
    setRoomSymbol(symbol); // drive the workspace symbol → linked windows follow
  }, []);

  // Desktop: when a detached window "docks back", open that screen/symbol in this (main) window.
  useEffect(() => {
    let un: (() => void) | undefined;
    void listenForDock((p) => {
      if (p.screen === "detail" && p.symbol) handleOpenDetail(p.symbol);
      else if (p.screen === "radar" || p.screen === "pulse") setView("pulse");
    }).then((fn) => {
      un = fn;
    });
    return () => un?.();
  }, [handleOpenDetail]);

  // Terminal command bar: function code → view; unknown codes fall back to a toast.
  const handleCommand = useCallback(
    (code: string) => {
      const target = COMMAND_VIEW[code];
      if (target === "screener") setActiveWatchlistId(null);
      if (target) setView(target);
      else showToast(`Lệnh “${code}” chưa khả dụng`);
    },
    [showToast],
  );

  // 4-tier funnel: Tier 1 hard filter → Tier 2 flags → Tier 3 Compass short-term.
  // Pure orchestration over existing APIs; never triggers AI.
  const handleRunFunnel = useCallback(async () => {
    setFunnelLoading(true);
    try {
      setActiveWatchlistId(null);
      setForm(fromFilterBody(TIER1_BODY)); // reflect Tier 1 in the form
      const res = await screenerFilter(TIER1_BODY);
      // Tier 1.5 — liquidity guard (drops known-illiquid; keeps unknown).
      const { kept, droppedIlliquid, unknown } = filterLiquidity(res.data);
      const flagged: FunnelRow[] = kept.map((s) => ({
        ...s,
        flags: tier2Flags(s),
        shortTerm: null,
      }));
      const subset = flagged.slice(0, TIER3_COMPASS_CAP);
      const withShort = await mapPool(subset, 5, async (row) => {
        try {
          const c = await getCompass(row.symbol);
          return { ...row, shortTerm: c.short_term?.score ?? null };
        } catch {
          return row;
        }
      });
      setFunnelResult({
        rows: rankFunnel(withShort),
        tier1Count: res.data.length,
        droppedIlliquid,
        unknownLiquidity: unknown,
      });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Lỗi khi chạy phễu lọc");
    } finally {
      setFunnelLoading(false);
    }
  }, [showToast]);

  const inWatchlistMode = activeWatchlistId !== null;
  const filtered = inWatchlistMode
    ? visibleStocks.length
    : (meta?.filtered ?? visibleStocks.length);
  const total = inWatchlistMode
    ? watchlistStocks.length
    : (meta?.total ?? visibleStocks.length);
  const lastUpdate = baseStocks.find((s) => s.updated_at)?.updated_at ?? null;

  return (
    <>
      <TopNavBar search={search} onSearchChange={setSearch} />
      <div className="flex flex-1 overflow-hidden">
        <SideNavBar
          active={VIEW_TO_NAV[view]}
          onNavigate={handleNavigate}
        />
        <main className="flex-1 flex flex-col overflow-hidden bg-background">
          {view === "home" ? (
            <TerminalDashboard onOpenSymbol={handleOpenDetail} onCommand={handleCommand} />
          ) : view === "global" ? (
            <GlobalMarketsView />
          ) : view === "connectors" ? (
            <ConnectorsView />
          ) : view === "compare" ? (
            <ComparisonView onOpenSymbol={handleOpenDetail} />
          ) : view === "assistant" ? (
            <AssistantView />
          ) : view === "pulse" ? (
            <MarketsMonitorView onOpenSymbol={handleOpenDetail} />
          ) : view === "alerts" ? (
            <AlertsView onToast={showToast} onOpenSymbol={handleOpenDetail} />
          ) : view === "factors" ? (
            <>
              <TabBar
                tabs={SCREENER_TABS}
                active={view}
                onChange={(id) => setView(id as View)}
                ariaLabel="Chế độ nghiên cứu cổ phiếu"
              />
              <FactorRankView onOpenSymbol={handleOpenDetail} />
            </>
          ) : view === "settings" ? (
            <SettingsView onToast={showToast} />
          ) : view === "workspace" ? (
            <WorkspaceView onToast={showToast} />
          ) : view === "portfolio" ? (
            <PortfolioSection onOpenDetail={handleOpenDetail} onToast={showToast} />
          ) : view === "news" ? (
            <>
              <header className="p-4 border-b border-outline-variant bg-surface-container-low">
                <h1 className="font-headline-md text-headline-md text-on-surface">Tin tức</h1>
                <p className="text-on-surface-variant font-body-md text-body-md mt-1">
                  Tin thị trường chứng khoán Việt Nam — tổng hợp từ nguồn công khai.
                </p>
              </header>
              <NewsView onToast={showToast} />
            </>
          ) : view === "quality" ? (
            <>
              <TabBar
                tabs={SCREENER_TABS}
                active={view}
                onChange={(id) => setView(id as View)}
                ariaLabel="Chế độ nghiên cứu cổ phiếu"
              />
              <header className="p-4 border-b border-outline-variant bg-surface-container-low">
                <h1 className="font-headline-md text-headline-md text-on-surface">
                  Nền tảng vững
                </h1>
                <p className="text-on-surface-variant font-body-md text-body-md mt-1">
                  Cổ phiếu có nền tảng cơ bản tốt — ROE bền, đòn bẩy thấp, định giá hợp lý — để
                  bạn tự nghiên cứu. Không phải khuyến nghị.
                </p>
              </header>
              <QualityPicksView
                onOpenDetail={handleOpenDetail}
                onToggleWatchlist={handleToggleWatchlist}
                watchlistSymbols={targetSymbols}
              />
            </>
          ) : view === "sectors" ? (
            <>
              <header className="p-4 border-b border-outline-variant bg-surface-container-low">
                <h1 className="font-headline-md text-headline-md text-on-surface">
                  Tổng quan Ngành
                </h1>
                <p className="text-on-surface-variant font-body-md text-body-md mt-1">
                  So sánh định giá & lợi nhuận trung vị giữa các ngành — bối cảnh nghiên cứu.
                </p>
              </header>
              <SectorsView />
            </>
          ) : view === "journal" ? (
            <JournalSection prefillSymbol={journalPrefill} onToast={showToast} />
          ) : view === "detail" && detailSymbol ? (
            <StockDetailView
              symbol={detailSymbol}
              onBack={() => setView("screener")}
              onToast={showToast}
              isWatched={targetSymbols.has(detailSymbol)}
              onToggleWatchlist={handleToggleWatchlist}
            />
          ) : (
            <>
              <TabBar
                tabs={SCREENER_TABS}
                active="screener"
                onChange={(id) => setView(id as View)}
                ariaLabel="Chế độ nghiên cứu cổ phiếu"
              />
              <Header
                onExportCsv={handleExportCsv}
                onSaveFilter={handleSaveScreen}
                canExport={visibleStocks.length > 0}
              />
              <NlScreenerBar onApply={handleNlApply} onToast={showToast} />
              <div className="px-4 py-2 border-b border-outline-variant bg-surface-container-low flex items-center gap-2 flex-wrap">
                <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                  Bộ lọc nhanh:
                </span>
                {SCREENER_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    title={p.hint}
                    onClick={() => {
                      setActiveWatchlistId(null);
                      setForm(fromFilterBody(p.body));
                    }}
                    className="px-2.5 py-1 text-data-sm border border-outline-variant hover:border-primary hover:text-primary transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex-1 flex overflow-hidden">
                <div className="w-72 flex flex-col border-r border-outline-variant overflow-hidden">
                  <div className="p-2 border-b border-outline-variant flex gap-2">
                    <button
                      type="button"
                      onClick={handleRunFunnel}
                      disabled={funnelLoading}
                      title="Tự động chạy Tầng 1–3 (lọc cứng → earnings quality → Compass)"
                      className="flex-1 px-2 py-1.5 bg-primary-container text-on-primary font-bold font-label-caps text-label-caps uppercase hover:brightness-110 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                        filter_alt
                      </span>
                      {funnelLoading ? "Đang lọc…" : "Lọc theo Quy Trình"}
                    </button>
                    <ChecklistPopup />
                  </div>
                  <WatchlistPanel
                    watchlists={watchlists}
                    activeId={activeWatchlistId}
                    onSelect={setActiveWatchlistId}
                    onCreate={handleCreateWatchlist}
                    onDelete={handleDeleteWatchlist}
                    savedScreens={savedScreens}
                    onLoadScreen={handleLoadScreen}
                    onDeleteScreen={handleDeleteScreen}
                  />
                  <ScreenerForm
                    state={form}
                    onChange={setForm}
                    onReset={handleReset}
                    sectors={sectors}
                  />
                </div>
                <ScreenerGrid
                  stocks={visibleStocks}
                  compassScores={compassScores}
                  loading={listLoading}
                  error={listError}
                  filter={search}
                  onSelect={setSelectedSymbol}
                  onToggleWatchlist={handleToggleWatchlist}
                  watchlistSymbols={targetSymbols}
                />
                <DetailPanel
                  detail={detail}
                  loading={detailLoading}
                  error={detailError}
                  selectedSymbol={selectedSymbol}
                  onJournal={handleOpenJournal}
                  onOpenDetail={handleOpenDetail}
                />
              </div>
              <Footer filtered={filtered} total={total} lastUpdate={lastUpdate} />
            </>
          )}
        </main>
      </div>
      {funnelResult && (
        <FunnelModal
          rows={funnelResult.rows}
          tier1Count={funnelResult.tier1Count}
          droppedIlliquid={funnelResult.droppedIlliquid}
          unknownLiquidity={funnelResult.unknownLiquidity}
          onClose={() => setFunnelResult(null)}
          onOpenDetail={(symbol) => {
            setFunnelResult(null);
            handleOpenDetail(symbol);
          }}
        />
      )}
      <CommandBar onCommand={handleCommand} onSymbol={handleOpenDetail} />
      <Scanlines />
      <Toast message={toast} />
    </>
  );
}
