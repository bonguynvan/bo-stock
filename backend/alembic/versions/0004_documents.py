"""documents table

Revision ID: 0004_documents
Revises: 0003_journal
Create Date: 2026-06-29
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_documents"
down_revision: Union[str, None] = "0003_journal"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "documents",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("symbol", sa.String(length=10), index=True),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("stored_path", sa.String(length=512), nullable=False),
        sa.Column("size_bytes", sa.BigInteger()),
        sa.Column("analysis", sa.JSON()),
        sa.Column("analysis_model", sa.String(length=60)),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("analyzed_at", sa.DateTime(timezone=True)),
    )


def downgrade() -> None:
    op.drop_table("documents")
