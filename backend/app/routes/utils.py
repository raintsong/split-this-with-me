from functools import wraps
from flask import request, jsonify, current_app
from flask_login import current_user
from ..routes.auth import verify_token


def jwt_or_login_required(f):
    """
    Decorator that accepts either a JWT Bearer token (Authorization header)
    or a Flask-Login session cookie. JWT takes priority.
    
    In development mode, allows admin access with a special header.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        # Development admin bypass
        is_dev_mode = (
            current_app.config.get("FLASK_ENV") != "production"
            or current_app.debug
            or current_app.config.get("ENV") == "development"
        )
        if is_dev_mode:
            admin_token = request.headers.get("X-Admin-Token")
            if admin_token == current_app.config.get("ADMIN_TOKEN", "dev-admin-token"):
                # Create a mock admin user for development
                from ..models import User
                admin_user = User.query.filter_by(is_admin=True).first()
                if not admin_user:
                    # Create a development admin user if none exists
                    admin_user = User(
                        email="admin@dev.local",
                        display_name="Development Admin",
                        google_id="dev-admin-google-id",
                        is_admin=True
                    )
                    from .. import db
                    db.session.add(admin_user)
                    db.session.commit()
                from flask_login import login_user
                login_user(admin_user)
                return f(*args, **kwargs)

        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            user = verify_token(auth_header.split(" ", 1)[1])
            if not user:
                return jsonify({"error": "Invalid or expired token"}), 401
            # Inject user into Flask-Login's current_user proxy
            from flask_login import login_user
            login_user(user)
            return f(*args, **kwargs)

        if not current_user.is_authenticated:
            return jsonify({"error": "Unauthorized"}), 401

        return f(*args, **kwargs)
    return decorated