"""
Tests for transaction splitting and balance calculation logic.

Covers:
- Even splits between two or more people
- Uneven splits
- Multi-currency transactions
- Who paid affects balances correctly
- Multiple transactions accumulate correctly
- Settled state (balances net to zero)
"""

import pytest
from decimal import Decimal
from app import db
from app.models import Transaction, TransactionSplit
from app.routes.groups import get_balances as _get_balances_route
from tests.conftest import make_user, make_group, make_transaction


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def compute_balances(group):
    """
    Pure Python reimplementation of the balance logic from routes/groups.py
    so we can test it directly without HTTP.
    Returns: {user_id: {currency: net_amount}}
    Positive = owed money, Negative = owes money.
    """
    balances = {m.id: {} for m in group.members}

    for tx in group.transactions:
        currency = tx.currency
        payer_id = tx.paid_by_id

        for split in tx.splits:
            uid = split.user_id
            share = float(split.share_amount)

            balances[uid].setdefault(currency, 0)
            balances[uid][currency] -= share

            balances[payer_id].setdefault(currency, 0)
            balances[payer_id][currency] += share

    return balances


# ---------------------------------------------------------------------------
# Split validation tests
# ---------------------------------------------------------------------------

class TestSplitValidation:

    def test_splits_sum_to_total(self, app_context):
        alice = make_user("g1", "alice@example.com", "Alice")
        bob = make_user("g2", "bob@example.com", "Bob")
        group = make_group("Test", alice)
        group.members.append(bob)
        db.session.commit()

        tx = make_transaction(group, alice, "Dinner", 100.00, "USD", [
            (alice, 50.00),
            (bob, 50.00),
        ])

        total_splits = sum(float(s.share_amount) for s in tx.splits)
        assert abs(total_splits - float(tx.amount)) < 0.01

    def test_uneven_split_sums_to_total(self, app_context):
        alice = make_user("g1", "alice@example.com", "Alice")
        bob = make_user("g2", "bob@example.com", "Bob")
        group = make_group("Test", alice)
        group.members.append(bob)
        db.session.commit()

        tx = make_transaction(group, alice, "Groceries", 75.00, "USD", [
            (alice, 25.00),
            (bob, 50.00),
        ])

        total_splits = sum(float(s.share_amount) for s in tx.splits)
        assert abs(total_splits - 75.00) < 0.01

    def test_three_way_split(self, app_context):
        alice = make_user("g1", "alice@example.com", "Alice")
        bob = make_user("g2", "bob@example.com", "Bob")
        carol = make_user("g3", "carol@example.com", "Carol")
        group = make_group("Trip", alice)
        group.members.extend([bob, carol])
        db.session.commit()

        # $100 split three ways — note cents rounding
        tx = make_transaction(group, alice, "Hotel", 100.00, "USD", [
            (alice, 33.34),
            (bob, 33.33),
            (carol, 33.33),
        ])

        total_splits = sum(float(s.share_amount) for s in tx.splits)
        assert abs(total_splits - 100.00) < 0.01


# ---------------------------------------------------------------------------
# Balance calculation tests
# ---------------------------------------------------------------------------

