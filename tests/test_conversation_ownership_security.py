import uuid
import pytest
from app.app import create_app
from src.storage.chat_store import (
    register_conversation_owner,
    get_conversation_owner,
    verify_conversation_ownership,
    save_turn,
    get_history,
    delete_conversation,
)


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


@pytest.fixture
def session_a():
    return f"cust_sess_{uuid.uuid4().hex}"


@pytest.fixture
def session_b():
    return f"cust_sess_{uuid.uuid4().hex}"


def test_anonymous_customer_auto_session_token(client):
    """Anonymous customer without session token receives a fresh session token automatically."""
    resp = client.post(
        "/api/chat",
        json={"message": "What is the fee for card replacement?"},
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert "session_token" in data
    assert data["session_token"].startswith("cust_sess_")
    assert resp.headers.get("X-Customer-Session-Token") == data["session_token"]


def test_customer_owns_created_conversation(client, session_a):
    """Customer A creates a conversation and server-side ownership is registered."""
    resp = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_a},
        json={"message": "How do I activate my new card?"},
    )
    assert resp.status_code == 200
    conv_id = resp.get_json()["conversation_id"]

    owner = get_conversation_owner(conv_id)
    assert owner == session_a


def test_cross_customer_history_forbidden(client, session_a, session_b):
    """Customer B cannot view Customer A's conversation history."""
    # Customer A creates conversation
    create_resp = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_a},
        json={"message": "Can I transfer money internationally?"},
    )
    assert create_resp.status_code == 200
    conv_id = create_resp.get_json()["conversation_id"]

    # Customer B attempts to read Customer A's history
    tamper_resp = client.get(
        f"/api/chat/{conv_id}/history",
        headers={"X-Customer-Session-Token": session_b},
    )
    assert tamper_resp.status_code == 403
    err_data = tamper_resp.get_json()
    assert "Forbidden" in err_data.get("error", "")

    # Customer A can read their own history
    owner_resp = client.get(
        f"/api/chat/{conv_id}/history",
        headers={"X-Customer-Session-Token": session_a},
    )
    assert owner_resp.status_code == 200
    assert len(owner_resp.get_json()["messages"]) >= 2


def test_cross_customer_chat_continuation_hijacking_blocked(client, session_a, session_b):
    """Customer B cannot inject messages into Customer A's conversation ID."""
    # Customer A starts conversation
    resp_a = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_a},
        json={"message": "I lost my debit card"},
    )
    conv_id = resp_a.get_json()["conversation_id"]

    # Customer B attempts to append message to conv_id
    tamper_resp = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_b},
        json={
            "conversation_id": conv_id,
            "message": "Malicious injected message trying to hijack session",
        },
    )
    assert tamper_resp.status_code == 403
    assert "Forbidden" in tamper_resp.get_json().get("error", "")

    # Verify Customer A's conversation history does NOT contain the injected message
    hist = get_history(conv_id, session_token=session_a)
    assert hist is not None
    contents = [m["content"] for m in hist]
    assert not any("Malicious injected" in c for c in contents)


def test_cross_customer_delete_blocked(client, session_a, session_b):
    """Customer B cannot delete Customer A's conversation."""
    resp_a = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_a},
        json={"message": "Account balance inquiry"},
    )
    conv_id = resp_a.get_json()["conversation_id"]

    # Customer B attempts to delete Customer A's conversation
    del_resp = client.delete(
        f"/api/chat/{conv_id}",
        headers={"X-Customer-Session-Token": session_b},
    )
    assert del_resp.status_code == 403
    assert "Forbidden" in del_resp.get_json().get("error", "")

    # Customer A's conversation must still exist
    owner = get_conversation_owner(conv_id)
    assert owner == session_a


