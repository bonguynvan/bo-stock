"""journal_entries table

Revision ID: 0003_journal
Revises: 0002_watchlist
Create Date: 2026-06-29
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_journal"
down_revision: Union[str, None] = "0002_watchlist"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "journal_entries",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("symbol", sa.String(length=10), index=True),
        sa.Column("action", sa.String(length=10), nullable=False),
        sa.Column("thesis", sa.Text(), nullable=False),
        sa.Column("target_price", sa.Float()),
        sa.Column("catalyst", sa.Text()),
        sa.Column("price_at_entry", sa.Float()),
        sa.Column("status", sa.String(length=10), server_default="open"),
        sa.Column("review_note", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
    )


def downgrade() -> None:
    op.drop_table("journal_entries")
