import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_login import LoginManager
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

db = SQLAlchemy()
migrate = Migrate()
login_manager = LoginManager()


def create_app():
    app = Flask(__name__)

    # Core config
    app.config["SECRET_KEY"] = os.environ["SECRET_KEY"]
    app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("DATABASE_URL", "sqlite:///dev.db")
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    # Google OAuth config
    app.config["GOOGLE_CLIENT_ID"] = os.environ["GOOGLE_CLIENT_ID"]
    app.config["GOOGLE_CLIENT_SECRET"] = os.environ["GOOGLE_CLIENT_SECRET"]

    # Allow session cookies to work cross-origin in development
    is_production = os.environ.get("FLASK_ENV") == "production"

    app.config["SESSION_COOKIE_SAMESITE"] = "None" if is_production else "Lax"
    app.config["SESSION_COOKIE_SECURE"] = is_production
    app.config["SESSION_COOKIE_HTTPONLY"] = True


    # CORS — only allow requests from your frontend
    CORS(app, supports_credentials=True, origins=[os.environ.get("FRONTEND_URL", "http://localhost:5173")])

    # Init extensions
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)

    # Register blueprints
    from .routes.auth import auth_bp
    from .routes.groups import groups_bp
    from .routes.transactions import transactions_bp

    app.register_blueprint(auth_bp, url_prefix="/auth")
    app.register_blueprint(groups_bp, url_prefix="/api/groups")
    app.register_blueprint(transactions_bp, url_prefix="/api/transactions")

    return app
