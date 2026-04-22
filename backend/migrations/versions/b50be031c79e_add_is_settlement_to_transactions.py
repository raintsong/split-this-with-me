from alembic import op
import sqlalchemy as sa

revision = 'b50be031c79e'
down_revision = 'd5a950f03ad3'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('transactions', sa.Column('is_settlement', sa.Boolean(), nullable=False, server_default='false'))


def downgrade():
    op.drop_column('transactions', 'is_settlement')