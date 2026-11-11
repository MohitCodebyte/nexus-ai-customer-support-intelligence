import os
import re
import uuid
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone
from typing import Dict, Any, Tuple, Optional, List

from src.storage.firestore_client import get_firestore_client, is_firestore_available
from src.storage.chat_store import get_db_connection, is_firestore_active

logger = logging.getLogger("nexus.contact")

# In-memory rate limiting tracker: {ip: [timestamps]}
_IP_SUBMISSION_HISTORY: Dict[str, List[float]] = {}
MAX_SUBMISSIONS_PER_HOUR = 5
RATE_LIMIT_WINDOW_SECONDS = 3600.0

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
ADMIN_NOTIFICATION_EMAIL = "kushwahmitansh@gmail.com"


def init_contact_db():
    """Ensure contact_messages table exists in SQLite as persistent backup."""
    if is_firestore_active():
        return
    with get_db_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS contact_messages (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                company TEXT,
                phone TEXT,
                message TEXT,
                consent INTEGER DEFAULT 1,
                created_at TEXT NOT NULL,
                ip_address TEXT,
                email_notification_sent INTEGER DEFAULT 0,
                email_error TEXT
            )
        """)
        conn.commit()


def check_rate_limit(client_ip: str) -> bool:
    """Return True if request is allowed, False if rate limited."""
    now = datetime.now(timezone.utc).timestamp()
    history = _IP_SUBMISSION_HISTORY.get(client_ip, [])
    # Filter only submissions within rate limit window
    history = [ts for ts in history if now - ts < RATE_LIMIT_WINDOW_SECONDS]
    _IP_SUBMISSION_HISTORY[client_ip] = history

    if len(history) >= MAX_SUBMISSIONS_PER_HOUR:
        return False
    return True


def record_submission_attempt(client_ip: str):
    """Record timestamp of a contact submission for rate limiting."""
    now = datetime.now(timezone.utc).timestamp()
    history = _IP_SUBMISSION_HISTORY.get(client_ip, [])
    history.append(now)
    _IP_SUBMISSION_HISTORY[client_ip] = history


def validate_contact_payload(data: Dict[str, Any]) -> Tuple[bool, Optional[str], Dict[str, Any]]:
    """
    Validate contact form inputs:
    - Name: Required, 2-100 chars
    - Email: Required, valid format
    - Company: Optional, max 100 chars
    - Phone: Optional, max 30 chars
    - Message: Optional, max 3000 chars
    - Consent: Required (boolean True)
    - Honeypot: 'website' field must be empty
    """
    if not isinstance(data, dict):
        return False, "Invalid payload format. Expected JSON object.", {}

    # Honeypot spam trap
    if data.get("website") or data.get("bot_trap"):
        return False, "Spam detected.", {}

    name = str(data.get("name") or "").strip()
    if not name or len(name) < 2:
        return False, "Full Name is required (minimum 2 characters).", {}
    if len(name) > 100:
        return False, "Full Name cannot exceed 100 characters.", {}

    email = str(data.get("email") or "").strip().lower()
    if not email or not EMAIL_REGEX.match(email):
        return False, "A valid email address is required.", {}
    if len(email) > 120:
        return False, "Email address is too long.", {}

    company = str(data.get("company") or "").strip()
    if len(company) > 100:
        return False, "Company name cannot exceed 100 characters.", {}

    phone = str(data.get("phone") or "").strip()
    if len(phone) > 30:
        return False, "Phone number cannot exceed 30 characters.", {}

    message = str(data.get("message") or "").strip()
    if len(message) > 3000:
        return False, "Message cannot exceed 3000 characters.", {}

    consent = data.get("consent")
    if consent is not True and str(consent).lower() not in ("true", "1", "yes"):
        return False, "You must agree to the privacy policy to submit.", {}

    sanitized = {
        "name": name,
        "email": email,
        "company": company,
        "phone": phone,
        "message": message,
        "consent": True,
    }
    return True, None, sanitized


def get_smtp_config() -> Dict[str, Any]:
    """Retrieve SMTP configuration from environment variables."""
    username = (
        os.environ.get("MAIL_USERNAME")
        or os.environ.get("GMAIL_SENDER_EMAIL")
        or ""
    ).strip()
    password = (
        os.environ.get("MAIL_PASSWORD")
        or os.environ.get("GMAIL_APP_PASSWORD")
        or ""
    ).strip()
    recipient = (
        os.environ.get("CONTACT_RECIPIENT")
        or os.environ.get("ADMIN_NOTIFICATION_EMAIL")
        or ADMIN_NOTIFICATION_EMAIL
    ).strip()
    server = os.environ.get("MAIL_SERVER", "smtp.gmail.com").strip()
    port = int(os.environ.get("MAIL_PORT", 587))
    use_tls = os.environ.get("MAIL_USE_TLS", "true").lower() in ("true", "1", "yes")

    return {
        "username": username,
        "password": password,
        "recipient": recipient,
        "server": server,
        "port": port,
        "use_tls": use_tls,
    }


def test_smtp_connection() -> Tuple[bool, str]:
    """
    Test Gmail SMTP connectivity and authentication without exposing credentials.
    Returns (True, success_message) or (False, error_message).
    """
    cfg = get_smtp_config()
    username = cfg["username"]
    password = cfg["password"]

    if not username:
        return False, "SMTP configuration missing: MAIL_USERNAME is not set in environment."
    if not password:
        return False, "SMTP configuration missing: MAIL_PASSWORD is not set in environment."

    try:
        with smtplib.SMTP(cfg["server"], cfg["port"], timeout=10) as server:
            server.ehlo()
            if cfg["use_tls"]:
                server.starttls()
                server.ehlo()
            server.login(username, password)
        logger.info("SMTP connection and authentication verified successfully.")
        return True, "SMTP connection and credentials verified successfully with smtp.gmail.com:587."
    except smtplib.SMTPAuthenticationError:
        logger.warning("SMTP test failed: Authentication rejected.")
        return False, "SMTP authentication failed: Invalid username or app password."
    except Exception as e:
        safe_err = type(e).__name__
        logger.warning(f"SMTP test connection failed: {safe_err}")
        return False, f"SMTP connection error: {safe_err}."


def send_contact_notification_email(
    name: str,
    email: str,
    company: str,
    phone: str,
    message: str,
    message_id: str,
    created_at: str,
) -> Tuple[bool, Optional[str]]:
    """
    Send an email notification using Gmail SMTP (smtp.gmail.com:587 with STARTTLS).
    Credentials read strictly from MAIL_USERNAME / MAIL_PASSWORD environment variables.
    Returns (True, None) if successful, (False, error_message) if failed or unconfigured.
    """
    cfg = get_smtp_config()
    username = cfg["username"]
    password = cfg["password"]
    recipient = cfg["recipient"]

    if not username or not password:
        logger.info("SMTP credentials (MAIL_USERNAME/MAIL_PASSWORD) not configured. Skipping email dispatch.")
        return False, "MAIL_USERNAME or MAIL_PASSWORD not configured in backend environment."

    try:
        subject = f"[Nexus AI Contact] New Inquiry from {name} ({message_id})"
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = username
        msg["To"] = recipient

        text_body = f"""New Contact Form Submission on Nexus AI Support

