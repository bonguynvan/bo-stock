"""notes table (free-form per-symbol research notes)

Revision ID: 0019_notes
Revises: 0018_alerts
Create Date: 2026-07-30
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0019_notes"
down_revision: Union[str, None] = "0018_alerts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("symbol", sa.String(length=10)),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_notes_symbol", "notes", ["symbol"])


def downgrade() -> None:
    op.drop_index("ix_notes_symbol", table_name="notes")
    op.drop_table("notes")
