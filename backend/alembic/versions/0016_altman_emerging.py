"""Add Altman Z'' emerging-markets columns to fraud_scores

Revision ID: 0016_altman_emerging
Revises: 0015_fraud_scores
Create Date: 2026-07-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0016_altman_emerging"
down_revision: Union[str, None] = "0015_fraud_scores"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("fraud_scores", sa.Column("altman_em_zscore", sa.Float()))
    op.add_column("fraud_scores", sa.Column("altman_em_zone", sa.String(length=20)))


def downgrade() -> None:
    op.drop_column("fraud_scores", "altman_em_zone")
    op.drop_column("fraud_scores", "altman_em_zscore")
