import pytest
from app import create_app, db
from app.models import User, Group, Transaction, TransactionSplit


@pytest.fixture
def app():
    """Create a fresh test app with an in-memory SQLite database."""
    app = create_app()
    app.config.update({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "SECRET_KEY": "test-secret-key",
        "GOOGLE_CLIENT_ID": "test-client-id",
        "GOOGLE_CLIENT_SECRET": "test-client-secret",
        "WTF_CSRF_ENABLED": False,
    })

    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def app_context(app):
    with app.app_context():
        yield app


# --- Reusable test data factories ---

def make_user(google_id, email, display_name):
    user = User(google_id=google_id, email=email, display_name=display_name)
    db.session.add(user)
    db.session.flush()
    return user


def make_group(name, creator):
    group = Group(name=name, created_by_id=creator.id)
    group.members.append(creator)
    db.session.add(group)
    db.session.flush()
    return group


def make_transaction(group, paid_by, description, amount, currency, splits):
    """
    splits: list of (user, share_amount) tuples
    """
    tx = Transaction(
        group_id=group.id,
        paid_by_id=paid_by.id,
        description=description,
        amount=amount,
        currency=currency,
    )
    db.session.add(tx)
    db.session.flush()

    for user, share in splits:
        db.session.add(TransactionSplit(
            transaction_id=tx.id,
            user_id=user.id,
            share_amount=share,
        ))

    db.session.commit()
    return tx