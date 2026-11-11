import os
import csv
import io
import re
import uuid
from pathlib import Path
from typing import Tuple, Optional, Dict, Any, List
from werkzeug.utils import secure_filename
from werkzeug.datastructures import FileStorage

from src.security.rate_limiter import sanitize_prompt_injection

ROOT = Path(__file__).resolve().parents[2]
ATTACHMENTS_DIR = ROOT / "data" / "chat_attachments"

MAX_FILE_SIZE_LOCAL = 10 * 1024 * 1024  # 10 MB for local development
MAX_FILE_SIZE_VERCEL = 4 * 1024 * 1024  # 4 MB for Vercel 4.5 MB serverless execution limit
MAX_FILE_SIZE = MAX_FILE_SIZE_LOCAL     # Backwards-compatible alias


def get_max_attachment_size() -> int:
    """Return effective maximum attachment upload size based on deployment runtime."""
    if os.environ.get("VERCEL") or os.environ.get("STORAGE_BACKEND", "").lower() == "firestore":
        return MAX_FILE_SIZE_VERCEL
    return MAX_FILE_SIZE_LOCAL

ALLOWED_EXTENSIONS = {"pdf", "txt", "csv", "jpg", "jpeg", "png"}

MIME_TYPE_MAP = {
    "pdf": "application/pdf",
    "txt": "text/plain",
    "csv": "text/csv",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
}

# Signatures for binary validation
SIGNATURES = {
    "pdf": b"%PDF-",
    "png": b"\x89PNG\r\n\x1a\n",
    "jpg": b"\xff\xd8\xff",
    "jpeg": b"\xff\xd8\xff",
}


class AttachmentValidationError(ValueError):
    """Raised when an uploaded file fails security or format validation."""
    pass


def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent path traversal, control characters, and unsafe shell characters."""
    if not filename or not isinstance(filename, str):
        return "attachment.dat"

    # Remove path traversal characters
    cleaned = filename.replace("\\", "/").split("/")[-1].strip()
    cleaned = re.sub(r'[\x00-\x1f\x7f]', '', cleaned)
    
    # Use werkzeug secure_filename
    sec_name = secure_filename(cleaned)
    if not sec_name:
        ext = cleaned.split(".")[-1].lower() if "." in cleaned else "dat"
        sec_name = f"attachment.{ext}"
    return sec_name


def validate_file_signature_and_mime(file_stream: io.BytesIO, filename: str, content_type: Optional[str] = None) -> Tuple[str, str]:
    """
    Validate extension, file header signature, and MIME type.
    Returns (normalized_extension, validated_mime_type).
    Raises AttachmentValidationError on invalid or unsafe files.
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise AttachmentValidationError(f"File extension '.{ext}' is not supported. Allowed formats: PDF, TXT, CSV, JPG, PNG.")

    pos = file_stream.tell()
    file_stream.seek(0)
    header = file_stream.read(32)
    file_stream.seek(pos)

    if not header:
        raise AttachmentValidationError("Uploaded file is empty (0 bytes).")

    # Magic signature verification
    if ext in ("jpg", "jpeg"):
        if not header.startswith(SIGNATURES["jpg"]):
            raise AttachmentValidationError("Invalid JPEG file signature.")
        mime = "image/jpeg"
    elif ext == "png":
        if not header.startswith(SIGNATURES["png"]):
            raise AttachmentValidationError("Invalid PNG file signature.")
        mime = "image/png"
    elif ext == "pdf":
        if not header.startswith(SIGNATURES["pdf"]):
            raise AttachmentValidationError("Invalid PDF file signature.")
        mime = "application/pdf"
    elif ext == "txt":
        # Ensure file contains readable text, not raw binaries
        file_stream.seek(0)
        sample = file_stream.read(2048)
        file_stream.seek(pos)
        if b"\x00" in sample:
            raise AttachmentValidationError("File contains binary null bytes and is not valid plain text.")
        try:
            sample.decode("utf-8")
        except UnicodeDecodeError:
            try:
                sample.decode("latin-1")
            except Exception:
                raise AttachmentValidationError("Unable to decode text file. Ensure it is UTF-8 or standard ASCII.")
        mime = "text/plain"
    elif ext == "csv":
        file_stream.seek(0)
        sample = file_stream.read(4096)
        file_stream.seek(pos)
        if b"\x00" in sample:
            raise AttachmentValidationError("File contains binary null bytes and is not valid CSV.")
        try:
            decoded = sample.decode("utf-8", errors="replace")
        except Exception:
            raise AttachmentValidationError("CSV text must be readable UTF-8.")
        mime = "text/csv"
    else:
        mime = MIME_TYPE_MAP.get(ext, "application/octet-stream")

    return ext, mime


