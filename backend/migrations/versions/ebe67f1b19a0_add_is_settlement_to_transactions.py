"""add is_settlement to transactions

Revision ID: ebe67f1b19a0
Revises: b50be031c79e
Create Date: 2026-04-22 15:42:26.009139

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'ebe67f1b19a0'
down_revision = 'b50be031c79e'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('transactions', sa.Column('is_hidden', sa.Boolean(), nullable=False, server_default='false'))

def downgrade():
    op.drop_column('transactions', 'is_hidden')

    # ### end Alembic commands ###
