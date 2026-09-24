"""documents.source_url (provenance for auto-fetched BCTC)

Revision ID: 0008_document_source
Revises: 0007_metric_history
Create Date: 2026-07-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008_document_source"
down_revision: Union[str, None] = "0007_metric_history"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("source_url", sa.String(length=512), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "source_url")
