"""
Comprehensive Natural Conversational AI Test Suite for Nexus AI Support.

Tests:
1. Hello / Hi / Greetings never trigger human handoff.
2. How are you? casual conversations.
3. What is your name? AI identity and transparency.
4. Tell me a joke humor capabilities.
5. Thank you gratitude handling.
6. General banking conceptual knowledge.
7. Banking inquiries grounded in Banking77 & FAQ RAG.
8. Hindi and Hinglish natural conversations.
9. Multi-turn conversational memory and follow-up understanding.
10. Explicit human support escalation.
11. Ambiguous queries ask clarification rather than automatic handoff.
12. LLM provider failure graceful degradation.
13. Customer conversation isolation.
"""

import pytest
import uuid
from app.app import create_app
from src.storage.chat_store import ensure_db_initialized
from src.llm.orchestrator import ResponsePath
from src.llm.client import generate_llm_completion
from unittest.mock import patch


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    ensure_db_initialized()
    with app.test_client() as c:
        yield c


def test_hello_and_hi_never_trigger_human_handoff(client):
    """Verify simple greetings (hello, hi, hey) receive natural conversational responses and NEVER trigger human handoff."""
    greetings = ["hello", "hi", "hey", "Good morning Nexus", "Hello there!"]

    for g in greetings:
        session_token = f"sess_greet_{uuid.uuid4().hex[:8]}"
        conv_id = f"conv_greet_{uuid.uuid4().hex[:8]}"

        resp = client.post(
            "/api/chat",
            headers={"X-Customer-Session-Token": session_token},
            json={
                "conversation_id": conv_id,
                "message": g
            }
        )
        assert resp.status_code == 200
        data = resp.get_json()

        # Must not contain error or failure
        assert "response" in data
        assert len(data["response"]) > 0

        # Must NOT tell customer that request was transferred or flagged for human review
        assert "customer support specialist has been flagged" not in data["response"]
        assert "unable to locate a verified knowledge base document" not in data["response"]

        # Friendly welcoming tone
        lower_resp = data["response"].lower()
        assert any(w in lower_resp for w in ["nexus", "help", "assist", "welcome", "hello", "hi", "good"])


def test_how_are_you_casual_chat(client):
    """Verify 'how are you' casual small talk is answered naturally."""
    session_token = f"sess_casual_{uuid.uuid4().hex[:8]}"
    resp = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_token},
        json={"message": "How are you doing today?"}
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert any(w in data["response"].lower() for w in ["great", "good", "well", "ready", "assist", "help"])


def test_what_is_your_name_identity(client):
    """Verify 'what is your name' clearly identifies Nexus as an AI assistant and never claims to be human."""
    session_token = f"sess_ident_{uuid.uuid4().hex[:8]}"
    resp = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_token},
        json={"message": "What is your name and who are you?"}
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert "Nexus" in data["response"]
    assert "AI" in data["response"] or "assistant" in data["response"].lower()


def test_tell_me_a_joke(client):
    """Verify humor request returns light-hearted banking/financial joke."""
    session_token = f"sess_joke_{uuid.uuid4().hex[:8]}"
    resp = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_token},
        json={"message": "Tell me a joke"}
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data["response"]) > 15
    # Should include joke punctuation/indicators
    assert any(c in data["response"] for c in ["?", "!", ":", "\n"])


def test_thank_you_gratitude(client):
    """Verify 'thank you' is acknowledged politely."""
    session_token = f"sess_thanks_{uuid.uuid4().hex[:8]}"
    resp = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_token},
        json={"message": "Thank you so much for your help!"}
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert any(w in data["response"].lower() for w in ["welcome", "pleasure", "glad", "anytime", "happy to help"])


def test_general_knowledge_concepts(client):
    """Verify general banking conceptual questions (e.g. what is an ATM) are explained clearly."""
    session_token = f"sess_gk_{uuid.uuid4().hex[:8]}"
    resp = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_token},
        json={"message": "What is an ATM?"}
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert "ATM" in data["response"] or "cash" in data["response"].lower()


def test_banking_questions_preserve_rag(client):
    """Verify banking questions retrieve verified knowledge and do not invent facts."""
    session_token = f"sess_bank_{uuid.uuid4().hex[:8]}"
    resp = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_token},
        json={"message": "I lost my debit card, how can I block it immediately?"}
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data["response"]) > 20
    # Should contain relevant card guidance
    lower = data["response"].lower()
    assert any(k in lower for k in ["card", "block", "freeze", "app", "lock"])


