import os
from flask import Blueprint, redirect, url_for, session, current_app, jsonify
from flask_login import login_user, logout_user, current_user
from authlib.integrations.flask_client import OAuth
from ..models import User
from .. import db

auth_bp = Blueprint("auth", __name__)
oauth = OAuth()


def init_oauth(app):
    oauth.init_app(app)
    oauth.register(
        name="google",
        client_id=app.config["GOOGLE_CLIENT_ID"],
        client_secret=app.config["GOOGLE_CLIENT_SECRET"],
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )


@auth_bp.record_once
def on_load(state):
    init_oauth(state.app)


@auth_bp.route("/login")
def login():
    redirect_uri = url_for("auth.callback", _external=True)
    return oauth.google.authorize_redirect(redirect_uri)


@auth_bp.route("/callback")
def callback():
    token = oauth.google.authorize_access_token()
    userinfo = token.get("userinfo")

    if not userinfo:
        return jsonify({"error": "Failed to get user info from Google"}), 400

    # Find or create user
    user = User.query.filter_by(google_id=userinfo["sub"]).first()
    if not user:
        user = User(
            google_id=userinfo["sub"],
            email=userinfo["email"],
            display_name=userinfo.get("name", userinfo["email"]),
            avatar_url=userinfo.get("picture"),
        )
        db.session.add(user)
        db.session.commit()

    login_user(user)

    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173")
    return redirect(f"{frontend_url}/dashboard")


@auth_bp.route("/logout", methods=["POST"])
def logout():
    logout_user()
    return jsonify({"message": "Logged out"})


@auth_bp.route("/me")
def me():
    if not current_user.is_authenticated:
        return jsonify({"authenticated": False}), 401
    return jsonify({
        "authenticated": True,
        "user": {
            "id": current_user.id,
            "email": current_user.email,
            "display_name": current_user.display_name,
            "avatar_url": current_user.avatar_url,
        }
    })
