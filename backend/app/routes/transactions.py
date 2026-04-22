from flask import Blueprint, jsonify, request
from flask_login import current_user
from .utils import jwt_or_login_required as login_required
from ..models import Transaction, TransactionSplit, Group
from .. import db
import datetime

transactions_bp = Blueprint("transactions", __name__)

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
    txs = Transaction.query.filter_by(group_id=group_id).order_by(Transaction.date.desc(), Transaction.created_at.desc()).all()
    return jsonify([t.to_dict() for t in txs])


@transactions_bp.route("/group/<int:group_id>", methods=["POST"])
@login_required
def create_transaction(group_id):
    group = Group.query.get_or_404(group_id)
    if current_user not in group.members:
        return jsonify({"error": "Forbidden"}), 403

    data = request.get_json()

    required = ["description", "amount", "currency", "splits"]
    for field in required:
        if field not in data:
            return jsonify({"error": f"Missing field: {field}"}), 400

    if data["currency"] not in SUPPORTED_CURRENCIES:
        return jsonify({"error": f"Unsupported currency: {data['currency']}"}), 400

    total_splits = sum(float(s["share_amount"]) for s in data["splits"])
    if abs(total_splits - float(data["amount"])) > 0.01:
        return jsonify({"error": "Splits must sum to the total amount"}), 400

    tx = Transaction(
        group_id=group_id,
        paid_by_id=data.get("paid_by_id", current_user.id),
        description=data["description"],
        amount=data["amount"],
        currency=data["currency"],
        is_settlement=data.get("is_settlement", False),
        date=datetime.date.fromisoformat(data["date"]) if "date" in data else datetime.date.today(),
    )
    db.session.add(tx)
    db.session.flush()

    for split_data in data["splits"]:
        db.session.add(TransactionSplit(
            transaction_id=tx.id,
            user_id=split_data["user_id"],
            share_amount=split_data["share_amount"],
        ))

    db.session.commit()
    return jsonify(tx.to_dict()), 201


@transactions_bp.route("/group/<int:group_id>/settle", methods=["POST"])
@login_required
def settle(group_id):
    """
    Create a settlement transaction.
    The payer (who owes money) pays the payee (who is owed money) a specific amount
    in a specific currency, zeroing out that portion of the balance.
    """
    group = Group.query.get_or_404(group_id)
    if current_user not in group.members:
        return jsonify({"error": "Forbidden"}), 403

    data = request.get_json()
    required = ["payer_id", "payee_id", "amount", "currency"]
    for field in required:
        if field not in data:
            return jsonify({"error": f"Missing field: {field}"}), 400

    if data["currency"] not in SUPPORTED_CURRENCIES:
        return jsonify({"error": f"Unsupported currency: {data['currency']}"}), 400

    payer = Group.query.get(group_id)  # just to validate members below
    payer_user = next((m for m in group.members if m.id == data["payer_id"]), None)
    payee_user = next((m for m in group.members if m.id == data["payee_id"]), None)

    if not payer_user or not payee_user:
        return jsonify({"error": "Both users must be members of this group"}), 400

    amount = float(data["amount"])

    # Settlement: payer sends money to payee.
    # paid_by = payer (they are sending the money).
    # Payee holds the full split — this deducts from payee's positive balance
    # and credits the payer, netting both toward zero.
    tx = Transaction(
        group_id=group_id,
        paid_by_id=data["payer_id"],  # payer sent the money
        description=f"Settlement: {payer_user.display_name} → {payee_user.display_name}",
        amount=amount,
        currency=data["currency"],
        is_settlement=True,
        date=datetime.date.today(),
    )
    db.session.add(tx)
    db.session.flush()

    # Payee holds the full split — cancels their positive balance.
    # Payer gets credited as the one who paid, cancels their negative balance.
    db.session.add(TransactionSplit(transaction_id=tx.id, user_id=data["payee_id"], share_amount=amount))
    db.session.add(TransactionSplit(transaction_id=tx.id, user_id=data["payer_id"], share_amount=0))

    db.session.flush()

    # Check if this settlement zeros out the balance between payer and payee
    # in this currency. If so, mark all their transactions in this group/currency as hidden.
    currency_val = data["currency"]
    payer_id = data["payer_id"]
    payee_id = data["payee_id"]

    # Recompute balance between just these two people in this currency
    net = 0.0
    all_txs = Transaction.query.filter_by(group_id=group_id).all()
    for t in all_txs:
        if t.currency != currency_val:
            continue
        for s in t.splits:
            if s.user_id in (payer_id, payee_id):
                share = float(s.share_amount)
                if s.user_id == payee_id:
                    net -= share
                if t.paid_by_id == payee_id:
                    net += share
                if s.user_id == payer_id:
                    net += share
                if t.paid_by_id == payer_id:
                    net -= share

    # If net is effectively zero, hide all related transactions
    if abs(net) < 0.01:
        for t in all_txs:
            if t.currency == currency_val:
                involved = {s.user_id for s in t.splits} | {t.paid_by_id}
                if payer_id in involved or payee_id in involved:
                    t.is_hidden = True

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
    group = Group.query.get_or_404(group_id)
    if current_user not in group.members:
        return jsonify({"error": "Forbidden"}), 403
    totals = {}
    for tx in group.transactions:
        if not tx.is_settlement:
            totals.setdefault(tx.currency, 0)
            totals[tx.currency] += float(tx.amount)
    return jsonify(totals)