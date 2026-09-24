"""documents.consideration_summary ("Tóm tắt để cân nhắc")

Revision ID: 0009_consideration_summary
Revises: 0008_document_source
Create Date: 2026-07-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009_consideration_summary"
down_revision: Union[str, None] = "0008_document_source"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("consideration_summary", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "consideration_summary")
