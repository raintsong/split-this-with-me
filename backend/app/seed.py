"""Development data seeding script."""
import datetime
from . import db
from .models import User, Group, Transaction, TransactionSplit, group_members


def seed_dev_data():
    """Create development test data."""
    
    # Clear existing data, including association rows that bulk deletes do not cascade.
    db.session.execute(group_members.delete())
    db.session.query(TransactionSplit).delete()
    db.session.query(Transaction).delete()
    db.session.query(Group).delete()
    db.session.query(User).delete()
    db.session.commit()
    
    # Create test users
    users = [
        User(
            email="alice@example.com",
            display_name="Alice",
            google_id="alice-google-id",
            avatar_url="https://i.pravatar.cc/150?img=1"
        ),
        User(
            email="bob@example.com",
            display_name="Bob",
            google_id="bob-google-id",
            avatar_url="https://i.pravatar.cc/150?img=2"
        ),
        User(
            email="charlie@example.com",
            display_name="Charlie",
            google_id="charlie-google-id",
            avatar_url="https://i.pravatar.cc/150?img=3"
        ),
        User(
            email="diana@example.com",
            display_name="Diana",
            google_id="diana-google-id",
            avatar_url="https://i.pravatar.cc/150?img=4"
        ),
    ]
    db.session.add_all(users)
    db.session.flush()
    
    # Create test groups
    trip_group = Group(
        name="Hawaii Trip",
        description="Summer vacation to Hawaii",
        created_by_id=users[0].id
    )
    trip_group.members.extend([users[0], users[1], users[2]])
    
    house_group = Group(
        name="House Expenses",
        description="Shared rent and utilities",
        created_by_id=users[0].id
    )
    house_group.members.extend([users[0], users[1], users[3]])
    
    dinner_group = Group(
        name="Dinner Night",
        description="Restaurant and bar expenses",
        created_by_id=users[2].id
    )
    dinner_group.members.extend([users[0], users[1], users[2], users[3]])
    
    db.session.add_all([trip_group, house_group, dinner_group])
    db.session.flush()
    
    # Create transactions for Hawaii trip
    tx1 = Transaction(
        group_id=trip_group.id,
        paid_by_id=users[0].id,
        description="Flight tickets",
        amount=1200.00,
        currency="USD",
        date=datetime.date(2026, 5, 1)
    )
    db.session.add(tx1)
    db.session.flush()
    db.session.add_all([
        TransactionSplit(transaction_id=tx1.id, user_id=users[0].id, share_amount=400),
        TransactionSplit(transaction_id=tx1.id, user_id=users[1].id, share_amount=400),
        TransactionSplit(transaction_id=tx1.id, user_id=users[2].id, share_amount=400),
    ])
    
    tx2 = Transaction(
        group_id=trip_group.id,
        paid_by_id=users[1].id,
        description="Hotel (3 nights)",
        amount=900.00,
        currency="USD",
        date=datetime.date(2026, 5, 2)
    )
    db.session.add(tx2)
    db.session.flush()
    db.session.add_all([
        TransactionSplit(transaction_id=tx2.id, user_id=users[0].id, share_amount=300),
        TransactionSplit(transaction_id=tx2.id, user_id=users[1].id, share_amount=300),
        TransactionSplit(transaction_id=tx2.id, user_id=users[2].id, share_amount=300),
    ])
    
    tx3 = Transaction(
        group_id=trip_group.id,
        paid_by_id=users[2].id,
        description="Car rental",
        amount=600.00,
        currency="USD",
        date=datetime.date(2026, 5, 3)
    )
    db.session.add(tx3)
    db.session.flush()
    db.session.add_all([
        TransactionSplit(transaction_id=tx3.id, user_id=users[0].id, share_amount=200),
        TransactionSplit(transaction_id=tx3.id, user_id=users[1].id, share_amount=200),
        TransactionSplit(transaction_id=tx3.id, user_id=users[2].id, share_amount=200),
    ])
    
    # Create transactions for house expenses
    tx4 = Transaction(
        group_id=house_group.id,
        paid_by_id=users[0].id,
        description="May rent",
        amount=1500.00,
        currency="USD",
        date=datetime.date(2026, 5, 1)
    )
    db.session.add(tx4)
    db.session.flush()
    db.session.add_all([
        TransactionSplit(transaction_id=tx4.id, user_id=users[0].id, share_amount=750),
        TransactionSplit(transaction_id=tx4.id, user_id=users[1].id, share_amount=450),
        TransactionSplit(transaction_id=tx4.id, user_id=users[3].id, share_amount=300),
    ])
    
    tx5 = Transaction(
        group_id=house_group.id,
        paid_by_id=users[1].id,
        description="Electricity bill",
        amount=120.00,
        currency="USD",
        date=datetime.date(2026, 5, 5)
    )
    db.session.add(tx5)
    db.session.flush()
    db.session.add_all([
        TransactionSplit(transaction_id=tx5.id, user_id=users[0].id, share_amount=60),
        TransactionSplit(transaction_id=tx5.id, user_id=users[1].id, share_amount=40),
        TransactionSplit(transaction_id=tx5.id, user_id=users[3].id, share_amount=20),
    ])
    
    # Create transactions for dinner
    tx6 = Transaction(
        group_id=dinner_group.id,
        paid_by_id=users[0].id,
        description="Italian restaurant",
        amount=84.50,
        currency="USD",
        date=datetime.date(2026, 5, 10)
    )
    db.session.add(tx6)
    db.session.flush()
    db.session.add_all([
        TransactionSplit(transaction_id=tx6.id, user_id=users[0].id, share_amount=21.13),
        TransactionSplit(transaction_id=tx6.id, user_id=users[1].id, share_amount=21.13),
        TransactionSplit(transaction_id=tx6.id, user_id=users[2].id, share_amount=21.12),
        TransactionSplit(transaction_id=tx6.id, user_id=users[3].id, share_amount=21.12),
    ])
    
    tx7 = Transaction(
        group_id=dinner_group.id,
        paid_by_id=users[3].id,
        description="Cocktails",
        amount=52.00,
        currency="USD",
        date=datetime.date(2026, 5, 10)
    )
    db.session.add(tx7)
    db.session.flush()
    db.session.add_all([
        TransactionSplit(transaction_id=tx7.id, user_id=users[0].id, share_amount=13),
        TransactionSplit(transaction_id=tx7.id, user_id=users[1].id, share_amount=13),
        TransactionSplit(transaction_id=tx7.id, user_id=users[2].id, share_amount=13),
        TransactionSplit(transaction_id=tx7.id, user_id=users[3].id, share_amount=13),
    ])
    
    # Multi-currency transaction
    tx8 = Transaction(
        group_id=dinner_group.id,
        paid_by_id=users[1].id,
        description="European dinner",
        amount=75.00,
        currency="EUR",
        date=datetime.date(2026, 5, 12)
    )
    db.session.add(tx8)
    db.session.flush()
    db.session.add_all([
        TransactionSplit(transaction_id=tx8.id, user_id=users[0].id, share_amount=18.75),
        TransactionSplit(transaction_id=tx8.id, user_id=users[1].id, share_amount=18.75),
        TransactionSplit(transaction_id=tx8.id, user_id=users[2].id, share_amount=18.75),
        TransactionSplit(transaction_id=tx8.id, user_id=users[3].id, share_amount=18.75),
    ])
    
    db.session.commit()
    print("✅ Development data seeded successfully!")
    print(f"  - {len(users)} users created")
    print(f"  - {Group.query.count()} groups created")
    print(f"  - {Transaction.query.count()} transactions created")
    print("\nTest user credentials:")
    for user in users:
        print(f"  • {user.display_name}: {user.email}")