def test_cross_customer_feedback_blocked(client, session_a, session_b):
    """Customer B cannot submit feedback on Customer A's conversation."""
    resp_a = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_a},
        json={"message": "Checking branch opening hours"},
    )
    data = resp_a.get_json()
    conv_id = data["conversation_id"]
    msg_id = data["message_id"]

    # Customer B attempts feedback submission
    feedback_resp = client.post(
        "/api/chat/feedback",
        headers={"X-Customer-Session-Token": session_b},
        json={
            "conversation_id": conv_id,
            "message_id": msg_id,
            "stars": 1,
            "comment": "Unauthorized negative feedback",
        },
    )
    assert feedback_resp.status_code == 403
    assert "Forbidden" in feedback_resp.get_json().get("error", "")


def test_cross_customer_report_blocked(client, session_a, session_b):
    """Customer B cannot report responses for Customer A's conversation."""
    resp_a = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_a},
        json={"message": "Need help with mobile PIN"},
    )
    conv_id = resp_a.get_json()["conversation_id"]

    report_resp = client.post(
        "/api/chat/report",
        headers={"X-Customer-Session-Token": session_b},
        json={
            "conversation_id": conv_id,
            "reason": "inaccurate",
            "details": "Unauthorized report attempt",
        },
    )
    assert report_resp.status_code == 403
    assert "Forbidden" in report_resp.get_json().get("error", "")


def test_conversations_list_scoped_to_session(client, session_a, session_b):
    """Conversation list queries strictly isolate Customer A from Customer B."""
    # Create two conversations for session A
    c1 = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_a},
        json={"message": "Session A inquiry 1"},
    ).get_json()["conversation_id"]

    c2 = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_a},
        json={"message": "Session A inquiry 2"},
    ).get_json()["conversation_id"]

    # Create one conversation for session B
    c3 = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_b},
        json={"message": "Session B inquiry 1"},
    ).get_json()["conversation_id"]

    # List conversations for session A
    list_a = client.get(
        "/api/chat/conversations",
        headers={"X-Customer-Session-Token": session_a},
    ).get_json()

    a_ids = [c["conversation_id"] for c in list_a["conversations"]]
    assert c1 in a_ids
    assert c2 in a_ids
    assert c3 not in a_ids

    # List conversations for session B
    list_b = client.get(
        "/api/chat/conversations",
        headers={"X-Customer-Session-Token": session_b},
    ).get_json()

    b_ids = [c["conversation_id"] for c in list_b["conversations"]]
    assert c3 in b_ids
    assert c1 not in b_ids
    assert c2 not in b_ids


def test_localstorage_id_tampering_ignored(client, session_a, session_b):
    """Passing another customer's conversation IDs in the request body is ignored."""
    resp_a = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_a},
        json={"message": "Confidential customer inquiry"},
    )
    conv_a = resp_a.get_json()["conversation_id"]

    # Customer B attempts to enumerate Customer A's conversation by passing conversation_ids
    tamper_list = client.post(
        "/api/chat/conversations",
        headers={"X-Customer-Session-Token": session_b},
        json={"conversation_ids": [conv_a]},
    )
    assert tamper_list.status_code == 200
    returned_ids = [c["conversation_id"] for c in tamper_list.get_json()["conversations"]]
    assert conv_a not in returned_ids


def test_role_header_spoofing_blocked(client, session_a, session_b):
    """Spoofing 'X-Client-Role: admin' without a valid admin key does NOT grant access."""
    resp_a = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_a},
        json={"message": "Private session data"},
    )
    conv_a = resp_a.get_json()["conversation_id"]

    # Customer B sets 'X-Client-Role: admin' without X-Admin-Key
    spoofed_resp = client.get(
        f"/api/chat/{conv_a}/history",
        headers={
            "X-Customer-Session-Token": session_b,
            "X-Client-Role": "admin",
        },
    )
    assert spoofed_resp.status_code == 403


