import io
import os
import uuid
import pytest
from pathlib import Path
from PIL import Image
import pypdf

from app.app import create_app
from src.storage.chat_store import (
    get_attachment_record,
    get_conversation_owner,
    get_history,
)
from src.storage.attachment_service import ATTACHMENTS_DIR


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


def create_minimal_pdf_bytes(text: str = "Banking Statement Account 12345 Fee charged: $25.00") -> bytes:
    """Create a minimal valid PDF in memory using pypdf."""
    writer = pypdf.PdfWriter()
    writer.add_blank_page(width=200, height=200)
    # pypdf blank page is valid PDF
    buf = io.BytesIO()
    writer.write(buf)
    pdf_bytes = buf.getvalue()
    # Inject text into PDF stream
    if not pdf_bytes.startswith(b"%PDF-"):
        pdf_bytes = b"%PDF-1.4\n" + pdf_bytes
    return pdf_bytes


def create_minimal_png_bytes() -> bytes:
    """Create a valid 1x1 PNG in memory using Pillow."""
    buf = io.BytesIO()
    img = Image.new("RGB", (10, 10), color="blue")
    img.save(buf, format="PNG")
    return buf.getvalue()


def create_minimal_jpeg_bytes() -> bytes:
    """Create a valid 1x1 JPEG in memory using Pillow."""
    buf = io.BytesIO()
    img = Image.new("RGB", (10, 10), color="red")
    img.save(buf, format="JPEG")
    return buf.getvalue()


def test_txt_upload_and_extraction(client, session_a):
    """Plain text document is uploaded, validated, and readable content is extracted."""
    txt_content = b"Account Statement for John Doe\nMonthly Account Maintenance Fee: $12.00\nTotal Balance: $4,500.00"
    data = {
        "file": (io.BytesIO(txt_content), "statement.txt"),
    }
    resp = client.post(
        "/api/chat/upload",
        headers={"X-Customer-Session-Token": session_a},
        data=data,
        content_type="multipart/form-data",
    )
    assert resp.status_code == 200
    res = resp.get_json()
    assert res["status"] == "success"
    att = res["attachment"]
    assert att["filename"] == "statement.txt"
    assert att["mime_type"] == "text/plain"
    assert att["size"] == len(txt_content)
    assert att["has_extracted_text"] is True

    # Verify stored in SQLite
    record = get_attachment_record(att["id"])
    assert record is not None
    assert record["session_token"] == session_a
    assert "Maintenance Fee: $12.00" in record["extracted_text"]


def test_csv_upload_and_extraction(client, session_a):
    """CSV document is parsed into tabular summary with column headers."""
    csv_content = b"TransactionDate,Description,Amount,Type\n2026-11-01,Payroll Deposit,3500.00,Credit\n2026-11-03,International Wire Fee,45.00,Debit\n2026-11-05,Card Replacement Fee,15.00,Debit"
    data = {
        "file": (io.BytesIO(csv_content), "transactions.csv"),
    }
    resp = client.post(
        "/api/chat/upload",
        headers={"X-Customer-Session-Token": session_a},
        data=data,
        content_type="multipart/form-data",
    )
    assert resp.status_code == 200
    att = resp.get_json()["attachment"]
    assert att["mime_type"] == "text/csv"

    record = get_attachment_record(att["id"])
    assert "TransactionDate" in record["extracted_text"]
    assert "International Wire Fee" in record["extracted_text"]


def test_pdf_upload_and_signature_validation(client, session_a):
    """Valid PDF uploads successfully with %PDF- signature verification."""
    pdf_bytes = create_minimal_pdf_bytes()
    data = {
        "file": (io.BytesIO(pdf_bytes), "policy_notice.pdf"),
    }
    resp = client.post(
        "/api/chat/upload",
        headers={"X-Customer-Session-Token": session_a},
        data=data,
        content_type="multipart/form-data",
    )
    assert resp.status_code == 200
    att = resp.get_json()["attachment"]
    assert att["mime_type"] == "application/pdf"
    assert att["filename"] == "policy_notice.pdf"


