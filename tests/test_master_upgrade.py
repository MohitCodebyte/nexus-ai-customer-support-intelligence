import os
import json
import pytest
from app.app import create_app
from src.storage.chat_store import (
    ensure_db_initialized,
    save_turn,
    get_db_connection,
)

ADMIN_KEY = os.environ.get("NEXUS_ADMIN_KEY", "nexus-admin-secret-2026")


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    ensure_db_initialized()
    with app.test_client() as c:
        yield c


@pytest.fixture
def test_conversation(client):
    """Seed a fresh test conversation owned by unique customer session."""
    import uuid
    uid = uuid.uuid4().hex[:10]
    session_token = f"cust_sess_test_{uid}"
    conv_id = f"conv_test_{uid}"

    resp = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_token},
        json={
            "conversation_id": conv_id,
            "message": "I lost my debit card abroad and need immediate help."
        }
    )
    assert resp.status_code == 200
    return {
        "conversation_id": conv_id,
        "session_token": session_token
    }


# =============================================================================
# 1. ADMIN AUTHENTICATION & ANALYTICS TESTS
# =============================================================================

def test_admin_login_success_and_logout(client):
    """Verify administrator login issues valid session token and logout revokes it."""
    # Invalid password
    resp = client.post("/api/admin/login", json={"password": "wrong-password"})
    assert resp.status_code == 401

    # Valid password
    resp = client.post("/api/admin/login", json={"password": ADMIN_KEY})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["status"] == "success"
    admin_token = data["admin_token"]
    assert admin_token.startswith("admin_sess_")

    # Verify session is authenticated via /me
    me_resp = client.get("/api/admin/me", headers={"X-Admin-Session": admin_token})
    assert me_resp.status_code == 200
    assert me_resp.get_json()["authenticated"] is True

    # Logout
    logout_resp = client.post("/api/admin/logout", headers={"X-Admin-Session": admin_token})
    assert logout_resp.status_code == 200

    # Verify session revoked
    me_after = client.get("/api/admin/me", headers={"X-Admin-Session": admin_token})
    assert me_after.status_code == 200
    assert me_after.get_json()["authenticated"] is False


def test_admin_analytics_endpoint(client):
    """Verify real analytics retrieval with authorization check."""
    # Unauthenticated request rejected
    resp = client.get("/api/admin/analytics")
    assert resp.status_code == 403

    # Authenticated via X-Admin-Key
    auth_resp = client.get("/api/admin/analytics", headers={"X-Admin-Key": ADMIN_KEY})
    assert auth_resp.status_code == 200
    data = auth_resp.get_json()
    assert "overview" in data
    assert "csat" in data
    assert "intents" in data
    assert "sentiment" in data
    assert "trends" in data
    assert data["overview"]["total_messages"] >= 0


def test_admin_conversation_audit_inspection(client, test_conversation):
    """Verify admin can inspect conversation with full audit metadata."""
    conv_id = test_conversation["conversation_id"]

    audit_resp = client.get(
        f"/api/admin/conversations/{conv_id}",
        headers={"X-Admin-Key": ADMIN_KEY}
    )
    assert audit_resp.status_code == 200
    audit_data = audit_resp.get_json()
    assert audit_data["conversation_id"] == conv_id
    messages = audit_data["messages"]
    assert len(messages) >= 2
    # Verify parsed internal ML metadata is present
    assistant_msg = [m for m in messages if m["role"] == "assistant"][0]
    assert "parsed_metadata" in assistant_msg


# =============================================================================
# 2. CONVERSATION RENAME TESTS
# =============================================================================

def test_conversation_rename_ownership_enforcement(client, test_conversation):
    """Verify customer can rename own conversation, and foreign customer is blocked."""
    conv_id = test_conversation["conversation_id"]
    owner_token = test_conversation["session_token"]
    foreign_token = "cust_sess_intruder_9999"

    # Foreign customer blocked
    forbidden_resp = client.post(
        f"/api/chat/{conv_id}/rename",
        headers={"X-Customer-Session-Token": foreign_token},
        json={"title": "Hacked Title"}
    )
    assert forbidden_resp.status_code == 403

    # Legitimate owner succeeds
    rename_resp = client.post(
        f"/api/chat/{conv_id}/rename",
        headers={"X-Customer-Session-Token": owner_token},
        json={"title": "Lost Card Travel Emergency"}
    )
    assert rename_resp.status_code == 200
    assert rename_resp.get_json()["title"] == "Lost Card Travel Emergency"

    # Verify updated title appears in conversation list
    list_resp = client.get(
        "/api/chat/conversations",
        headers={"X-Customer-Session-Token": owner_token}
    )
    assert list_resp.status_code == 200
    conv_item = [c for c in list_resp.get_json()["conversations"] if c["conversation_id"] == conv_id][0]
    assert conv_item["title"] == "Lost Card Travel Emergency"


# =============================================================================
# 3. HUMAN SUPPORT HANDOFF & AGENT WORKSPACE TESTS
# =============================================================================

