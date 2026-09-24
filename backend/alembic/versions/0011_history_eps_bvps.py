"""metric_history.eps + .bvps (per-year, derived from price/pe and price/pb)

Revision ID: 0011_history_eps_bvps
Revises: 0010_document_period
Create Date: 2026-07-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011_history_eps_bvps"
down_revision: Union[str, None] = "0010_document_period"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("metric_history", sa.Column("eps", sa.Float(), nullable=True))
    op.add_column("metric_history", sa.Column("bvps", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("metric_history", "bvps")
    op.drop_column("metric_history", "eps")
