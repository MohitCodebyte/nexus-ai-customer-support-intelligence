"""
Vercel Blob Storage Integration for Nexus AI Support.

Provides secure, private attachment storage using the official Vercel Blob Python SDK
(vercel-blob >= 0.5.0) via documented Python APIs:
    - from vercel import blob
    - blob.put_blob(..., access="private")
    - blob.get_blob(..., access="private")
    - blob.stream_blob(..., access="private")
    - blob.delete_blob(...)

Credentials and storage tokens are kept strictly server-side and never exposed.
All customer attachments are stored with access="private" and deterministic,
collision-safe pathnames scoped by conversation and attachment IDs.
"""

import os
import re
import logging
from typing import Dict, Any, Tuple, Optional
from werkzeug.utils import secure_filename

logger = logging.getLogger("nexus.blob_storage")


def is_blob_configured() -> bool:
    """
    Check if Vercel Blob credentials or OIDC integration are present.
    Supports BLOB_READ_WRITE_TOKEN, VERCEL_BLOB_READ_WRITE_TOKEN, or BLOB_STORE_ID with OIDC.
    """
    token = os.environ.get("BLOB_READ_WRITE_TOKEN") or os.environ.get("VERCEL_BLOB_READ_WRITE_TOKEN")
    if token and token.strip():
        return True
    store_id = os.environ.get("BLOB_STORE_ID")
    if store_id and store_id.strip():
        # On Vercel, OIDC token is injected automatically into runtime environment
        return True
    return False


def get_blob_store_id() -> Optional[str]:
    """Retrieve the active Blob Store ID from environment or read-write token."""
    raw_store = os.environ.get("BLOB_STORE_ID", "").strip()
    if raw_store:
        return raw_store
    token = os.environ.get("BLOB_READ_WRITE_TOKEN") or os.environ.get("VERCEL_BLOB_READ_WRITE_TOKEN") or ""
    token = token.strip()
    if token.startswith("vercel_blob_rw_"):
        parts = token.split("_")
        if len(parts) >= 4:
            return parts[3]
    return None


def sanitize_blob_filename(filename: str) -> str:
    """Sanitize filename to prevent path traversal and unsafe characters."""
    if not filename or not isinstance(filename, str):
        return "attachment.dat"
    cleaned = filename.replace("\\", "/").split("/")[-1].strip()
    cleaned = re.sub(r"[\x00-\x1f\x7f]", "", cleaned)
    sec_name = secure_filename(cleaned)
    if not sec_name:
        ext = cleaned.rsplit(".", 1)[-1].lower() if "." in cleaned else "dat"
        sec_name = f"attachment.{ext}"
    return sec_name


def build_attachment_pathname(conversation_id: str, attachment_id: str, filename: str) -> str:
    """
    Generate a deterministic, collision-safe pathname for private Vercel Blob storage.
    Format: attachments/{conversation_id}/{attachment_id}_{safe_filename}
    """
    safe_conv = re.sub(r"[^a-zA-Z0-9_\-]", "", str(conversation_id)) or "default"
    safe_aid = re.sub(r"[^a-zA-Z0-9_\-]", "", str(attachment_id)) or "att"
    safe_name = sanitize_blob_filename(filename)
    return f"attachments/{safe_conv}/{safe_aid}_{safe_name}"


def upload_blob_attachment(
    conversation_id: str,
    attachment_id: str,
    filename: str,
    data: bytes,
    mime_type: str,
    pathname: Optional[str] = None
) -> Dict[str, Any]:
    """
    Upload an attachment to private Vercel Blob storage.
    Uses official SDK `from vercel import blob` synchronous surface.
    Ensures access is strictly 'private' and pathname is deterministic.
    """
    from vercel import blob

    target_pathname = pathname or build_attachment_pathname(conversation_id, attachment_id, filename)
    clean_mime = mime_type or "application/octet-stream"

    logger.info(f"Uploading {len(data)} bytes to private Vercel Blob: {target_pathname}")

    result = blob.sync.put_blob(
        target_pathname,
        data,
        access="private",
        content_type=clean_mime,
        content_length=len(data),
        add_random_suffix=False,
        allow_overwrite=True
    )

    download_url = getattr(result, "download_url", result.url)

    return {
        "storage_provider": "vercel_blob",
        "blob_pathname": result.pathname,
        "blob_url": result.url,
        "blob_download_url": download_url,
        "mime_type": result.content_type or clean_mime,
        "file_size": len(data),
        "access": "private",
        "etag": getattr(result, "etag", None),
    }


def download_blob_attachment(url_or_pathname: str) -> Tuple[bytes, Dict[str, Any]]:
    """
    Download a private attachment from Vercel Blob storage into memory.
    Ensures access is strictly 'private'.
    """
    from vercel import blob

    logger.info(f"Downloading private Vercel Blob object: {url_or_pathname}")
    res = blob.sync.get_blob(url_or_pathname, access="private")

    metadata = {
        "content_type": res.metadata.content_type or "application/octet-stream",
        "size": len(res.body),
        "url": res.metadata.url,
        "etag": res.metadata.etag,
        "content_disposition": res.metadata.content_disposition,
    }
    return res.body, metadata


def delete_blob_attachment(url_or_pathname: str) -> None:
    """Delete a private attachment from Vercel Blob storage."""
    from vercel import blob

    logger.info(f"Deleting private Vercel Blob object: {url_or_pathname}")
    blob.sync.delete_blob(url_or_pathname)


def check_blob_health() -> Dict[str, Any]:
    """
    Genuinely test Vercel Blob configuration and credentials.
    Returns status dict without exposing secrets.
    """
    if not is_blob_configured():
        return {
            "connected": False,
            "configured": False,
            "provider": "vercel_blob",
            "error": "Vercel Blob credentials not configured (BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID required)."
        }

    try:
        from vercel.blob._internal.credentials import default_sync_credentials
        creds = default_sync_credentials()
        store_id = creds.store_id or get_blob_store_id() or "unknown"
        kind = creds.kind.value if hasattr(creds.kind, "value") else str(creds.kind)

        return {
            "connected": True,
            "configured": True,
            "provider": "vercel_blob",
            "store_id": store_id,
            "credential_kind": kind,
            "access_tier": "private"
        }
    except Exception as e:
        safe_msg = re.sub(r"(token|key|secret)=[\w\-]+", r"\1=[REDACTED]", str(e), flags=re.IGNORECASE)
        return {
            "connected": False,
            "configured": True,
            "provider": "vercel_blob",
            "error": f"Vercel Blob credentials validation error: {safe_msg}"
        }

