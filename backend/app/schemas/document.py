"""Document (BCTC) + AI analysis schemas.

The analysis is intentionally rich: beyond the headline figures/summary it carries
multi-year trends, balance-sheet structure, extended ratios, a 3-activity cash-flow
breakdown, and key notes. Numeric trend/structure/cash-flow values are raw numbers
(tỷ VND or %) so the frontend can chart them directly. All extended fields default
to empty — the model fills only what the report actually contains.
"""
from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class KeyFigure(BaseModel):
    label: str
    value: str
    unit: str | None = None


class StructureItem(BaseModel):
    label: str
    value: float | None = None  # tỷ VND
    pct: float | None = None  # % of the whole


class MultiYearTrend(BaseModel):
    """Parallel arrays indexed by ``years`` (raw numbers; tỷ VND or %)."""

    years: list[str] = []
    revenue: list[float | None] = []
    net_profit: list[float | None] = []
    gross_margin_pct: list[float | None] = []
    net_margin_pct: list[float | None] = []
    roe_pct: list[float | None] = []
    roa_pct: list[float | None] = []
    total_debt: list[float | None] = []
    equity: list[float | None] = []
    operating_cashflow: list[float | None] = []  # tỷ VND, per year — for earnings-quality
    other_income: list[float | None] = []  # tỷ VND, per year — flags one-off profit
    note: str = ""  # e.g. "chỉ có dữ liệu 2 năm"


class RevenueBreakdown(BaseModel):
    items: list[StructureItem] = []
    note: str = ""  # "không có dữ liệu" if no segment disclosure


class Ratio(BaseModel):
    label: str
    value: str
    benchmark: str | None = None


class CashflowItem(BaseModel):
    label: str
    value: float | None = None  # tỷ VND


class CashflowActivity(BaseModel):
    net: float | None = None  # tỷ VND
    items: list[CashflowItem] = []


class Cashflow(BaseModel):
    operating: CashflowActivity = Field(default_factory=CashflowActivity)
    investing: CashflowActivity = Field(default_factory=CashflowActivity)
    financing: CashflowActivity = Field(default_factory=CashflowActivity)


class AnalysisResult(BaseModel):
    """Structured, research-only output (no buy/sell advice)."""

    # Core (kept stable — do not restructure)
    key_figures: list[KeyFigure] = []
    summary: str = ""
    yoy_changes: list[str] = []
    risk_flags: list[str] = []
    # Extended analysis (filled only when the report contains it)
    multi_year_trend: MultiYearTrend = Field(default_factory=MultiYearTrend)
    asset_structure: list[StructureItem] = []
    capital_structure: list[StructureItem] = []
    revenue_breakdown: RevenueBreakdown = Field(default_factory=RevenueBreakdown)
    ratios: list[Ratio] = []
    cashflow: Cashflow = Field(default_factory=Cashflow)
    notes: list[str] = []


class StrengthPoint(BaseModel):
    point: str
    evidence: str = ""
    significance: str = ""


class ConcernPoint(BaseModel):
    point: str
    evidence: str = ""
    implication: str = ""


class ValuationContext(BaseModel):
    summary: str = ""
    what_market_implies: str = ""
    key_uncertainty: str = ""


class BenchMetric(BaseModel):
    key: str
    label: str
    higher_is_better: bool = True
    value: float | None = None
    median: float | None = None
    n: int = 0
    percentile: int | None = None


class BenchPeer(BaseModel):
    symbol: str
    company_name: str | None = None
    market_cap: int | None = None
    pe: float | None = None
    pb: float | None = None
    roe: float | None = None
    roa: float | None = None
    net_margin: float | None = None


class IndustryComparison(BaseModel):
    industry: str
    peer_count: int
    metrics: list[BenchMetric] = []
    peers: list[BenchPeer] = []


class RecentDevelopment(BaseModel):
    headline: str
    note: str = ""


class ResearchQuestion(BaseModel):
    question: str
    search_keywords: list[str] = []
    question_type: str = "other"  # dividend|agm|capex|business_update|shareholder|regulatory|other


class ConsiderationSummary(BaseModel):
    """"Tóm tắt để cân nhắc" — objective digest. NOT a buy/sell recommendation."""

    strengths: list[StrengthPoint] = []
    concerns: list[ConcernPoint] = []
    valuation_context: ValuationContext | None = None
    questions_to_answer: list[ResearchQuestion] = []
    compass_interpretation: str | None = None
    recent_developments: list[RecentDevelopment] = []
    industry_comparison: IndustryComparison | None = None

    @field_validator("questions_to_answer", mode="before")
    @classmethod
    def _coerce_questions(cls, v: object) -> list:
        # Back-compat: older stored digests kept questions as plain strings.
        if not isinstance(v, list):
            return []
        return [{"question": q} if isinstance(q, str) else q for q in v]


class DocumentOut(BaseModel):
    id: int
    symbol: str | None
    filename: str
    size_bytes: int | None
    source_url: str | None = None
    report_period: str | None = None
    analysis: AnalysisResult | None = None
    analysis_model: str | None = None
    consideration_summary: ConsiderationSummary | None = None
    uploaded_at: str | None = None
    analyzed_at: str | None = None
