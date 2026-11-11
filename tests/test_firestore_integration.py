import json
import os
import time
import uuid
import pytest
from datetime import datetime, timezone
from pathlib import Path

from src.storage.firestore_client import (
    get_credential_path,
    get_firestore_client,
    is_firestore_available,
    check_firestore_health,
)
from src.storage import firestore_store
from scripts.migrate_sqlite_to_firestore import (
    test_disposable_records as run_disposable_records,
    get_sqlite_counts,
    backup_sqlite
)


@pytest.fixture(scope="module")
def firestore_ready():
    """Ensure Firestore credentials and connection are available before running tests."""
    if not is_firestore_available():
        pytest.skip("Firestore credentials or client not available in this environment.")
    health = check_firestore_health()
    if not health.get("connected"):
        pytest.skip(f"Firestore health check failed: {health.get('error')}")
    return True


def test_credential_path_discovery():
    """Verify that the credential path can be discovered from environment or registry."""
    cred_path = get_credential_path()
    assert cred_path is not None, "Credential path should be discovered"
    assert Path(cred_path).is_file(), f"Credential file must exist at {cred_path}"


def test_firestore_client_initialization(firestore_ready):
    """Verify that get_firestore_client returns a valid singleton client."""
    client1 = get_firestore_client()
    client2 = get_firestore_client()
    assert client1 is not None
    assert client1 is client2, "Firestore client should be a singleton instance"


def test_firestore_health_check(firestore_ready):
    """Verify check_firestore_health ping returns healthy status and measured latency."""
    health = check_firestore_health()
    assert health["status"] == "healthy"
    assert health["connected"] is True
    assert isinstance(health["latency_ms"], (int, float))
    assert health["latency_ms"] > 0
    assert health["project_id"] == "nexus-ai-support-8efec"


def test_disposable_crud_lifecycle(firestore_ready):
    """Verify complete CRUD lifecycle across Firestore collections using disposable records."""
    test_id = f"test_{int(time.time())}_{uuid.uuid4().hex[:6]}"
    test_conv_id = f"test_conv_{test_id}"
    test_session = f"test_sess_{test_id}"

    # 1. Register conversation owner
    registered = firestore_store.register_conversation_owner(test_conv_id, test_session)
    assert registered is True, "First registration should succeed"

    # Verify theft prevention
    stolen = firestore_store.register_conversation_owner(test_conv_id, "attacker_session")
    assert stolen is False, "Ownership cannot be stolen by another session"

    # Verify ownership check
    owner = firestore_store.get_conversation_owner(test_conv_id)
    assert owner == test_session

    auth, reason = firestore_store.verify_conversation_ownership(test_conv_id, test_session)
    assert auth is True
    assert reason == "owner"

    auth_wrong, reason_wrong = firestore_store.verify_conversation_ownership(test_conv_id, "wrong_token")
    assert auth_wrong is False
    assert reason_wrong == "forbidden"

    # 2. Save turn and get history
    user_msg = "Hello, this is a disposable test query."
    asst_msg = "Hello! This is a test response from Nexus AI."
    meta = {"intent": "test_verification", "sentiment": "positive", "confidence": 0.99}
    firestore_store.save_turn(test_conv_id, user_msg, asst_msg, meta, session_token=test_session)

    history = firestore_store.get_history(test_conv_id, session_token=test_session)
    assert history is not None
    assert len(history) >= 2
    assert history[-2]["role"] == "user"
    assert history[-2]["content"] == user_msg
    assert history[-1]["role"] == "assistant"
    assert history[-1]["content"] == asst_msg

    # 3. Rename conversation
    renamed = firestore_store.rename_conversation(test_conv_id, "Renamed Test Conversation", session_token=test_session)
    assert renamed is True

    # 4. Save feedback
    asst_msg_id = history[-1]["id"]
    feed_id = firestore_store.save_feedback(test_conv_id, asst_msg_id, "5_star", stars=5, comment="Excellent test!")
    assert feed_id is not None

    # 5. Save report
    rep_id = firestore_store.save_report(test_conv_id, asst_msg_id, "test_reason", details="Test report details")
    assert rep_id is not None

    # 6. Support ticket
    ticket = firestore_store.create_support_ticket(test_conv_id, test_session, "Test escalation", "Test User", "urgent")
    assert ticket["id"].startswith("TICK-")
    assert ticket["status"] == "open"

    t_details = firestore_store.get_ticket_details(ticket["id"])
    assert t_details is not None
    assert len(t_details.get("messages", [])) >= 1

    # 7. Knowledge FAQ
    faq = firestore_store.save_knowledge_faq(
        f"faq_{test_id}",
        "test_intent",
        "Test Category",
        "Test Question?",
        "Test Answer.",
        "test"
    )
    assert faq["id"] == f"faq_{test_id}"

    faq_list = firestore_store.list_knowledge_faqs(search="Test Question")
    assert faq_list["total"] >= 1

    deleted_faq = firestore_store.delete_knowledge_faq(f"faq_{test_id}")
    assert deleted_faq is True

    # 8. Clean up all conversation artifacts
    deleted_conv = firestore_store.delete_conversation(test_conv_id, session_token=test_session)
    assert deleted_conv is True

    # Verify conversation is gone
    post_owner = firestore_store.get_conversation_owner(test_conv_id)
    assert post_owner is None


def test_migration_disposable_records(firestore_ready):
    """Verify that the migration tool's disposable test passes for all 9 collections."""
    res = run_disposable_records()
    assert res["status"] == "success"
    for col, ok in res["verified_collections"].items():
        assert ok is True, f"Collection {col} failed verification"


def test_sqlite_backup_creation():
    """Verify that backup_sqlite creates a valid, timestamped backup copy without modifying original."""
    import gc
    root = Path(__file__).resolve().parents[1]
    db_path = root / "data" / "chat_history" / "chat_history.sqlite3"
    if not db_path.is_file():
        pytest.skip("SQLite database not found.")

    backup_file = backup_sqlite(db_path)
    try:
        assert backup_file.is_file()
        assert backup_file.stat().st_size == db_path.stat().st_size
        counts = get_sqlite_counts(backup_file)
        assert counts.get("messages", 0) > 0
    finally:
        # Cleanup the test backup file
        gc.collect()
        if backup_file.is_file():
            try:
                backup_file.unlink(missing_ok=True)
            except Exception:
                pass
