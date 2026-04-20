from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from ..models import Group, User
from .. import db

groups_bp = Blueprint("groups", __name__)


@groups_bp.route("/", methods=["GET"])
@login_required
def list_groups():
    return jsonify([g.to_dict() for g in current_user.groups])


@groups_bp.route("/", methods=["POST"])
@login_required
def create_group():
    data = request.get_json()
    if not data or not data.get("name"):
        return jsonify({"error": "Name is required"}), 400

    group = Group(
        name=data["name"],
        description=data.get("description", ""),
        created_by_id=current_user.id,
    )
    group.members.append(current_user)

    # Add other members by email if provided
    for email in data.get("member_emails", []):
        member = User.query.filter_by(email=email).first()
        if member and member not in group.members:
            group.members.append(member)

    db.session.add(group)
    db.session.commit()
    return jsonify(group.to_dict()), 201


@groups_bp.route("/<int:group_id>", methods=["GET"])
@login_required
def get_group(group_id):
    group = Group.query.get_or_404(group_id)
    if current_user not in group.members:
        return jsonify({"error": "Forbidden"}), 403
    return jsonify(group.to_dict())


@groups_bp.route("/<int:group_id>", methods=["DELETE"])
@login_required
def delete_group(group_id):
    group = Group.query.get_or_404(group_id)
    if group.created_by_id != current_user.id:
        return jsonify({"error": "Only the group creator can delete it"}), 403
    db.session.delete(group)
    db.session.commit()
    return jsonify({"message": "Deleted"})


@groups_bp.route("/<int:group_id>/balances", methods=["GET"])
@login_required
def get_balances(group_id):
    """Returns net balance per user per currency within the group."""
    group = Group.query.get_or_404(group_id)
    if current_user not in group.members:
        return jsonify({"error": "Forbidden"}), 403

    # Build a balance map: {user_id: {currency: net_amount}}
    # Positive = owed money, Negative = owes money
    balances = {m.id: {"user": {"id": m.id, "display_name": m.display_name}, "currencies": {}} for m in group.members}

    for tx in group.transactions:
        currency = tx.currency
        payer_id = tx.paid_by_id

        for split in tx.splits:
            uid = split.user_id
            share = float(split.share_amount)

            if uid not in balances:
                continue

            # The person who split this owes their share
            balances[uid]["currencies"].setdefault(currency, 0)
            balances[uid]["currencies"][currency] -= share

            # The payer gets credited
            balances[payer_id]["currencies"].setdefault(currency, 0)
            balances[payer_id]["currencies"][currency] += share

    return jsonify(list(balances.values()))