Message ID: {message_id}
Submitted At: {created_at}

Name: {name}
Email: {email}
Company: {company or 'N/A'}
Phone: {phone or 'N/A'}

Message:
{message or '(No additional message provided)'}

---
Nexus AI Support Platform
Confidential Customer Inquiry
"""

        html_body = f"""<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #4f46e5 0%, #0ea5e9 100%); padding: 20px; border-radius: 12px; color: white; margin-bottom: 24px;">
    <h2 style="margin: 0 0 6px 0; font-size: 20px;">New Nexus AI Inquiry</h2>
    <p style="margin: 0; font-size: 14px; opacity: 0.9;">Message ID: {message_id}</p>
  </div>

  <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
    <tr>
      <td style="padding: 10px; font-weight: 600; width: 120px; border-bottom: 1px solid #e2e8f0; color: #475569;">Name:</td>
      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">{name}</td>
    </tr>
    <tr>
      <td style="padding: 10px; font-weight: 600; border-bottom: 1px solid #e2e8f0; color: #475569;">Email:</td>
      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><a href="mailto:{email}">{email}</a></td>
    </tr>
    <tr>
      <td style="padding: 10px; font-weight: 600; border-bottom: 1px solid #e2e8f0; color: #475569;">Company:</td>
      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">{company or 'N/A'}</td>
    </tr>
    <tr>
      <td style="padding: 10px; font-weight: 600; border-bottom: 1px solid #e2e8f0; color: #475569;">Phone:</td>
      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">{phone or 'N/A'}</td>
    </tr>
    <tr>
      <td style="padding: 10px; font-weight: 600; border-bottom: 1px solid #e2e8f0; color: #475569;">Time:</td>
      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">{created_at}</td>
    </tr>
  </table>

  <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
    <h3 style="margin: 0 0 8px 0; font-size: 15px; color: #334155;">Message Content:</h3>
    <p style="margin: 0; white-space: pre-wrap; font-size: 14px; color: #1e293b;">{message or '(No additional message provided)'}</p>
  </div>

  <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 32px;">
    Nexus AI Support Platform • Confidential Customer Inquiry
  </p>
