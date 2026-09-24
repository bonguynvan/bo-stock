"""Add Quality-of-Earnings columns to fraud_scores

Revision ID: 0020_earnings_quality
Revises: 0019_notes
Create Date: 2026-08-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0020_earnings_quality"
down_revision: Union[str, None] = "0019_notes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("fraud_scores", sa.Column("earnings_quality_score", sa.Float()))
    op.add_column("fraud_scores", sa.Column("earnings_quality_flag", sa.String(length=20)))
    op.add_column("fraud_scores", sa.Column("earnings_quality_detail", JSONB()))


def downgrade() -> None:
    op.drop_column("fraud_scores", "earnings_quality_detail")
    op.drop_column("fraud_scores", "earnings_quality_flag")
    op.drop_column("fraud_scores", "earnings_quality_score")
