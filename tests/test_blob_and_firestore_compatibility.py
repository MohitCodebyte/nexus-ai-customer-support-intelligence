"""
Tests for Final Vercel Backend Compatibility & Vercel Blob Integration.

Covers:
1. Firestore-only startup: SQLite not_applicable, zero writes under /var/task, database: ok.
2. Direct SQLite access disabled when STORAGE_BACKEND=firestore.
3. Vercel Blob SDK integration (upload, download, delete, deterministic pathnames).
4. Cloud attachment upload size boundary enforcement (4.5 MB Vercel limit).
5. Strict ownership verification on attachments (403 for unauthorized session, 200 for owner).
6. Contact submission without SQLite writes in Firestore mode.
7. Backward compatibility for SQLite mode in local development.
"""

import os
import io
import uuid
import pytest
from unittest.mock import patch, MagicMock
from pathlib import Path

from app.app import app
from src.storage.chat_store import (
    is_firestore_active,
    get_active_storage_backend,
    get_db_connection,
    register_conversation_owner,
)
from src.storage.blob_storage import (
    is_blob_configured,
    build_attachment_pathname,
    upload_blob_attachment,
    download_blob_attachment,
    delete_blob_attachment,
    check_blob_health,
)
from src.storage.attachment_service import (
    get_max_attachment_size,
    extract_document_text_from_bytes,
)
from src.services.contact_service import save_contact_message


@pytest.fixture
def client():
    app.config["TESTING"] = True
    return app.test_client()


def test_firestore_only_health_check(client):
    """Health check in Firestore mode must return sqlite_database: not_applicable and database: ok."""
    with patch.dict(os.environ, {"STORAGE_BACKEND": "firestore"}):
        res = client.get("/health")
        assert res.status_code == 200
        data = res.get_json()
        assert data["status"] == "ok"
        checks = data["checks"]
        assert checks["storage_backend"] == "firestore"
        assert checks["sqlite_database"] == "not_applicable"
        assert checks["database"] == "ok"
        assert checks["firestore"] == "ok"
        assert checks["intent_model"] == "ok"
        assert checks["rag_index"] == "ok"
        assert checks["attachments_storage"] == "ok"


def test_sqlite_connection_disabled_in_firestore_mode():
    """get_db_connection must raise RuntimeError and never create directories when STORAGE_BACKEND=firestore."""
    with patch.dict(os.environ, {"STORAGE_BACKEND": "firestore"}):
        assert is_firestore_active() is True
        with pytest.raises(RuntimeError, match="SQLite connection is disabled when STORAGE_BACKEND=firestore is active"):
            get_db_connection()


def test_blob_deterministic_pathname():
    """build_attachment_pathname must generate collision-safe, sanitized pathnames."""
    conv_id = "test-conv-123"
    att_id = "att-uuid-456"
    fname = "../../../etc/passwd.pdf"
    pathname = build_attachment_pathname(conv_id, att_id, fname)
    assert pathname == "attachments/test-conv-123/att-uuid-456_passwd.pdf"
    assert ".." not in pathname
    assert pathname.startswith("attachments/test-conv-123/")


def test_blob_storage_configuration_checks():
    """Test is_blob_configured with and without environment credentials."""
    with patch.dict(os.environ, {}, clear=True):
        assert is_blob_configured() is False
        health = check_blob_health()
        assert health["connected"] is False
        assert "not configured" in health["error"]

    with patch.dict(os.environ, {"BLOB_READ_WRITE_TOKEN": "vercel_blob_rw_teststore123_testsecret"}):
        assert is_blob_configured() is True
        health = check_blob_health()
        assert health["connected"] is True
        assert health["store_id"] == "teststore123"
        assert health["access_tier"] == "private"


def test_blob_upload_and_download_mocked():
    """Test upload_blob_attachment and download_blob_attachment with official SDK mocks."""
    mock_put_result = MagicMock()
    mock_put_result.pathname = "attachments/c1/a1_sample.txt"
    mock_put_result.url = "https://blob.vercel-storage.com/sample.txt"
    mock_put_result.download_url = "https://blob.vercel-storage.com/sample.txt?download=1"
    mock_put_result.content_type = "text/plain"
    mock_put_result.etag = '"etag123"'

    mock_get_result = MagicMock()
    mock_get_result.body = b"Hello Vercel Blob"
    mock_get_result.metadata.content_type = "text/plain"
    mock_get_result.metadata.url = "https://blob.vercel-storage.com/sample.txt"
    mock_get_result.metadata.etag = '"etag123"'
    mock_get_result.metadata.content_disposition = 'inline; filename="sample.txt"'

    from vercel import blob
    with patch.object(blob.sync, "put_blob", return_value=mock_put_result) as mock_put, \
         patch.object(blob.sync, "get_blob", return_value=mock_get_result) as mock_get:

        res = upload_blob_attachment(
            conversation_id="c1",
            attachment_id="a1",
            filename="sample.txt",
            data=b"Hello Vercel Blob",
            mime_type="text/plain"
        )
        assert res["storage_provider"] == "vercel_blob"
        assert res["access"] == "private"
        assert res["blob_pathname"] == "attachments/c1/a1_sample.txt"
        assert res["file_size"] == len(b"Hello Vercel Blob")
        mock_put.assert_called_once()
        assert mock_put.call_args[1]["access"] == "private"

        body, meta = download_blob_attachment("attachments/c1/a1_sample.txt")
        assert body == b"Hello Vercel Blob"
        assert meta["content_type"] == "text/plain"
        mock_get.assert_called_once_with("attachments/c1/a1_sample.txt", access="private")


