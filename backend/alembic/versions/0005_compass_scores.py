"""compass_scores table

Revision ID: 0005_compass_scores
Revises: 0004_documents
Create Date: 2026-06-30
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_compass_scores"
down_revision: Union[str, None] = "0004_documents"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "compass_scores",
        sa.Column(
            "symbol",
            sa.String(length=10),
            sa.ForeignKey("stocks.symbol", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("short_score", sa.Float()),
        sa.Column("mid_score", sa.Float()),
        sa.Column("long_score", sa.Float()),
        sa.Column("computed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("compass_scores")