class TestBalances:

    def test_even_split_payer_is_owed_half(self, app_context):
        """Alice pays $100, split evenly. Bob owes Alice $50."""
        alice = make_user("g1", "alice@example.com", "Alice")
        bob = make_user("g2", "bob@example.com", "Bob")
        group = make_group("Test", alice)
        group.members.append(bob)
        db.session.commit()

        make_transaction(group, alice, "Dinner", 100.00, "USD", [
            (alice, 50.00),
            (bob, 50.00),
        ])

        balances = compute_balances(group)
        assert abs(balances[alice.id]["USD"] - 50.00) < 0.01   # Alice is owed $50
        assert abs(balances[bob.id]["USD"] - (-50.00)) < 0.01  # Bob owes $50

    def test_payer_owes_nothing_to_themselves(self, app_context):
        """The payer's own share cancels out — they only show what others owe them."""
        alice = make_user("g1", "alice@example.com", "Alice")
        bob = make_user("g2", "bob@example.com", "Bob")
        group = make_group("Test", alice)
        group.members.append(bob)
        db.session.commit()

        # Alice pays $80, Bob owes $80 (Alice covers herself separately)
        make_transaction(group, alice, "Airbnb", 160.00, "USD", [
            (alice, 80.00),
            (bob, 80.00),
        ])

        balances = compute_balances(group)
        # Alice paid 160, her own share is 80, so she's net owed 80
        assert abs(balances[alice.id]["USD"] - 80.00) < 0.01
        assert abs(balances[bob.id]["USD"] - (-80.00)) < 0.01

    def test_multiple_transactions_accumulate(self, app_context):
        """Two transactions stack up correctly."""
        alice = make_user("g1", "alice@example.com", "Alice")
        bob = make_user("g2", "bob@example.com", "Bob")
        group = make_group("Test", alice)
        group.members.append(bob)
        db.session.commit()

        make_transaction(group, alice, "Dinner", 100.00, "USD", [
            (alice, 50.00), (bob, 50.00),
        ])
        make_transaction(group, alice, "Taxi", 40.00, "USD", [
            (alice, 20.00), (bob, 20.00),
        ])

        balances = compute_balances(group)
        assert abs(balances[alice.id]["USD"] - 70.00) < 0.01   # owed $50 + $20
        assert abs(balances[bob.id]["USD"] - (-70.00)) < 0.01  # owes $50 + $20

    def test_both_pay_reduces_balance(self, app_context):
        """If Bob also pays for something, it reduces what he owes Alice."""
        alice = make_user("g1", "alice@example.com", "Alice")
        bob = make_user("g2", "bob@example.com", "Bob")
        group = make_group("Test", alice)
        group.members.append(bob)
        db.session.commit()

        make_transaction(group, alice, "Dinner", 100.00, "USD", [
            (alice, 50.00), (bob, 50.00),
        ])
        make_transaction(group, bob, "Groceries", 60.00, "USD", [
            (alice, 30.00), (bob, 30.00),
        ])

        balances = compute_balances(group)
        # Alice is owed $50 from dinner, but owes $30 for groceries → net +$20
        assert abs(balances[alice.id]["USD"] - 20.00) < 0.01
        assert abs(balances[bob.id]["USD"] - (-20.00)) < 0.01

    def test_settled_balances_are_zero(self, app_context):
        """If Alice and Bob each pay equal amounts for the other, they're settled."""
        alice = make_user("g1", "alice@example.com", "Alice")
        bob = make_user("g2", "bob@example.com", "Bob")
        group = make_group("Test", alice)
        group.members.append(bob)
        db.session.commit()

        make_transaction(group, alice, "Dinner", 100.00, "USD", [
            (alice, 50.00), (bob, 50.00),
        ])
        make_transaction(group, bob, "Lunch", 100.00, "USD", [
            (alice, 50.00), (bob, 50.00),
        ])

        balances = compute_balances(group)
        assert abs(balances[alice.id].get("USD", 0)) < 0.01
        assert abs(balances[bob.id].get("USD", 0)) < 0.01

    def test_uneven_split_balances(self, app_context):
        """Uneven split produces correct per-person balances."""
        alice = make_user("g1", "alice@example.com", "Alice")
        bob = make_user("g2", "bob@example.com", "Bob")
        group = make_group("Test", alice)
        group.members.append(bob)
        db.session.commit()

        # Alice pays $90, Bob owes $60, Alice owes $30
        make_transaction(group, alice, "Concert", 90.00, "USD", [
            (alice, 30.00), (bob, 60.00),
        ])

        balances = compute_balances(group)
        assert abs(balances[alice.id]["USD"] - 60.00) < 0.01
        assert abs(balances[bob.id]["USD"] - (-60.00)) < 0.01


# ---------------------------------------------------------------------------
# Multi-currency tests
# ---------------------------------------------------------------------------