def extract_document_text_from_bytes(data: bytes, ext: str) -> Tuple[Optional[str], str]:
    """
    Extract readable text content and generate an executive summary directly from in-memory bytes.
    Safe for read-only serverless environments such as Vercel.
    Returns (extracted_full_text, preview_snippet).
    """
    try:
        if ext == "txt":
            content = data[:20000].decode("utf-8", errors="replace")
            content = sanitize_prompt_injection(content)
            preview = content[:200].strip()
            return content, preview

        elif ext == "csv":
            rows = []
            text_stream = io.StringIO(data.decode("utf-8", errors="replace"))
            reader = csv.reader(text_stream)
            for i, row in enumerate(reader):
                if i > 50:  # limit to first 50 rows
                    break
                rows.append(row)

            if not rows:
                return "Empty CSV document.", "Empty CSV document."

            headers = rows[0]
            data_rows = rows[1:]
            lines = [f"CSV Headers ({len(headers)} columns): {', '.join(headers)}"]
            lines.append(f"Total Rows Analyzed: {len(data_rows)}")
            lines.append("\nTop Records:")
            for r in data_rows[:15]:
                lines.append(" | ".join(r))

            full_text = sanitize_prompt_injection("\n".join(lines))
            preview = f"CSV with {len(headers)} columns, {len(data_rows)} rows: {', '.join(headers[:5])}"
            return full_text, preview

        elif ext == "pdf":
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(data))
            num_pages = len(reader.pages)
            extracted_pages = []
            for i in range(min(num_pages, 10)):
                page = reader.pages[i]
                txt = page.extract_text() or ""
                if txt.strip():
                    extracted_pages.append(f"--- Page {i+1} ---\n{txt.strip()}")

            full_text = "\n\n".join(extracted_pages)
            if not full_text.strip():
                full_text = f"PDF Document with {num_pages} pages (no selectable text layer; scanned or flattened)."
                preview = f"PDF with {num_pages} pages (scanned/rasterized)"
            else:
                full_text = sanitize_prompt_injection(full_text)
                preview = full_text[:200].replace("\n", " ").strip()
            return full_text, preview

        elif ext in ("jpg", "jpeg", "png"):
            from PIL import Image
            with Image.open(io.BytesIO(data)) as img:
                width, height = img.size
                format_name = img.format or ext.upper()
                mode = img.mode

            summary = f"Image Attachment: {format_name} ({width}x{height} pixels, mode: {mode})"
            return summary, summary

        return None, "Binary attachment"

    except Exception as e:
        return f"Error extracting document text: {str(e)}", "Extraction error"


def extract_document_text(file_path: Path, ext: str) -> Tuple[Optional[str], str]:
    """
    Extract readable text content from a file on disk.
    Delegates to extract_document_text_from_bytes.
    """
    try:
        with open(file_path, "rb") as f:
            data = f.read()
        return extract_document_text_from_bytes(data, ext)
    except Exception as e:
        return f"Error reading document file: {str(e)}", "Extraction error"


