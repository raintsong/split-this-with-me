from flask import Blueprint, jsonify, request
from flask_login import current_user
from .utils import jwt_or_login_required as login_required
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


@groups_bp.route("/<int:group_id>/members", methods=["POST"])
@login_required
def add_member(group_id):
    """Add a user to a group by user_id or email."""
    group = Group.query.get_or_404(group_id)
    if current_user not in group.members:
        return jsonify({"error": "Forbidden"}), 403

    data = request.get_json()
    user = None

    if data.get("user_id"):
        user = User.query.get(data["user_id"])
    elif data.get("email"):
        user = User.query.filter_by(email=data["email"]).first()

    if not user:
        return jsonify({"error": "User not found"}), 404
    if user in group.members:
        return jsonify({"error": "User is already a member"}), 400

    group.members.append(user)
    db.session.commit()
    return jsonify(group.to_dict())


@groups_bp.route("/<int:group_id>/members/<int:user_id>", methods=["DELETE"])
@login_required
def remove_member(group_id, user_id):
    """Remove a user from a group. Only the creator can remove others."""
    group = Group.query.get_or_404(group_id)
    if current_user not in group.members:
        return jsonify({"error": "Forbidden"}), 403
    if current_user.id != group.created_by_id and current_user.id != user_id:
        return jsonify({"error": "Only the group creator can remove others"}), 403

    user = User.query.get_or_404(user_id)
    if user.id == group.created_by_id:
        return jsonify({"error": "Cannot remove the group creator"}), 400
    if user not in group.members:
        return jsonify({"error": "User is not a member"}), 400

    group.members.remove(user)
    db.session.commit()
    return jsonify(group.to_dict())


@groups_bp.route("/users/search", methods=["GET"])
@login_required
def search_users():
    """Search all registered users by name or email. Used for adding members."""
    q = request.args.get("q", "").strip()
    if len(q) < 2:
        return jsonify([])

    users = User.query.filter(
        (User.display_name.ilike(f"%{q}%")) | (User.email.ilike(f"%{q}%"))
    ).limit(10).all()

    return jsonify([
        {"id": u.id, "display_name": u.display_name, "email": u.email}
        for u in users
        if u.id != current_user.id  # Don't return yourself
    ])


@groups_bp.route("/<int:group_id>/balances", methods=["GET"])
@login_required
def get_balances(group_id):
    """Returns net balance per user per currency within the group."""
    group = Group.query.get_or_404(group_id)
    if current_user not in group.members:
        return jsonify({"error": "Forbidden"}), 403

    balances = {m.id: {"user": {"id": m.id, "display_name": m.display_name}, "currencies": {}} for m in group.members}

    for tx in group.transactions:
        currency = tx.currency
        payer_id = tx.paid_by_id

        for split in tx.splits:
            uid = split.user_id
            share = float(split.share_amount)

            if uid not in balances:
                continue

            balances[uid]["currencies"].setdefault(currency, 0)
            balances[uid]["currencies"][currency] -= share

            balances[payer_id]["currencies"].setdefault(currency, 0)
            balances[payer_id]["currencies"][currency] += share

    return jsonify(list(balances.values()))