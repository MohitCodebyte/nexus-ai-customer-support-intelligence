import io
import sys
import uuid
import pytest
from unittest.mock import MagicMock, patch

try:
    from google import genai
except ImportError:
    genai = MagicMock()
    sys.modules["google.genai"] = genai

from app.app import create_app
from src.services.speech_service import transcribe_audio_blob, MAX_AUDIO_BYTES


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


def test_empty_audio_rejection(client, session_a):
    """Empty audio payload is rejected with HTTP 400 and error code empty_audio."""
    data = {
        "audio": (io.BytesIO(b""), "voice.webm"),
        "language": "en"
    }
    resp = client.post(
        "/api/speech/transcribe",
        headers={"X-Customer-Session-Token": session_a},
        data=data,
        content_type="multipart/form-data"
    )
    assert resp.status_code == 400
    res_json = resp.get_json()
    assert res_json["error"] == "empty_audio"


def test_unsupported_mime_type(client, session_a):
    """Unsupported audio format is rejected with HTTP 415."""
    data = {
        "audio": (io.BytesIO(b"fake audio bytes"), "test.exe", "application/x-msdownload"),
        "language": "en"
    }
    resp = client.post(
        "/api/speech/transcribe",
        headers={"X-Customer-Session-Token": session_a},
        data=data,
        content_type="multipart/form-data"
    )
    assert resp.status_code == 415
    res_json = resp.get_json()
    assert res_json["error"] == "unsupported_media_type"


def test_gemini_successful_transcription(monkeypatch, client, session_a):
    """Official Google Gen AI SDK mock produces successful transcription with automated cleanup."""
    mock_client = MagicMock()
    mock_file = MagicMock()
    mock_file.name = "files/mock123"
    mock_file.uri = "https://generativelanguage.googleapis.com/v1beta/files/mock123"
    mock_file.mime_type = "audio/webm"
    mock_client.files.upload.return_value = mock_file

    mock_interaction = MagicMock()
    mock_interaction.output_text = "How do I block my debit card immediately?"
    mock_client.interactions.create.return_value = mock_interaction

    with patch.object(genai, "Client", return_value=mock_client):
        monkeypatch.setenv("GEMINI_API_KEY", "mock-gemini-key")
        data = {
            "audio": (io.BytesIO(b"valid_webm_audio_data"), "voice.webm", "audio/webm"),
            "language": "en"
        }
        resp = client.post(
            "/api/speech/transcribe",
            headers={"X-Customer-Session-Token": session_a},
            data=data,
            content_type="multipart/form-data"
        )
        assert resp.status_code == 200
        res_json = resp.get_json()
        assert res_json["status"] == "success"
        assert res_json["transcript"] == "How do I block my debit card immediately?"
        assert res_json["provider"] == "gemini"

        # Verify cleanup occurred
        mock_client.files.delete.assert_called_once_with(name="files/mock123")


def test_gemini_404_upstream_failure_handling(monkeypatch, client, session_a):
    """Upstream 404 or connection failures from Gemini return sanitized HTTP 502 diagnostics."""
    mock_client = MagicMock()
    mock_client.files.upload.side_effect = Exception("HTTP Error 404: Model 'gemini-3.5-transcribe' Not Found")

    with patch.object(genai, "Client", return_value=mock_client):
        monkeypatch.setenv("GEMINI_API_KEY", "mock-gemini-key")
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        data = {
            "audio": (io.BytesIO(b"valid_webm_audio_data"), "voice.webm", "audio/webm"),
            "language": "en"
        }
        resp = client.post(
            "/api/speech/transcribe",
            headers={"X-Customer-Session-Token": session_a},
            data=data,
            content_type="multipart/form-data"
        )
        assert resp.status_code == 502
        res_json = resp.get_json()
        assert res_json["error"] == "upstream_error"
        assert "404" in res_json["message"]


def test_empty_gemini_transcript(monkeypatch, client, session_a):
    """Empty transcription response from model returns status success with empty transcript."""
    mock_client = MagicMock()
    mock_file = MagicMock()
    mock_file.name = "files/mock123"
    mock_client.files.upload.return_value = mock_file

    mock_interaction = MagicMock()
    mock_interaction.output_text = ""
    mock_client.interactions.create.return_value = mock_interaction

    # Also mock generate_content fallback returning empty text
    mock_gen_resp = MagicMock()
    mock_gen_resp.text = None
    mock_client.models.generate_content.return_value = mock_gen_resp

    with patch.object(genai, "Client", return_value=mock_client):
        monkeypatch.setenv("GEMINI_API_KEY", "mock-gemini-key")
        data = {
            "audio": (io.BytesIO(b"valid_webm_audio_data"), "voice.webm", "audio/webm"),
            "language": "en"
        }
        resp = client.post(
            "/api/speech/transcribe",
            headers={"X-Customer-Session-Token": session_a},
            data=data,
            content_type="multipart/form-data"
        )
        assert resp.status_code == 200
        res_json = resp.get_json()
        assert res_json["transcript"] == ""
        assert "message" in res_json


