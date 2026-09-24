"""index_bars table (VN-Index & co daily bars)

Revision ID: 0013_index_bars
Revises: 0012_positions
Create Date: 2026-07-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013_index_bars"
down_revision: Union[str, None] = "0012_positions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "index_bars",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("symbol", sa.String(length=16), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("open", sa.Float()),
        sa.Column("high", sa.Float()),
        sa.Column("low", sa.Float()),
        sa.Column("close", sa.Float()),
        sa.Column("volume", sa.BigInteger()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("symbol", "date", name="uq_index_bar"),
    )
    op.create_index("ix_index_bars_symbol", "index_bars", ["symbol"])


def downgrade() -> None:
    op.drop_index("ix_index_bars_symbol", table_name="index_bars")
    op.drop_table("index_bars")
