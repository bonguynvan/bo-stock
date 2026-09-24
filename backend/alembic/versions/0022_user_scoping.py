"""Add nullable user_id scoping to the 8 personal tables (multi-tenancy)

Revision ID: 0022_user_scoping
Revises: 0021_users_waitlist
Create Date: 2026-08-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0022_user_scoping"
down_revision: Union[str, None] = "0021_users_waitlist"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Personal tables that gain a nullable, indexed user_id (no hard FK — mirrors 0016/0020).
_TABLES: tuple[str, ...] = (
    "watchlist",
    "saved_filters",
    "positions",
    "journal_entries",
    "notes",
    "playbook",
    "dashboard_layout",
    "alerts",
)


def upgrade() -> None:
    for table in _TABLES:
        op.add_column(table, sa.Column("user_id", sa.Integer(), nullable=True))
        op.create_index(f"ix_{table}_user_id", table, ["user_id"])


def downgrade() -> None:
    for table in reversed(_TABLES):
        op.drop_index(f"ix_{table}_user_id", table_name=table)
        op.drop_column(table, "user_id")
