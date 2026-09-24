"""documents.report_period (annual / quarterly / interim)

Revision ID: 0010_document_period
Revises: 0009_consideration_summary
Create Date: 2026-07-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010_document_period"
down_revision: Union[str, None] = "0009_consideration_summary"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("report_period", sa.String(length=12), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "report_period")
