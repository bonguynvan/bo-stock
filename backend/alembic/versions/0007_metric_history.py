"""metric_history table (per-year ROE series)

Revision ID: 0007_metric_history
Revises: 0006_playbook
Create Date: 2026-07-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007_metric_history"
down_revision: Union[str, None] = "0006_playbook"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "metric_history",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "symbol",
            sa.String(length=10),
            sa.ForeignKey("stocks.symbol", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("roe", sa.Float()),
        sa.Column("roa", sa.Float()),
        sa.Column("net_margin", sa.Float()),
        sa.Column("gross_margin", sa.Float()),
        sa.Column("pe", sa.Float()),
        sa.Column("pb", sa.Float()),
        sa.Column("dividend_yield", sa.Float()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("symbol", "year", name="uq_metric_history_year"),
    )
    op.create_index("ix_metric_history_symbol", "metric_history", ["symbol"])


def downgrade() -> None:
    op.drop_index("ix_metric_history_symbol", table_name="metric_history")
    op.drop_table("metric_history")