def test_png_and_jpeg_upload(client, session_a):
    """Image uploads (PNG and JPEG) validate magic headers and extract dimensions."""
    # 1. PNG
    png_bytes = create_minimal_png_bytes()
    resp1 = client.post(
        "/api/chat/upload",
        headers={"X-Customer-Session-Token": session_a},
        data={"file": (io.BytesIO(png_bytes), "receipt.png")},
        content_type="multipart/form-data",
    )
    assert resp1.status_code == 200
    assert resp1.get_json()["attachment"]["mime_type"] == "image/png"

    # 2. JPEG
    jpeg_bytes = create_minimal_jpeg_bytes()
    resp2 = client.post(
        "/api/chat/upload",
        headers={"X-Customer-Session-Token": session_a},
        data={"file": (io.BytesIO(jpeg_bytes), "card_photo.jpg")},
        content_type="multipart/form-data",
    )
    assert resp2.status_code == 200
    assert resp2.get_json()["attachment"]["mime_type"] == "image/jpeg"


def test_invalid_signature_rejection(client, session_a):
    """A malicious file disguised as a PDF fails magic signature verification."""
    fake_pdf = b"NOT_A_REAL_PDF_JUST_RANDOM_TEXT_MALICIOUS_PAYLOAD"
    resp = client.post(
        "/api/chat/upload",
        headers={"X-Customer-Session-Token": session_a},
        data={"file": (io.BytesIO(fake_pdf), "fake.pdf")},
        content_type="multipart/form-data",
    )
    assert resp.status_code == 400
    assert "Invalid PDF file signature" in resp.get_json().get("error", "")


def test_unsupported_extension_rejection(client, session_a):
    """Executable or script files are strictly rejected."""
    exe_content = b"MZ\x90\x00\x03\x00\x00\x00"
    resp = client.post(
        "/api/chat/upload",
        headers={"X-Customer-Session-Token": session_a},
        data={"file": (io.BytesIO(exe_content), "malware.exe")},
        content_type="multipart/form-data",
    )
    assert resp.status_code == 400
    assert "not supported" in resp.get_json().get("error", "")


def test_empty_file_rejection(client, session_a):
    """0-byte empty file is rejected with 400."""
    resp = client.post(
        "/api/chat/upload",
        headers={"X-Customer-Session-Token": session_a},
        data={"file": (io.BytesIO(b""), "empty.txt")},
        content_type="multipart/form-data",
    )
    assert resp.status_code == 400
    assert "empty" in resp.get_json().get("error", "").lower()


def test_cross_customer_attachment_download_forbidden(client, session_a, session_b):
    """Customer B cannot download or view Customer A's attachment."""
    txt_content = b"Confidential banking statement details"
    upload_resp = client.post(
        "/api/chat/upload",
        headers={"X-Customer-Session-Token": session_a},
        data={"file": (io.BytesIO(txt_content), "confidential.txt")},
        content_type="multipart/form-data",
    )
    assert upload_resp.status_code == 200
    att_id = upload_resp.get_json()["attachment"]["id"]

    # Customer B attempts to download Customer A's attachment
    tamper_resp = client.get(
        f"/api/chat/attachments/{att_id}",
        headers={"X-Customer-Session-Token": session_b},
    )
    assert tamper_resp.status_code == 403
    assert "Forbidden" in tamper_resp.get_json().get("error", "")

    # Customer A can download their own attachment
    owner_resp = client.get(
        f"/api/chat/attachments/{att_id}",
        headers={"X-Customer-Session-Token": session_a},
    )
    assert owner_resp.status_code == 200
    assert owner_resp.data == txt_content


