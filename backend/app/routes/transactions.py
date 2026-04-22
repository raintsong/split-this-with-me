from flask import Blueprint, jsonify, request
from flask_login import current_user
from .utils import jwt_or_login_required as login_required
from ..models import Transaction, TransactionSplit, Group
from .. import db
import datetime

transactions_bp = Blueprint("transactions", __name__)

# Common ISO 4217 currencies — extend as needed
SUPPORTED_CURRENCIES = [
    "USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "CNY",
    "HKD", "SGD", "MXN", "BRL", "INR", "KRW", "NOK", "SEK",
    "DKK", "NZD", "ZAR", "THB",
]


@transactions_bp.route("/currencies", methods=["GET"])
@login_required
def list_currencies():
    return jsonify(SUPPORTED_CURRENCIES)


@transactions_bp.route("/group/<int:group_id>", methods=["GET"])
@login_required
def list_transactions(group_id):
    group = Group.query.get_or_404(group_id)
    if current_user not in group.members:
        return jsonify({"error": "Forbidden"}), 403

    txs = Transaction.query.filter_by(group_id=group_id).order_by(Transaction.date.desc()).all()
    return jsonify([t.to_dict() for t in txs])


@transactions_bp.route("/group/<int:group_id>", methods=["POST"])
@login_required
def create_transaction(group_id):
    group = Group.query.get_or_404(group_id)
    if current_user not in group.members:
        return jsonify({"error": "Forbidden"}), 403

    data = request.get_json()

    # Validate required fields
    required = ["description", "amount", "currency", "splits"]
    for field in required:
        if field not in data:
            return jsonify({"error": f"Missing field: {field}"}), 400

    if data["currency"] not in SUPPORTED_CURRENCIES:
        return jsonify({"error": f"Unsupported currency: {data['currency']}"}), 400

    # Validate splits sum to total amount
    total_splits = sum(float(s["share_amount"]) for s in data["splits"])
    if abs(total_splits - float(data["amount"])) > 0.01:
        return jsonify({"error": "Splits must sum to the total amount"}), 400

    tx = Transaction(
        group_id=group_id,
        paid_by_id=data.get("paid_by_id", current_user.id),
        description=data["description"],
        amount=data["amount"],
        currency=data["currency"],
        date=datetime.date.fromisoformat(data["date"]) if "date" in data else datetime.date.today(),
    )
    db.session.add(tx)
    db.session.flush()  # Get tx.id before committing

    for split_data in data["splits"]:
        split = TransactionSplit(
            transaction_id=tx.id,
            user_id=split_data["user_id"],
            share_amount=split_data["share_amount"],
        )
        db.session.add(split)

    db.session.commit()
    return jsonify(tx.to_dict()), 201


@transactions_bp.route("/<int:tx_id>", methods=["DELETE"])
@login_required
def delete_transaction(tx_id):
    tx = Transaction.query.get_or_404(tx_id)
    group = Group.query.get(tx.group_id)

    if current_user not in group.members:
        return jsonify({"error": "Forbidden"}), 403

    db.session.delete(tx)
    db.session.commit()
    return jsonify({"message": "Deleted"})


@transactions_bp.route("/group/<int:group_id>/totals", methods=["GET"])
@login_required
def totals_by_currency(group_id):
    """Returns total spent per currency for a group."""
    group = Group.query.get_or_404(group_id)
    if current_user not in group.members:
        return jsonify({"error": "Forbidden"}), 403

    totals = {}
    for tx in group.transactions:
        totals.setdefault(tx.currency, 0)
        totals[tx.currency] += float(tx.amount)

    return jsonify(totals)