</body>
</html>
"""

        msg.attach(MIMEText(text_body, "plain"))
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(cfg["server"], cfg["port"], timeout=10) as server:
            server.ehlo()
            if cfg["use_tls"]:
                server.starttls()
                server.ehlo()
            server.login(username, password)
            server.send_message(msg)

        logger.info(f"Contact notification email sent successfully for {message_id}")
        return True, None
    except Exception as e:
        safe_err = type(e).__name__
        logger.warning(f"Failed to send email notification via Gmail SMTP: {safe_err}")
        return False, f"SMTP dispatch failed ({safe_err})"


def save_contact_message(
    payload: Dict[str, Any],
    client_ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Process contact submission:
    1. Persist to Firestore collection 'contact_messages'
    2. Persist to SQLite backup
    3. Trigger Gmail SMTP notification
    4. Return status payload
    """
    init_contact_db()
    message_id = f"msg_{uuid.uuid4().hex[:12]}"
    created_at = datetime.now(timezone.utc).isoformat()

    name = payload["name"]
    email = payload["email"]
    company = payload.get("company", "")
    phone = payload.get("phone", "")
    message = payload.get("message", "")
    consent = 1 if payload.get("consent") else 0

    # 1. Send email notification (or report accurate status)
    email_sent, email_error = send_contact_notification_email(
        name=name,
        email=email,
        company=company,
        phone=phone,
        message=message,
        message_id=message_id,
        created_at=created_at,
    )

    # 2. Persist to Firestore if available
    firestore_persisted = False
    if is_firestore_available():
        try:
            db = get_firestore_client()
            doc_ref = db.collection("contact_messages").document(message_id)
            doc_ref.set({
                "id": message_id,
                "name": name,
                "email": email,
                "company": company,
                "phone": phone,
                "message": message,
                "consent": bool(consent),
                "created_at": created_at,
                "ip_address": client_ip or "",
                "user_agent": (user_agent or "")[:255],
                "status": "new",
                "email_notification_sent": email_sent,
                "email_error": email_error,
            })
            firestore_persisted = True
            logger.info(f"Persisted contact message {message_id} to Firestore")
        except Exception as e:
            logger.warning(f"Could not persist contact message to Firestore: {e}")

    # 3. Persist to SQLite backup table only when not running in firestore-only mode
    if not is_firestore_active():
        try:
            with get_db_connection() as conn:
                conn.execute("""
                    INSERT INTO contact_messages (
                        id, name, email, company, phone, message, consent, created_at, ip_address, email_notification_sent, email_error
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    message_id,
                    name,
                    email,
                    company,
                    phone,
                    message,
                    consent,
                    created_at,
                    client_ip,
                    1 if email_sent else 0,
                    email_error
                ))
                conn.commit()
        except Exception as sqle:
            logger.warning(f"Could not persist contact message to SQLite: {sqle}")

    return {
        "success": True,
        "message_id": message_id,
        "created_at": created_at,
        "email_sent": email_sent,
        "firestore_saved": firestore_persisted,
        "email_status": "sent" if email_sent else "pending_delivery",
        "message": (
            "Thank you! Your message has been received. Our team will review your inquiry shortly."
            if email_sent
            else "Thank you! Your inquiry has been securely registered in Nexus AI Support. Our team will get back to you shortly."
        )
    }


def list_contact_messages(limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
    """Retrieve contact messages for authorized admin inspection."""
    if is_firestore_active() or is_firestore_available():
        try:
            db = get_firestore_client()
            docs = (
                db.collection("contact_messages")
                .limit(limit)
                .get()
            )
            results = [d.to_dict() for d in docs]
            results.sort(key=lambda x: str(x.get("created_at") or ""), reverse=True)
            if results or is_firestore_active():
                return results[offset:offset + limit]
        except Exception as e:
            if is_firestore_active():
                logger.error(f"Failed to fetch contact messages from Firestore: {e}")
                return []
            logger.debug(f"Falling back to SQLite for contact messages: {e}")

    # Fallback to SQLite (only in sqlite mode)
    if not is_firestore_active():
        init_contact_db()
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, name, email, company, phone, message, consent, created_at, ip_address, email_notification_sent, email_error
                FROM contact_messages
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
            """, (limit, offset))
            rows = cursor.fetchall()

        return [
            {
                "id": r["id"],
                "name": r["name"],
                "email": r["email"],
                "company": r["company"] or "",
                "phone": r["phone"] or "",
                "message": r["message"] or "",
                "consent": bool(r["consent"]),
                "created_at": r["created_at"],
                "ip_address": r["ip_address"] or "",
                "email_notification_sent": bool(r["email_notification_sent"]),
                "email_error": r["email_error"] or "",
            }
            for r in rows
        ]
    return []

