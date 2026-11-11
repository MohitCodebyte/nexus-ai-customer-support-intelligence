import logging
from flask import Blueprint, request, jsonify

from src.services.contact_service import (
    validate_contact_payload,
    check_rate_limit,
    record_submission_attempt,
    save_contact_message,
    list_contact_messages,
    test_smtp_connection,
)
from app.admin_routes import is_authenticated_admin

logger = logging.getLogger("nexus.contact_routes")

contact_bp = Blueprint("contact", __name__)


@contact_bp.route("/api/contact", methods=["POST"])
def submit_contact_form():
    """
    Public contact form submission endpoint.
    - Rate limits by client IP (max 5 per hour)
    - Validates name, email, company, phone, message, privacy consent
    - Persists message to Firestore (collection: contact_messages) + SQLite backup
    - Attempts Gmail SMTP notification if configured
    """
    client_ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "127.0.0.1"
    if "," in client_ip:
        client_ip = client_ip.split(",")[0].strip()

    # 1. Rate limiting check
    if not check_rate_limit(client_ip):
        logger.warning(f"Rate limit exceeded for contact form submission from IP: {client_ip}")
        return jsonify({
            "error": "Too many contact submissions from your address. Please wait an hour before submitting again."
        }), 429

    # 2. Extract payload
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "Request body must be valid JSON."}), 400

    # 3. Validate and sanitize
    is_valid, error_msg, sanitized_data = validate_contact_payload(body)
    if not is_valid:
        return jsonify({"error": error_msg}), 400

    # 4. Record submission attempt for rate limiting
    record_submission_attempt(client_ip)

    # 5. Persist and send notification
    user_agent = request.headers.get("User-Agent", "")
    result = save_contact_message(
        payload=sanitized_data,
        client_ip=client_ip,
        user_agent=user_agent,
    )

    return jsonify(result), 201


@contact_bp.route("/api/admin/contact-messages", methods=["GET"])
def get_admin_contact_messages():
    """
    Admin endpoint to inspect received contact messages.
    Protected by existing admin authentication (X-Admin-Session, cookie, or X-Admin-Key).
    """
    if not is_authenticated_admin():
        return jsonify({"error": "Unauthorized. Admin privileges required."}), 401

    limit = min(int(request.args.get("limit", 50)), 100)
    offset = max(int(request.args.get("offset", 0)), 0)

    messages = list_contact_messages(limit=limit, offset=offset)
    return jsonify({
        "messages": messages,
        "count": len(messages),
        "limit": limit,
        "offset": offset,
    }), 200


@contact_bp.route("/api/admin/test-smtp", methods=["POST"])
def admin_test_smtp():
    """
    Protected admin endpoint to test Gmail SMTP connection and credentials.
    Never exposes passwords, tokens or credentials in responses or logs.
    """
    if not is_authenticated_admin():
        return jsonify({"error": "Unauthorized. Admin privileges required."}), 401

    success, message = test_smtp_connection()
    status_code = 200 if success else 503
    return jsonify({
        "success": success,
        "message": message,
    }), status_code


