"""dashboard_layout table (single-row terminal HOME tile config)

Revision ID: 0017_dashboard_layout
Revises: 0016_altman_emerging
Create Date: 2026-07-29
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0017_dashboard_layout"
down_revision: Union[str, None] = "0016_altman_emerging"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dashboard_layout",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tiles", JSONB(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("dashboard_layout")
