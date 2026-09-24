"""positions table (portfolio holdings)

Revision ID: 0012_positions
Revises: 0011_history_eps_bvps
Create Date: 2026-07-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0012_positions"
down_revision: Union[str, None] = "0011_history_eps_bvps"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "positions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("symbol", sa.String(length=10), nullable=False),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("avg_cost", sa.Float(), nullable=False),
        sa.Column("note", sa.Text()),
        sa.Column("opened_at", sa.Date()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_positions_symbol", "positions", ["symbol"])


def downgrade() -> None:
    op.drop_index("ix_positions_symbol", table_name="positions")
    op.drop_table("positions")