def process_and_save_attachment(
    file_storage: FileStorage,
    conversation_id: str,
    session_token: str
) -> Dict[str, Any]:
    """
    Validate, securely save, and extract text from an uploaded attachment.
    Supports both private Vercel Blob (serverless/cloud) and local disk (SQLite).
    Ensures path traversal prevention and strict directory scoping.
    """
    from src.storage.blob_storage import is_blob_configured, upload_blob_attachment

    raw_filename = file_storage.filename or "attachment"
    safe_name = sanitize_filename(raw_filename)

    # 1. Read and validate size based on active runtime
    stream = io.BytesIO(file_storage.read())
    file_bytes = stream.getvalue()
    file_size = len(file_bytes)

    max_size = get_max_attachment_size()
    max_mb = max_size // (1024 * 1024)

    if file_size > max_size:
        raise AttachmentValidationError(
            f"File exceeds maximum allowed size of {max_mb} MB "
            f"({'Vercel cloud serverless limit is 4.5 MB' if max_mb == 4 else 'local development limit'})."
        )

    if file_size == 0:
        raise AttachmentValidationError("File is empty (0 bytes).")

    # 2. Validate signatures and MIME type
    ext, mime = validate_file_signature_and_mime(stream, safe_name, file_storage.content_type)

    attachment_id = str(uuid.uuid4())
    stored_name = f"{attachment_id}_{safe_name}"

    # 3. Extract readable document text completely in-memory
    extracted_text, preview_snippet = extract_document_text_from_bytes(file_bytes, ext)

    # 4. Storage routing: Cloud / Vercel Blob vs Local Disk
    is_cloud_backend = (
        os.environ.get("VERCEL") is not None
        or os.environ.get("STORAGE_BACKEND", "").lower() == "firestore"
    )

    if is_cloud_backend and is_blob_configured():
        # Upload directly to private Vercel Blob (no disk writes under read-only /var/task)
        blob_result = upload_blob_attachment(
            conversation_id=conversation_id,
            attachment_id=attachment_id,
            filename=safe_name,
            data=file_bytes,
            mime_type=mime,
        )

        return {
            "attachment_id": attachment_id,
            "conversation_id": conversation_id,
            "session_token": session_token,
            "original_filename": safe_name,
            "stored_filename": stored_name,
            "file_path": f"blob://{blob_result['blob_pathname']}",
            "mime_type": mime,
            "file_size": file_size,
            "extracted_text": extracted_text,
            "preview_snippet": preview_snippet,
            "storage_provider": "vercel_blob",
            "blob_pathname": blob_result["blob_pathname"],
            "blob_url": blob_result["blob_url"],
            "blob_download_url": blob_result["blob_download_url"],
            "access": "private",
        }

    # Fallback to local disk storage (SQLite mode / local development)
    conv_dir = (ATTACHMENTS_DIR / str(conversation_id)).resolve()
    target_path = (conv_dir / stored_name).resolve()

    # Strict path traversal check
    if not str(target_path).startswith(str(ATTACHMENTS_DIR.resolve())):
        raise AttachmentValidationError("Invalid file path or path traversal detected.")

    conv_dir.mkdir(parents=True, exist_ok=True)

    with open(target_path, "wb") as f:
        f.write(file_bytes)

    return {
        "attachment_id": attachment_id,
        "conversation_id": conversation_id,
        "session_token": session_token,
        "original_filename": safe_name,
        "stored_filename": stored_name,
        "file_path": str(target_path),
        "mime_type": mime,
        "file_size": file_size,
        "extracted_text": extracted_text,
        "preview_snippet": preview_snippet,
        "storage_provider": "local",
    }


def format_document_context_for_llm(attachments: List[Dict[str, Any]]) -> Optional[str]:
    """
    Format attached documents into context for chat response generation.
    Strictly private to the current conversation turn.
    """
    if not attachments:
        return None

    sections = []
    for att in attachments:
        fname = att.get("original_filename", "document")
        txt = att.get("extracted_text")
        if txt and txt.strip():
            sections.append(
                f"=== Attached Customer Document: {fname} ===\n"
                f"{txt.strip()}\n"
                f"============================================"
            )

    return "\n\n".join(sections) if sections else None