def test_frontend_formdata_compatibility(monkeypatch, client, session_a):
    """Frontend FormData fields 'audio' and 'language' are fully supported across audio formats."""
    mock_client = MagicMock()
    mock_file = MagicMock(name="files/m4a_mock")
    mock_file.name = "files/m4a_mock"
    mock_client.files.upload.return_value = mock_file
    mock_interaction = MagicMock()
    mock_interaction.output_text = "Paise kab transfer honge?"
    mock_client.interactions.create.return_value = mock_interaction

    with patch.object(genai, "Client", return_value=mock_client):
        monkeypatch.setenv("GEMINI_API_KEY", "mock-gemini-key")
        data = {
            "audio": (io.BytesIO(b"mock_audio_content"), "voice.mp4", "audio/mp4"),
            "language": "hinglish"
        }
        resp = client.post(
            "/api/speech/transcribe",
            headers={"X-Customer-Session-Token": session_a},
            data=data,
            content_type="multipart/form-data"
        )
        assert resp.status_code == 200
        assert resp.get_json()["transcript"] == "Paise kab transfer honge?"


def test_valid_support_owner_receives_status(client, session_a):
    """Legitimate conversation owner receives 200 with ticket status and messages."""
    # 1. Start chat
    chat_resp = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_a},
        json={"message": "I lost my debit card"},
    )
    assert chat_resp.status_code == 200
    conv_id = chat_resp.get_json()["conversation_id"]

    # 2. Escalate to human support
    req_resp = client.post(
        "/api/support/request",
        headers={"X-Customer-Session-Token": session_a},
        json={
            "conversation_id": conv_id,
            "reason": "Need urgent card block assistance",
            "customer_name": "Alice",
            "priority": "high",
        }
    )
    assert req_resp.status_code == 201
    ticket_id = req_resp.get_json()["ticket"]["id"]

    # 3. Owner checks status
    status_resp = client.get(
        f"/api/support/status/{conv_id}",
        headers={"X-Customer-Session-Token": session_a}
    )
    assert status_resp.status_code == 200
    status_json = status_resp.get_json()
    assert status_json["has_ticket"] is True
    assert status_json["ticket"]["id"] == ticket_id
    assert status_json["ticket"]["status"] == "open"


def test_invalid_owner_receives_403(client, session_a, session_b):
    """Customer B cannot view Customer A's conversation support status."""
    chat_resp = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_a},
        json={"message": "Checking my loan application status"},
    )
    conv_id = chat_resp.get_json()["conversation_id"]

    # Customer B attempts to check support status for Customer A's conversation
    tamper_resp = client.get(
        f"/api/support/status/{conv_id}",
        headers={"X-Customer-Session-Token": session_b}
    )
    assert tamper_resp.status_code == 403
    assert "Forbidden" in tamper_resp.get_json()["error"]


def test_another_user_conversation_inaccessible_for_escalation(client, session_a, session_b):
    """Customer B cannot create a support ticket on Customer A's conversation."""
    chat_resp = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_a},
        json={"message": "Unauthorized transaction dispute"},
    )
    conv_id = chat_resp.get_json()["conversation_id"]

    # Customer B attempts to escalate Customer A's conversation
    tamper_req = client.post(
        "/api/support/request",
        headers={"X-Customer-Session-Token": session_b},
        json={
            "conversation_id": conv_id,
            "reason": "Fraudulent escalation attempt",
            "customer_name": "Attacker",
        }
    )
    assert tamper_req.status_code == 403
    assert "Forbidden" in tamper_req.get_json()["error"]


def test_new_conversation_support_status_clean(client, session_a):
    """Brand new conversation ID before first message does not return 403 Forbidden."""
    new_conv_id = str(uuid.uuid4())
    status_resp = client.get(
        f"/api/support/status/{new_conv_id}",
        headers={"X-Customer-Session-Token": session_a}
    )
    assert status_resp.status_code == 200
    res_json = status_resp.get_json()
    assert res_json["has_ticket"] is False
    assert res_json["status"] == "none"
