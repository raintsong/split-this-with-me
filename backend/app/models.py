from flask_login import UserMixin
from . import db, login_manager
import datetime


@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


# Association table for group membership
group_members = db.Table(
    "group_members",
    db.Column("user_id", db.Integer, db.ForeignKey("users.id"), primary_key=True),
    db.Column("group_id", db.Integer, db.ForeignKey("groups.id"), primary_key=True),
)


class User(UserMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False)
    display_name = db.Column(db.String(255), nullable=False)
    google_id = db.Column(db.String(255), unique=True, nullable=False)
    avatar_url = db.Column(db.String(512))
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    # Relationships
    groups = db.relationship("Group", secondary=group_members, back_populates="members")
    paid_transactions = db.relationship("Transaction", back_populates="paid_by")


class Group(db.Model):
    __tablename__ = "groups"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.String(512))
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    # Relationships
    members = db.relationship("User", secondary=group_members, back_populates="groups")
    transactions = db.relationship("Transaction", back_populates="group", cascade="all, delete-orphan")
    created_by = db.relationship("User", foreign_keys=[created_by_id])

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "created_at": self.created_at.isoformat(),
            "members": [{"id": m.id, "display_name": m.display_name, "email": m.email} for m in self.members],
        }


class Transaction(db.Model):
    __tablename__ = "transactions"

    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey("groups.id"), nullable=False)
    paid_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    description = db.Column(db.String(512), nullable=False)
    amount = db.Column(db.Numeric(12, 4), nullable=False)
    currency = db.Column(db.String(3), nullable=False, default="USD")  # ISO 4217
    is_settlement = db.Column(db.Boolean, nullable=False, default=False)
    is_hidden = db.Column(db.Boolean, nullable=False, default=False)
    date = db.Column(db.Date, default=datetime.date.today)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    # Relationships
    group = db.relationship("Group", back_populates="transactions")
    paid_by = db.relationship("User", back_populates="paid_transactions")
    splits = db.relationship("TransactionSplit", back_populates="transaction", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "group_id": self.group_id,
            "paid_by": {"id": self.paid_by.id, "display_name": self.paid_by.display_name},
            "description": self.description,
            "amount": str(self.amount),
            "currency": self.currency,
            "date": self.date.isoformat(),
            "is_settlement": self.is_settlement,
            "is_hidden": self.is_hidden,
            "splits": [s.to_dict() for s in self.splits],
        }


class TransactionSplit(db.Model):
    __tablename__ = "transaction_splits"

    id = db.Column(db.Integer, primary_key=True)
    transaction_id = db.Column(db.Integer, db.ForeignKey("transactions.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    share_amount = db.Column(db.Numeric(12, 4), nullable=False)

    transaction = db.relationship("Transaction", back_populates="splits")
    user = db.relationship("User")

    def to_dict(self):
        return {
            "user_id": self.user_id,
            "display_name": self.user.display_name,
            "share_amount": str(self.share_amount),
        }