def test_hindi_and_hinglish_conversations(client):
    """Verify natural responses in Hindi and Hinglish matching user language."""
    session_token = f"sess_multi_{uuid.uuid4().hex[:8]}"

    # 1. Hindi greeting
    resp_hi = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_token},
        json={"message": "नमस्ते"}
    )
    assert resp_hi.status_code == 200
    assert any(g in resp_hi.get_json()["response"] for g in ["नमस्ते", "नमस्कार"])

    # 2. Hinglish greeting
    resp_hing = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_token},
        json={"message": "kese ho? sab theek?"}
    )
    assert resp_hing.status_code == 200
    assert any(w in resp_hing.get_json()["response"].lower() for w in ["badiya", "help", "nexus", "theek", "kaise"])

    # 3. Hinglish joke
    resp_joke = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_token},
        json={"message": "ek joke sunao"}
    )
    assert resp_joke.status_code == 200
    assert len(resp_joke.get_json()["response"]) > 10


def test_multi_turn_follow_up_questions(client):
    """Verify conversation memory: assistant understands follow-up 'What should I do next?' based on previous turn."""
    session_token = f"sess_mem_{uuid.uuid4().hex[:8]}"
    conv_id = f"conv_mem_{uuid.uuid4().hex[:8]}"

    # Turn 1: User asks about lost card
    resp1 = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_token},
        json={
            "conversation_id": conv_id,
            "message": "I lost my payment card."
        }
    )
    assert resp1.status_code == 200

    # Turn 2: User asks follow-up: "What should I do next?"
    resp2 = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_token},
        json={
            "conversation_id": conv_id,
            "message": "What should I do next?"
        }
    )
    assert resp2.status_code == 200
    data2 = resp2.get_json()
    # Should build on conversation context rather than saying "I don't understand"
    assert len(data2["response"]) > 20
    assert "error" not in data2


def test_explicit_human_support_request_triggers_handoff(client):
    """Verify explicit request for human agent triggers handoff and creates support ticket."""
    session_token = f"sess_agent_{uuid.uuid4().hex[:8]}"
    conv_id = f"conv_agent_{uuid.uuid4().hex[:8]}"

    resp = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_token},
        json={
            "conversation_id": conv_id,
            "message": "I want to speak with a human support agent please"
        }
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert any(w in data["response"].lower() for w in ["agent", "specialist", "support", "ticket", "join"])

    # Verify ticket status endpoint confirms active ticket
    status_resp = client.get(
        f"/api/support/status/{conv_id}",
        headers={"X-Customer-Session-Token": session_token}
    )
    assert status_resp.status_code == 200
    status_data = status_resp.get_json()
    assert status_data["has_ticket"] is True


def test_ambiguous_query_asks_clarification(client):
    """Verify uncertain/ambiguous query asks clarification question instead of immediate transfer error."""
    session_token = f"sess_ambig_{uuid.uuid4().hex[:8]}"
    resp = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_token},
        json={"message": "my money issue with payment"}
    )
    assert resp.status_code == 200
    data = resp.get_json()
    # Must ask a clarification question
    assert "?" in data["response"]
    assert any(w in data["response"].lower() for w in ["clarify", "detail", "more", "card", "transfer", "transaction"])


def test_llm_provider_failure_graceful_recovery(client):
    """Verify that if LLM provider fails (network/timeout), system gracefully recovers via conversational engine without failing with HTTP 500."""
    session_token = f"sess_fail_{uuid.uuid4().hex[:8]}"

    with patch("src.llm.orchestrator.generate_llm_completion", side_effect=Exception("Simulated API 500")):
        resp = client.post(
            "/api/chat",
            headers={"X-Customer-Session-Token": session_token},
            json={"message": "hello Nexus"}
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert "response" in data
        assert len(data["response"]) > 0


def test_customer_conversation_isolation(client):
    """Verify different customer sessions cannot access each other's conversation history."""
    token_a = f"cust_sess_a_{uuid.uuid4().hex[:8]}"
    token_b = f"cust_sess_b_{uuid.uuid4().hex[:8]}"
    conv_id = f"conv_priv_{uuid.uuid4().hex[:8]}"

    # Customer A creates conversation
    resp_a = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": token_a},
        json={
            "conversation_id": conv_id,
            "message": "Confidential inquiry regarding my secret offshore account balance."
        }
    )
    assert resp_a.status_code == 200

    # Customer B attempts to append or view Customer A's conversation
    resp_b = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": token_b},
        json={
            "conversation_id": conv_id,
            "message": "Tampering attempt."
        }
    )
    assert resp_b.status_code == 403