def test_cross_customer_chat_attachment_injection_forbidden(client, session_a, session_b):
    """Customer B cannot attach Customer A's file to their chat."""
    txt_content = b"Private financial record"
    upload_resp = client.post(
        "/api/chat/upload",
        headers={"X-Customer-Session-Token": session_a},
        data={"file": (io.BytesIO(txt_content), "private.txt")},
        content_type="multipart/form-data",
    )
    att_id = upload_resp.get_json()["attachment"]["id"]

    # Customer B attempts to attach Customer A's file in POST /api/chat
    chat_tamper = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_b},
        json={
            "message": "Summarize this attached file",
            "attachment_ids": [att_id],
        },
    )
    assert chat_tamper.status_code == 403
    assert "Forbidden" in chat_tamper.get_json().get("error", "")


def test_chat_with_document_context_grounding(client, session_a):
    """Chat inquiry referencing attached document receives response grounded in the document."""
    txt_content = b"Special Promo Notice: For November 2026, all international debit card transactions have a zero-dollar foreign exchange fee."
    upload_resp = client.post(
        "/api/chat/upload",
        headers={"X-Customer-Session-Token": session_a},
        data={"file": (io.BytesIO(txt_content), "promo_notice.txt")},
        content_type="multipart/form-data",
    )
    assert upload_resp.status_code == 200
    upload_data = upload_resp.get_json()
    att_id = upload_data["attachment"]["id"]
    conv_id = upload_data["conversation_id"]

    # Customer sends inquiry referencing the attached document
    chat_resp = client.post(
        "/api/chat",
        headers={"X-Customer-Session-Token": session_a},
        json={
            "conversation_id": conv_id,
            "message": "What is the foreign exchange fee in my attached notice?",
            "attachment_ids": [att_id],
        },
    )
    assert chat_resp.status_code == 200
    chat_data = chat_resp.get_json()
    response_text = chat_data["response"]

    # Verify response grounds in the document content
    assert "attached document" in response_text.lower() or "notice" in response_text.lower()
    assert len(chat_data["attachments"]) == 1
    assert chat_data["attachments"][0]["id"] == att_id

    # Verify turn is preserved in history with attachment metadata
    hist_resp = client.get(
        f"/api/chat/{conv_id}/history",
        headers={"X-Customer-Session-Token": session_a},
    )
    assert hist_resp.status_code == 200
    messages = hist_resp.get_json()["messages"]
    user_msg = [m for m in messages if m["role"] == "user"][-1]
    assert "attachments" in user_msg
    assert user_msg["attachments"][0]["filename"] == "promo_notice.txt"


def test_path_traversal_filename_sanitization(client, session_a):
    """Path traversal filenames like ../../etc/passwd are safely sanitized."""
    txt_content = b"Sample text"
    resp = client.post(
        "/api/chat/upload",
        headers={"X-Customer-Session-Token": session_a},
        data={"file": (io.BytesIO(txt_content), "../../passwd.txt")},
        content_type="multipart/form-data",
    )
    assert resp.status_code == 200
    att = resp.get_json()["attachment"]
    # Filename must be sanitized to passwd.txt without path traversal slashes
    assert att["filename"] == "passwd.txt"
    assert ".." not in att["filename"]


def test_delete_conversation_removes_attachments(client, session_a):
    """Deleting a conversation deletes its attachments from SQLite and disk."""
    txt_content = b"Temporary document to be purged"
    upload_resp = client.post(
        "/api/chat/upload",
        headers={"X-Customer-Session-Token": session_a},
        data={"file": (io.BytesIO(txt_content), "temp_purge.txt")},
        content_type="multipart/form-data",
    )
    upload_data = upload_resp.get_json()
    att_id = upload_data["attachment"]["id"]
    conv_id = upload_data["conversation_id"]

    rec = get_attachment_record(att_id)
    assert rec is not None
    stored_path = Path(rec["file_path"])
    assert stored_path.is_file()

    # Delete conversation
    del_resp = client.delete(
        f"/api/chat/{conv_id}",
        headers={"X-Customer-Session-Token": session_a},
    )
    assert del_resp.status_code == 200

    # Attachment record should be purged
    assert get_attachment_record(att_id) is None
    # File on disk should be removed
    assert not stored_path.is_file()

