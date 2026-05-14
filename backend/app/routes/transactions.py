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


@transactions_bp.route("/admin/all", methods=["GET"])
@login_required
def admin_list_all_transactions():
    if not current_user.is_admin:
        return jsonify({"error": "Admin access required"}), 403
    txs = Transaction.query.order_by(Transaction.date.desc(), Transaction.created_at.desc()).all()
    return jsonify([t.to_dict() for t in txs])


@transactions_bp.route("/admin/group/<int:group_id>", methods=["GET"])
@login_required
def admin_list_group_transactions(group_id):
    if not current_user.is_admin:
        return jsonify({"error": "Admin access required"}), 403
    group = Group.query.get_or_404(group_id)
    txs = Transaction.query.filter_by(group_id=group_id).order_by(Transaction.date.desc(), Transaction.created_at.desc()).all()
    return jsonify([t.to_dict() for t in txs])


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
    if not current_user.is_admin and current_user not in group.members:
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
    if not current_user.is_admin and current_user not in group.members:
        return jsonify({"error": "Forbidden"}), 403

    data = request.get_json()
    required = ["payer_id", "payee_id", "amount", "currency"]
    for field in required:
        if field not in data:
            return jsonify({"error": f"Missing field: {field}"}), 400

    if data["currency"] not in SUPPORTED_CURRENCIES:
        return jsonify({"error": f"Unsupported currency: {data['currency']}"}), 400

    try:
        payer_id = int(data["payer_id"])
        payee_id = int(data["payee_id"])
    except (TypeError, ValueError):
        return jsonify({"error": "payer_id and payee_id must be valid user IDs"}), 400

    payer_user = next((m for m in group.members if m.id == payer_id), None)
    payee_user = next((m for m in group.members if m.id == payee_id), None)

    if not payer_user or not payee_user:
        return jsonify({
            "error": "Both users must be members of this group",
            "payer_id": payer_id,
            "payee_id": payee_id,
            "group_member_ids": [m.id for m in group.members],
        }), 400

    if payer_id == payee_id:
        return jsonify({"error": "Payer and receiver must be different users"}), 400

    amount = float(data["amount"])
    if amount <= 0:
        return jsonify({"error": "Amount must be greater than zero"}), 400

    # Check the requested settlement against current group balances in this currency.
    balances = {m.id: 0.0 for m in group.members}
    for t in group.transactions:
        if t.currency != data["currency"]:
            continue
        for s in t.splits:
            uid = s.user_id
            share = float(s.share_amount)
            if uid in balances:
                balances[uid] -= share
            if t.paid_by_id in balances:
                balances[t.paid_by_id] += share

    payer_balance = balances.get(payer_id, 0.0)
    payee_balance = balances.get(payee_id, 0.0)

    if payer_balance >= 0 or payee_balance <= 0:
        return jsonify({
            "error": "Selected payer/payee do not match current balances in this currency",
            "payer_balance": payer_balance,
            "payee_balance": payee_balance,
            "currency": data["currency"],
        }), 400

    max_amount = min(abs(payer_balance), payee_balance)
    if amount > max_amount + 0.01:
        return jsonify({
            "error": "Settlement amount exceeds the outstanding balance between these members",
            "max_amount": max_amount,
        }), 400

    tx = Transaction(
        group_id=group_id,
        paid_by_id=payer_id,
        description=f"Settlement: {payer_user.display_name} → {payee_user.display_name}",
        amount=amount,
        currency=data["currency"],
        is_settlement=True,
        date=datetime.date.today(),
    )
    db.session.add(tx)
    db.session.flush()

    # Payee receives the payment in the split, while the payer records zero share to move their balance.
    db.session.add(TransactionSplit(transaction_id=tx.id, user_id=payee_id, share_amount=amount))
    db.session.add(TransactionSplit(transaction_id=tx.id, user_id=payer_id, share_amount=0))

    db.session.commit()

    # Recompute the group's balances after this settlement.
    # If the entire group is now fully settled (all balances zero across all currencies), hide every transaction.
    group_balances = {m.id: {} for m in group.members}
    all_txs = Transaction.query.filter_by(group_id=group_id).all()

    for t in all_txs:
        currency = t.currency
        payer_id = t.paid_by_id
        for s in t.splits:
            uid = s.user_id
            share = float(s.share_amount)
            group_balances[uid].setdefault(currency, 0)
            group_balances[uid][currency] -= share
            group_balances[payer_id].setdefault(currency, 0)
            group_balances[payer_id][currency] += share

    fully_settled = all(
        all(abs(amount) < 0.01 for amount in user_balances.values())
        for user_balances in group_balances.values()
    )

    if fully_settled:
        for t in all_txs:
            t.is_hidden = True
        db.session.commit()
    else:
        # If only this settlement pair is now balanced in this currency, hide their related history.
        currency_val = data["currency"]
        payer_id = data["payer_id"]
        payee_id = data["payee_id"]

        balances = {payer_id: 0.0, payee_id: 0.0}
        for t in all_txs:
            if t.currency != currency_val:
                continue
            for s in t.splits:
                uid = s.user_id
                share = float(s.share_amount)
                if uid in balances:
                    balances[uid] -= share
                if t.paid_by_id in balances:
                    balances[t.paid_by_id] += share

        if abs(balances[payer_id]) < 0.01 and abs(balances[payee_id]) < 0.01:
            for t in all_txs:
                if t.currency == currency_val:
                    involved = {s.user_id for s in t.splits} | {t.paid_by_id}
                    if payer_id in involved and payee_id in involved:
                        t.is_hidden = True
            db.session.commit()

    return jsonify(tx.to_dict()), 201


@transactions_bp.route("/<int:tx_id>", methods=["PATCH"])
@login_required
def update_transaction(tx_id):
    tx = Transaction.query.get_or_404(tx_id)
    group = Group.query.get(tx.group_id)
    if current_user not in group.members:
        return jsonify({"error": "Forbidden"}), 403
    
    data = request.get_json()
    
    if "is_hidden" in data:
        tx.is_hidden = bool(data["is_hidden"])
    
    db.session.commit()
    return jsonify(tx.to_dict())


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