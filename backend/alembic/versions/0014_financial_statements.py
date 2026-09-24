"""financial_statements table (raw line items for fraud/strength models)

Revision ID: 0014_financial_statements
Revises: 0013_index_bars
Create Date: 2026-07-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0014_financial_statements"
down_revision: Union[str, None] = "0013_index_bars"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_BIGINT_COLS = [
    "current_assets", "receivables", "ppe", "total_assets", "total_liabilities",
    "current_liabilities", "long_term_liabilities", "retained_earnings",
    "revenue", "gross_profit", "net_income", "operating_profit", "sga_expense",
    "operating_cashflow", "depreciation",
]


def upgrade() -> None:
    op.create_table(
        "financial_statements",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("symbol", sa.String(length=10),
                  sa.ForeignKey("stocks.symbol", ondelete="CASCADE"), nullable=False),
        sa.Column("period", sa.String(length=10), nullable=False),
        sa.Column("period_type", sa.String(length=10), nullable=False),
        *[sa.Column(c, sa.BigInteger()) for c in _BIGINT_COLS],
        sa.Column("source", sa.String(length=20), server_default="vci"),
        sa.Column("fields_available", sa.Integer(), server_default="0"),
        sa.Column("synced_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("symbol", "period", "period_type", name="uq_fin_stmt_period"),
    )
    op.create_index("ix_financial_statements_symbol", "financial_statements", ["symbol"])


def downgrade() -> None:
    op.drop_index("ix_financial_statements_symbol", table_name="financial_statements")
    op.drop_table("financial_statements")
