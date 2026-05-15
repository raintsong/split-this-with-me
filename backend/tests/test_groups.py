import json
from app import db
from app.models import User, Group
from app.routes.auth import generate_token
from tests.conftest import make_user, make_group


def test_list_groups_returns_memberships(app_context, client):
    alice = make_user("g1", "alice@example.com", "Alice")
    bob = make_user("g2", "bob@example.com", "Bob")
    group_a = make_group("Group A", alice)
    group_a.members.append(bob)
    group_b = make_group("Group B", bob)
    db.session.commit()

    token = generate_token(alice)
    response = client.get(
        "/api/groups/",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    data = response.get_json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["id"] == group_a.id
    assert data[0]["name"] == "Group A"
    assert all(member["id"] in {alice.id, bob.id} for member in data[0]["members"])


def test_list_groups_requires_authentication(client):
    response = client.get("/api/groups/")
    assert response.status_code == 401
    assert response.get_json()["error"] == "Unauthorized"