def test_human_support_escalation_lifecycle(client, test_conversation):
    """Test full customer escalation -> agent claim -> agent reply appearing in chat."""
    conv_id = test_conversation["conversation_id"]
    owner_token = test_conversation["session_token"]

    # 1. Customer requests human support
    req_resp = client.post(
        "/api/support/request",
        headers={"X-Customer-Session-Token": owner_token},
        json={
            "conversation_id": conv_id,
            "reason": "AI did not unfreeze my emergency travel limits.",
            "customer_name": "Priya Sharma",
            "priority": "high"
        }
    )
    assert req_resp.status_code == 201
    ticket_data = req_resp.get_json()["ticket"]
    ticket_id = ticket_data["id"]
    assert ticket_id.startswith("TICK-")

    # 2. Customer checks status
    status_resp = client.get(
        f"/api/support/status/{conv_id}",
        headers={"X-Customer-Session-Token": owner_token}
    )
    assert status_resp.status_code == 200
    assert status_resp.get_json()["has_ticket"] is True
    assert status_resp.get_json()["ticket"]["status"] == "open"

    # 3. Support Agent lists tickets
    queue_resp = client.get("/api/admin/tickets", headers={"X-Admin-Key": ADMIN_KEY})
    assert queue_resp.status_code == 200
    tickets = queue_resp.get_json()["tickets"]
    assert any(t["id"] == ticket_id for t in tickets)

    # 4. Support Agent updates status & assigns
    update_resp = client.patch(
        f"/api/admin/tickets/{ticket_id}",
        headers={"X-Admin-Key": ADMIN_KEY},
        json={
            "status": "in_progress",
            "assigned_agent": "Agent Sarah (Tier 2)"
        }
    )
    assert update_resp.status_code == 200

    # 5. Agent sends public reply to customer
    reply_resp = client.post(
        f"/api/admin/tickets/{ticket_id}/reply",
        headers={"X-Admin-Key": ADMIN_KEY},
        json={
            "message": "Hello Priya, I have reviewed your card status and temporarily increased your overseas limit.",
            "sender_name": "Agent Sarah",
            "is_internal_note": False
        }
    )
    assert reply_resp.status_code == 201

    # 6. Verify agent reply appears in customer's chat history
    chat_hist = client.get(
        f"/api/chat/{conv_id}/history",
        headers={"X-Customer-Session-Token": owner_token}
    )
    assert chat_hist.status_code == 200
    messages = chat_hist.get_json()["messages"]
    last_assistant = [m for m in messages if m["role"] == "assistant"][-1]
    assert "Hello Priya, I have reviewed your card status" in last_assistant["content"]


# =============================================================================
# 4. KNOWLEDGE BASE FAQ MANAGEMENT TESTS
# =============================================================================

def test_knowledge_base_faq_crud_and_retrieval(client):
    """Test adding custom FAQ, testing live retrieval, and deleting FAQ."""
    # 1. Add custom FAQ
    add_resp = client.post(
        "/api/admin/knowledge/faqs",
        headers={"X-Admin-Key": ADMIN_KEY},
        json={
            "intent": "overseas_travel_notice",
            "category": "Card Travel Protection",
            "question": "How do I notify Nexus Bank before traveling internationally?",
            "answer": "You can enable Travel Notice instantly under Cards > Travel Mode in your mobile banking app.",
            "keywords": "travel, overseas, vacation, notice"
        }
    )
    assert add_resp.status_code == 201
    faq = add_resp.get_json()["faq"]
    faq_id = faq["id"]

    # 2. List FAQs
    list_resp = client.get(
        "/api/admin/knowledge/faqs",
        headers={"X-Admin-Key": ADMIN_KEY}
    )
    assert list_resp.status_code == 200
    faqs = list_resp.get_json()["faqs"]
    assert any(f["id"] == faq_id for f in faqs)

    # 3. Test live query against RAG semantic retriever
    test_retrieval_resp = client.post(
        "/api/admin/knowledge/test",
        headers={"X-Admin-Key": ADMIN_KEY},
        json={"query": "lost card overseas", "top_k": 2}
    )
    assert test_retrieval_resp.status_code == 200
    results = test_retrieval_resp.get_json()["results"]
    assert "sources" in results
    assert len(results["sources"]) > 0

    # 4. Safe rebuild / refresh index
    rebuild_resp = client.post(
        "/api/admin/knowledge/rebuild",
        headers={"X-Admin-Key": ADMIN_KEY}
    )
    assert rebuild_resp.status_code == 200
    assert rebuild_resp.get_json()["status"] == "success"

    # 4b. Recover index from backup
    recover_resp = client.post(
        "/api/admin/knowledge/recover",
        headers={"X-Admin-Key": ADMIN_KEY}
    )
    assert recover_resp.status_code == 200
    assert recover_resp.get_json()["status"] == "success"

    # 5. Delete custom FAQ
    del_resp = client.delete(
        f"/api/admin/knowledge/faqs/{faq_id}",
        headers={"X-Admin-Key": ADMIN_KEY}
    )
    assert del_resp.status_code == 200
