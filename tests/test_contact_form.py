import pytest
import uuid
from app.app import create_app
from src.services.contact_service import _IP_SUBMISSION_HISTORY


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


def test_contact_form_valid_submission(client):
    """Verify valid contact form submission persists message and returns 201."""
    unique_email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    payload = {
        "name": "Jane Doe",
        "email": unique_email,
        "company": "Nexus Financial Inc",
        "phone": "+1 (555) 019-2834",
        "message": "We would like to explore Nexus AI for our customer support banking workflow.",
        "consent": True,
    }

    resp = client.post("/api/contact", json=payload)
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["success"] is True
    assert "message_id" in data
    assert data["message_id"].startswith("msg_")
    assert "message" in data


def test_contact_form_validation_failures(client):
    """Verify all invalid inputs are rejected with 400 and clear error descriptions."""
    # 1. Missing name
    resp = client.post("/api/contact", json={"email": "test@example.com", "consent": True})
    assert resp.status_code == 400
    assert "Full Name is required" in resp.get_json()["error"]

    # 2. Invalid email
    resp = client.post("/api/contact", json={"name": "Alice", "email": "not-an-email", "consent": True})
    assert resp.status_code == 400
    assert "valid email" in resp.get_json()["error"]

    # 3. Missing consent
    resp = client.post("/api/contact", json={"name": "Alice", "email": "alice@example.com", "consent": False})
    assert resp.status_code == 400
    assert "privacy policy" in resp.get_json()["error"]

    # 4. Honeypot spam trap
    resp = client.post("/api/contact", json={
        "name": "Spam Bot",
        "email": "bot@spam.com",
        "consent": True,
        "website": "http://spamsite.com"
    })
    assert resp.status_code == 400
    assert "Spam detected" in resp.get_json()["error"]


def test_contact_form_rate_limiting(client):
    """Verify that excessive submissions from the same IP are throttled with HTTP 429."""
    test_ip = f"192.168.1.{uuid.uuid4().int % 250 + 1}"
    _IP_SUBMISSION_HISTORY[test_ip] = []

    payload = {
        "name": "Rate Tester",
        "email": "rate@tester.com",
        "consent": True,
    }

    # First 5 should succeed
    for _ in range(5):
        resp = client.post(
            "/api/contact",
            json=payload,
            headers={"X-Forwarded-For": test_ip}
        )
        assert resp.status_code == 201

    # 6th should be blocked by rate limit
    resp_blocked = client.post(
        "/api/contact",
        json=payload,
        headers={"X-Forwarded-For": test_ip}
    )
    assert resp_blocked.status_code == 429
    assert "Too many contact submissions" in resp_blocked.get_json()["error"]


def test_admin_contact_messages_authorization(client):
    """Verify GET /api/admin/contact-messages enforces authentication."""
    # Unauthorized request
    resp_unauth = client.get("/api/admin/contact-messages")
    assert resp_unauth.status_code == 401

    # Authorized with X-Admin-Key
    resp_auth = client.get(
        "/api/admin/contact-messages",
        headers={"X-Admin-Key": "nexus-admin-secret-2026"}
    )
    assert resp_auth.status_code == 200
    data = resp_auth.get_json()
    assert "messages" in data
    assert isinstance(data["messages"], list)


def test_admin_test_smtp_endpoint(client):
    """Verify POST /api/admin/test-smtp enforces authentication and safely tests SMTP."""
    # 1. Unauthorized request
    resp_unauth = client.post("/api/admin/test-smtp")
    assert resp_unauth.status_code == 401

    # 2. Authorized request without env secrets configured returns 503 safe message
    resp_auth = client.post(
        "/api/admin/test-smtp",
        headers={"X-Admin-Key": "nexus-admin-secret-2026"}
    )
    assert resp_auth.status_code in (200, 503)
    data = resp_auth.get_json()
    assert "success" in data
    assert "message" in data
    # Ensure credentials are never leaked
    assert "password" not in data["message"].lower() or "not set" in data["message"].lower()