class TestMultiCurrency:

    def test_different_currencies_tracked_separately(self, app_context):
        """USD and JPY balances are kept in separate buckets."""
        alice = make_user("g1", "alice@example.com", "Alice")
        bob = make_user("g2", "bob@example.com", "Bob")
        group = make_group("Hawaii", alice)
        group.members.append(bob)
        db.session.commit()

        make_transaction(group, alice, "Hotel", 200.00, "USD", [
            (alice, 100.00), (bob, 100.00),
        ])
        make_transaction(group, alice, "Dinner", 3000, "JPY", [
            (alice, 1500), (bob, 1500),
        ])

        balances = compute_balances(group)
        assert abs(balances[alice.id]["USD"] - 100.00) < 0.01
        assert abs(balances[alice.id]["JPY"] - 1500) < 0.01
        assert abs(balances[bob.id]["USD"] - (-100.00)) < 0.01
        assert abs(balances[bob.id]["JPY"] - (-1500)) < 0.01

    def test_same_currency_transactions_combine(self, app_context):
        """Two USD transactions sum into one USD balance, not two entries."""
        alice = make_user("g1", "alice@example.com", "Alice")
        bob = make_user("g2", "bob@example.com", "Bob")
        group = make_group("Test", alice)
        group.members.append(bob)
        db.session.commit()

        make_transaction(group, alice, "Lunch", 40.00, "USD", [
            (alice, 20.00), (bob, 20.00),
        ])
        make_transaction(group, alice, "Coffee", 10.00, "USD", [
            (alice, 5.00), (bob, 5.00),
        ])

        balances = compute_balances(group)
        assert len(balances[alice.id]) == 1  # Only one currency key
        assert abs(balances[alice.id]["USD"] - 25.00) < 0.01

    def test_no_cross_currency_contamination(self, app_context):
        """A EUR transaction doesn't affect USD balances."""
        alice = make_user("g1", "alice@example.com", "Alice")
        bob = make_user("g2", "bob@example.com", "Bob")
        group = make_group("Europe Trip", alice)
        group.members.append(bob)
        db.session.commit()

        make_transaction(group, alice, "Museum", 30.00, "USD", [
            (alice, 15.00), (bob, 15.00),
        ])
        make_transaction(group, bob, "Train", 50.00, "EUR", [
            (alice, 25.00), (bob, 25.00),
        ])

        balances = compute_balances(group)
        assert "EUR" not in balances[alice.id] or abs(balances[alice.id].get("USD", 0) - 15.00) < 0.01
        assert abs(balances[alice.id]["USD"] - 15.00) < 0.01
        assert abs(balances[alice.id]["EUR"] - (-25.00)) < 0.01


# ---------------------------------------------------------------------------
# Group isolation tests
# ---------------------------------------------------------------------------

class TestGroupIsolation:

    def test_transactions_dont_leak_between_groups(self, app_context):
        """A transaction in one group doesn't affect balances in another."""
        alice = make_user("g1", "alice@example.com", "Alice")
        bob = make_user("g2", "bob@example.com", "Bob")

        hawaii = make_group("Hawaii", alice)
        hawaii.members.append(bob)
        general = make_group("General", alice)
        general.members.append(bob)
        db.session.commit()

        make_transaction(hawaii, alice, "Hotel", 200.00, "USD", [
            (alice, 100.00), (bob, 100.00),
        ])

        hawaii_balances = compute_balances(hawaii)
        general_balances = compute_balances(general)

        assert abs(hawaii_balances[alice.id]["USD"] - 100.00) < 0.01
        assert general_balances[alice.id] == {}  # No transactions in general

    def test_same_users_independent_balances_per_group(self, app_context):
        """Alice and Bob can have different balances in different groups."""
        alice = make_user("g1", "alice@example.com", "Alice")
        bob = make_user("g2", "bob@example.com", "Bob")

        hawaii = make_group("Hawaii", alice)
        hawaii.members.append(bob)
        general = make_group("General", alice)
        general.members.append(bob)
        db.session.commit()

        make_transaction(hawaii, alice, "Hotel", 100.00, "USD", [
            (alice, 50.00), (bob, 50.00),
        ])
        make_transaction(general, bob, "Groceries", 60.00, "USD", [
            (alice, 30.00), (bob, 30.00),
        ])

        hawaii_balances = compute_balances(hawaii)
        general_balances = compute_balances(general)

        assert abs(hawaii_balances[alice.id]["USD"] - 50.00) < 0.01
        assert abs(general_balances[alice.id]["USD"] - (-30.00)) < 0.01