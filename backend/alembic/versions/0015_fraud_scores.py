"""fraud_scores table (Beneish/Altman/Piotroski per symbol)

Revision ID: 0015_fraud_scores
Revises: 0014_financial_statements
Create Date: 2026-07-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0015_fraud_scores"
down_revision: Union[str, None] = "0014_financial_statements"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "fraud_scores",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("symbol", sa.String(length=10),
                  sa.ForeignKey("stocks.symbol", ondelete="CASCADE"), nullable=False),
        sa.Column("period", sa.String(length=10), nullable=False),
        sa.Column("beneish_mscore", sa.Float()),
        sa.Column("beneish_variables_used", sa.Integer()),
        sa.Column("beneish_flag", sa.String(length=20)),
        sa.Column("altman_zscore", sa.Float()),
        sa.Column("altman_zone", sa.String(length=20)),
        sa.Column("piotroski_fscore", sa.Integer()),
        sa.Column("piotroski_detail", JSONB()),
        sa.Column("computed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("symbol", "period", name="uq_fraud_score_period"),
    )
    op.create_index("ix_fraud_scores_symbol", "fraud_scores", ["symbol"])


def downgrade() -> None:
    op.drop_index("ix_fraud_scores_symbol", table_name="fraud_scores")
    op.drop_table("fraud_scores")
