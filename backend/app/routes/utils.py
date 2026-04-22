from functools import wraps
from flask import request, jsonify
from flask_login import current_user
from ..routes.auth import verify_token


def jwt_or_login_required(f):
    """
    Decorator that accepts either a JWT Bearer token (Authorization header)
    or a Flask-Login session cookie. JWT takes priority.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
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