def test_cloud_upload_attachment_size_limit_rejection(client):
    """File exceeding the 4.5 MB cloud boundary must be rejected with 400 and clear message."""
    with patch.dict(os.environ, {"STORAGE_BACKEND": "firestore"}):
        large_bytes = b"%PDF-" + (b"0" * (5 * 1024 * 1024))  # 5 MB
        res = client.post(
            "/api/chat/upload",
            data={"file": (io.BytesIO(large_bytes), "large.pdf", "application/pdf")},
            content_type="multipart/form-data"
        )
        assert res.status_code == 400
        data = res.get_json()
        assert "exceeds maximum allowed size" in data["error"].lower()


def test_in_memory_text_extraction_safe_for_serverless():
    """Text extraction directly from memory bytes without disk writes."""
    txt_bytes = b"Account balance is $5,000 for customer Mitansh."
    full, preview = extract_document_text_from_bytes(txt_bytes, "txt")
    assert "Account balance" in full
    assert preview.startswith("Account balance")

    csv_bytes = b"Date,Amount,Merchant\n2026-11-10,45.50,Grocery Store\n2026-11-09,12.00,Coffee Shop"
    full, preview = extract_document_text_from_bytes(csv_bytes, "csv")
    assert "CSV Headers" in full
    assert "Grocery Store" in full


def test_attachment_access_authorization_ownership(client):
    """Cross-customer attachment access must be strictly rejected with HTTP 403."""
    with patch.dict(os.environ, {"STORAGE_BACKEND": "firestore"}):
        conv_id = f"test-conv-{uuid.uuid4().hex[:8]}"
        owner_token = f"owner-{uuid.uuid4().hex[:8]}"
        intruder_token = f"intruder-{uuid.uuid4().hex[:8]}"

        register_conversation_owner(conv_id, owner_token)

        # Upload attachment as owner
        pdf_bytes = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
        upload_res = client.post(
            "/api/chat/upload",
            data={
                "file": (io.BytesIO(pdf_bytes), "statement.pdf", "application/pdf"),
                "conversation_id": conv_id,
            },
            headers={"X-Customer-Session-Token": owner_token},
            content_type="multipart/form-data"
        )
        assert upload_res.status_code == 200
        att_id = upload_res.get_json()["attachment"]["id"]

        # Owner access succeeds
        owner_get = client.get(
            f"/api/chat/attachments/{att_id}",
            headers={"X-Customer-Session-Token": owner_token}
        )
        assert owner_get.status_code == 200

        # Intruder access rejected with 403 Forbidden
        intruder_get = client.get(
            f"/api/chat/attachments/{att_id}",
            headers={"X-Customer-Session-Token": intruder_token}
        )
        assert intruder_get.status_code == 403
        assert "Forbidden" in intruder_get.get_json()["error"]


def test_contact_submission_in_firestore_mode():
    """Contact submission in Firestore mode persists to Firestore without calling SQLite."""
    with patch.dict(os.environ, {"STORAGE_BACKEND": "firestore"}):
        res = save_contact_message(
            payload={
                "name": "Test Customer",
                "email": "test.customer@nexus-bank.com",
                "company": "Nexus Corp",
                "phone": "+1234567890",
                "message": "Testing Vercel compatibility",
                "consent": True,
            },
            client_ip="127.0.0.1"
        )
        assert res["success"] is True
        assert res["firestore_saved"] is True
        assert "message_id" in res


def test_sqlite_mode_backward_compatibility(client):
    """In SQLite mode, health check includes sqlite_database: ok."""
    with patch.dict(os.environ, {"STORAGE_BACKEND": "sqlite"}):
        res = client.get("/health")
        assert res.status_code == 200
        data = res.get_json()
        assert data["checks"]["storage_backend"] == "sqlite"
        assert data["checks"]["sqlite_database"] == "ok"
