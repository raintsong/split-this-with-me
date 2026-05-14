"""add is_admin to users

Revision ID: f1234567890a_add_is_admin_to_users
Revises: ebe67f1b19a0
Create Date: 2026-05-12 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f1234567890a_add_is_admin_to_users'
down_revision = 'ebe67f1b19a0'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('is_admin', sa.Boolean(), nullable=False, server_default='false'))


def downgrade():
    op.drop_column('users', 'is_admin')