def test_verified_admin_audit_access(client, session_a):
    """Admin with valid X-Admin-Key can inspect conversation for support oversight."""
    resp_a = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_a},
        json={"message": "Support oversight verification"},
    )
    conv_a = resp_a.get_json()["conversation_id"]

    # Admin request with correct admin key
    admin_resp = client.get(
        f"/api/chat/{conv_a}/history",
        headers={
            "X-Admin-Key": "nexus-admin-secret-2026",
            "X-Client-Role": "admin",
        },
    )
    assert admin_resp.status_code == 200
    assert admin_resp.get_json()["conversation_id"] == conv_a


def test_legitimate_customer_lifecycle(client, session_a):
    """Customer A can create, continue, view, search, and delete their own conversation."""
    # 1. Create
    res1 = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_a},
        json={"message": "First message in thread"},
    )
    assert res1.status_code == 200
    conv_id = res1.get_json()["conversation_id"]

    # 2. Continue same thread
    res2 = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_a},
        json={"conversation_id": conv_id, "message": "Followup message in same thread"},
    )
    assert res2.status_code == 200
    assert res2.get_json()["conversation_id"] == conv_id

    # 3. View history
    hist = client.get(
        f"/api/chat/{conv_id}/history",
        headers={"X-Customer-Session-Token": session_a},
    )
    assert hist.status_code == 200
    assert len(hist.get_json()["messages"]) >= 4

    # 4. Search
    search_res = client.get(
        f"/api/chat/conversations?search=First",
        headers={"X-Customer-Session-Token": session_a},
    )
    assert search_res.status_code == 200
    assert any(c["conversation_id"] == conv_id for c in search_res.get_json()["conversations"])

    # 5. Delete
    del_res = client.delete(
        f"/api/chat/{conv_id}",
        headers={"X-Customer-Session-Token": session_a},
    )
    assert del_res.status_code == 200

    # 6. History after delete should be 404
    hist_after = client.get(
        f"/api/chat/{conv_id}/history",
        headers={"X-Customer-Session-Token": session_a},
    )
    assert hist_after.status_code == 404


def test_nonexistent_conversation_returns_404(client, session_a):
    """Accessing an unknown conversation ID returns 404 Not Found."""
    random_id = str(uuid.uuid4())
    resp = client.get(
        f"/api/chat/{random_id}/history",
        headers={"X-Customer-Session-Token": session_a},
    )
    assert resp.status_code == 404


def test_legacy_unassigned_conversation_recovery(client, session_a, session_b):
    """Unassigned legacy conversations can be recovered and bound to the claiming customer session."""
    conv_id = f"legacy_conv_{uuid.uuid4().hex[:12]}"
    # Register conversation under 'legacy_unassigned'
    register_conversation_owner(conv_id, "legacy_unassigned")
    assert get_conversation_owner(conv_id) == "legacy_unassigned"

    # Save a turn under this legacy conversation
    save_turn(conv_id, "Legacy user question", "Legacy assistant reply", metadata={})

    # Customer A recovers the conversation via claim endpoint
    claim_resp = client.post(
        f"/api/chat/{conv_id}/claim",
        headers={"X-Customer-Session-Token": session_a},
    )
    assert claim_resp.status_code == 200
    assert get_conversation_owner(conv_id) == session_a

    # Customer A can read the recovered history
    hist_a = client.get(
        f"/api/chat/{conv_id}/history",
        headers={"X-Customer-Session-Token": session_a},
    )
    assert hist_a.status_code == 200
    assert len(hist_a.get_json()["messages"]) >= 2

    # Customer B cannot access the recovered conversation
    hist_b = client.get(
        f"/api/chat/{conv_id}/history",
        headers={"X-Customer-Session-Token": session_b},
    )
    assert hist_b.status_code == 403


def test_health_check_comprehensive(client):
    """Both /health and /api/health report healthy status across all subsystems."""
    for path in ("/health", "/api/health"):
        resp = client.get(path)
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["status"] == "ok"
        assert data["checks"]["database"] == "ok"
        assert data["checks"]["intent_model"] == "ok"
        assert data["checks"]["rag_index"] == "ok"
        assert data["checks"]["attachments_storage"] == "ok"


