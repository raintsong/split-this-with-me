"""Admin-only development utilities."""
from flask import Blueprint, jsonify, current_app
from flask_login import current_user
from .utils import jwt_or_login_required as login_required

admin_bp = Blueprint("admin", __name__)


@admin_bp.route("/seed", methods=["POST"])
@login_required
def admin_seed_data():
    """Seed the database with development data (dev only, admin only)."""
    if current_app.config.get("FLASK_ENV") != "development":
        return jsonify({"error": "Seeding is only available in development mode"}), 403
    
    if not current_user.is_admin:
        return jsonify({"error": "Admin access required"}), 403
    
    from .seed import seed_dev_data
    seed_dev_data()
    return jsonify({"message": "Database seeded with development data"})


@admin_bp.route("/stats", methods=["GET"])
@login_required
def admin_stats():
    """Get database statistics (dev only, admin only)."""
    if current_app.config.get("FLASK_ENV") != "development":
        return jsonify({"error": "Stats are only available in development mode"}), 403
    
    if not current_user.is_admin:
        return jsonify({"error": "Admin access required"}), 403
    
    from .models import User, Group, Transaction, TransactionSplit
    
    return jsonify({
        "users": User.query.count(),
        "groups": Group.query.count(),
        "transactions": Transaction.query.count(),
        "splits": TransactionSplit.query.count(),
    })
