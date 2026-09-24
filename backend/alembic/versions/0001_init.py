"""initial schema: stocks, stock_metrics, saved_filters

Revision ID: 0001_init
Revises:
Create Date: 2026-06-29
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001_init"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "stocks",
        sa.Column("symbol", sa.String(length=10), primary_key=True),
        sa.Column("company_name", sa.String(length=255)),
        sa.Column("exchange", sa.String(length=10)),
        sa.Column("industry", sa.String(length=100)),
        sa.Column("market_cap", sa.BigInteger()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "stock_metrics",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "symbol",
            sa.String(length=10),
            sa.ForeignKey("stocks.symbol", ondelete="CASCADE"),
            index=True,
        ),
        sa.Column("report_date", sa.Date()),
        sa.Column("period", sa.String(length=10)),
        sa.Column("pe", sa.Float()),
        sa.Column("pb", sa.Float()),
        sa.Column("ev_ebitda", sa.Float()),
        sa.Column("roe", sa.Float()),
        sa.Column("roa", sa.Float()),
        sa.Column("gross_margin", sa.Float()),
        sa.Column("net_margin", sa.Float()),
        sa.Column("revenue_growth", sa.Float()),
        sa.Column("eps_growth", sa.Float()),
        sa.Column("profit_growth", sa.Float()),
        sa.Column("debt_equity", sa.Float()),
        sa.Column("current_ratio", sa.Float()),
        sa.Column("free_cash_flow", sa.BigInteger()),
        sa.Column("avg_volume_30d", sa.BigInteger()),
        sa.Column("close_price", sa.Float()),
        sa.Column("change_pct", sa.Float()),
        sa.Column("dividend_yield", sa.Float()),
        sa.Column("charter_capital", sa.BigInteger()),
        sa.Column("eps_trailing", sa.Float()),
        sa.Column("cash", sa.BigInteger()),
        sa.Column("tcbs_score", sa.Float()),
        sa.Column("valuation_score", sa.Float()),
        sa.Column("financial_health_score", sa.Float()),
        sa.Column("quant_score", sa.Float()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("symbol", "report_date", "period", name="uq_metric_period"),
    )

    op.create_table(
        "saved_filters",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("criteria", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("saved_filters")
    op.drop_table("stock_metrics")
    op.drop_table("stocks")
