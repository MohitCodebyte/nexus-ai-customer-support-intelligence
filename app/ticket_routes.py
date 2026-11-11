import os
from flask import Blueprint, request, jsonify, current_app

from app.unified_chat_routes import get_or_create_session_token, is_admin_request, make_secure_response
from src.storage.chat_store import (
    create_support_ticket,
    get_ticket_by_conversation,
    list_support_tickets,
    get_ticket_details,
    update_ticket,
    add_ticket_message,
    get_ticket_messages,
    verify_conversation_ownership,
    register_conversation_owner,
    get_history
)

ticket_bp = Blueprint("ticket", __name__)


# =============================================================================
# CUSTOMER ESCALATION ENDPOINTS
# =============================================================================

@ticket_bp.route("/api/support/request", methods=["POST"])
def request_human_support():
    """Customer requests human support escalation for their active conversation."""
    session_token, _ = get_or_create_session_token()
    is_admin = is_admin_request()

    body = request.get_json(silent=True) or {}
    conversation_id = str(body.get("conversation_id", "")).strip()
    reason = str(body.get("reason", "")).strip()
    customer_name = str(body.get("customer_name", "Customer")).strip()
    priority = str(body.get("priority", "normal")).strip().lower()

    if not conversation_id or not reason:
        return make_secure_response({"error": "conversation_id and reason are required"}, 400, session_token)

    # Verify customer owns the conversation being escalated
    authorized, code = verify_conversation_ownership(conversation_id, session_token, is_admin=is_admin)
    if not authorized:
        if code == "forbidden":
            return make_secure_response({"error": "Forbidden: You cannot escalate a conversation you do not own."}, 403, session_token)
        elif code == "not_found":
            # New conversation starting escalation: bind ownership to requesting customer session
            register_conversation_owner(conversation_id, session_token)

    # Check if there is already an active open/in_progress ticket for this conversation
    existing = get_ticket_by_conversation(conversation_id, session_token, is_admin=is_admin)
    if existing and existing["status"] in ("open", "in_progress", "waiting"):
        return make_secure_response({
            "status": "existing",
            "message": "A support ticket is already active for this conversation.",
            "ticket": existing,
            "session_token": session_token
        }, 200, session_token)

    ticket = create_support_ticket(
        conversation_id=conversation_id,
        session_token=session_token,
        reason=reason,
        customer_name=customer_name,
        priority=priority
    )

    return make_secure_response({
        "status": "success",
        "message": "Human support ticket created. An agent will review your inquiry.",
        "ticket": ticket,
        "session_token": session_token
    }, 201, session_token)


@ticket_bp.route("/api/support/status/<conversation_id>", methods=["GET"])
def get_customer_support_status(conversation_id):
    """Customer checks active escalation status and agent replies for a conversation."""
    session_token, _ = get_or_create_session_token()
    is_admin = is_admin_request()

    authorized, reason = verify_conversation_ownership(conversation_id, session_token, is_admin=is_admin)
    if not authorized:
        if reason == "forbidden":
            return make_secure_response({
                "error": "Forbidden: You do not have permission to access support status for this conversation."
            }, 403, session_token)
        elif reason == "not_found":
            # Check if there is a ticket for this conversation owned by this session
            ticket = get_ticket_by_conversation(conversation_id, session_token, is_admin=is_admin)
            if ticket:
                messages = get_ticket_messages(ticket["id"], include_internal=False)
                return make_secure_response({
                    "has_ticket": True,
                    "ticket": ticket,
                    "public_messages": messages,
                    "session_token": session_token
                }, 200, session_token)
            # Legitimate customer with new or unescalated conversation ID
            return make_secure_response({
                "has_ticket": False,
                "status": "none",
                "session_token": session_token
            }, 200, session_token)

    ticket = get_ticket_by_conversation(conversation_id, session_token, is_admin=is_admin)
    if not ticket:
        return make_secure_response({
            "has_ticket": False,
            "status": "none",
            "session_token": session_token
        }, 200, session_token)

    messages = get_ticket_messages(ticket["id"], include_internal=False)

    return make_secure_response({
        "has_ticket": True,
        "ticket": ticket,
        "public_messages": messages,
        "session_token": session_token
    }, 200, session_token)


# =============================================================================
# SUPPORT AGENT / ADMIN WORKSPACE ENDPOINTS
# =============================================================================

@ticket_bp.route("/api/admin/tickets", methods=["GET"])
def admin_get_tickets():
    """Agent / Admin lists support queue tickets."""
    if not is_admin_request():
        return jsonify({"error": "Access denied. Support agent or admin role required."}), 403

    status = request.args.get("status", "all")
    search = request.args.get("search", "")
    limit = int(request.args.get("limit", 50))
    offset = int(request.args.get("offset", 0))

    result = list_support_tickets(status=status, search=search, limit=limit, offset=offset)
    return jsonify(result), 200


@ticket_bp.route("/api/admin/tickets/<ticket_id>", methods=["GET"])
def admin_get_ticket_details(ticket_id):
    """Agent / Admin gets full ticket details, conversation transcript, and timeline."""
    if not is_admin_request():
        return jsonify({"error": "Access denied"}), 403

    ticket = get_ticket_details(ticket_id)
    if not ticket:
        return jsonify({"error": "Ticket not found"}), 404

    # Also load the customer's full conversation transcript
    history = get_history(ticket["conversation_id"], is_admin=True) or []
    ticket["conversation_transcript"] = history

    return jsonify(ticket), 200


@ticket_bp.route("/api/admin/tickets/<ticket_id>", methods=["PATCH"])
def admin_update_ticket(ticket_id):
    """Agent / Admin updates ticket status, priority, or assigns agent."""
    if not is_admin_request():
        return jsonify({"error": "Access denied"}), 403

    body = request.get_json(silent=True) or {}
    status = body.get("status")
    assigned_agent = body.get("assigned_agent")
    priority = body.get("priority")

    success = update_ticket(ticket_id, status=status, assigned_agent=assigned_agent, priority=priority)
    if not success:
        return jsonify({"error": "Ticket not found or no valid updates provided"}), 400

    # If status changed, record system message in ticket timeline
    if status:
        ticket = get_ticket_details(ticket_id)
        if ticket:
            add_ticket_message(
                ticket_id=ticket_id,
                conversation_id=ticket["conversation_id"],
                sender_role="system",
                sender_name="System",
                message=f"Ticket status changed to: {status.upper()}",
                is_internal_note=False
            )

    return jsonify({"status": "success", "message": "Ticket updated"}), 200


@ticket_bp.route("/api/admin/tickets/<ticket_id>/reply", methods=["POST"])
def admin_ticket_reply(ticket_id):
    """
    Support agent posts reply to the customer or internal note.
    Public replies appear directly in the customer chat transcript!
    """
    if not is_admin_request():
        return jsonify({"error": "Access denied"}), 403

    ticket = get_ticket_details(ticket_id)
    if not ticket:
        return jsonify({"error": "Ticket not found"}), 404

    body = request.get_json(silent=True) or {}
    message = str(body.get("message", "")).strip()
    sender_name = str(body.get("sender_name", "Support Agent")).strip()
    is_internal_note = bool(body.get("is_internal_note", False))

    if not message:
        return jsonify({"error": "Reply message cannot be empty"}), 400

    msg_record = add_ticket_message(
        ticket_id=ticket_id,
        conversation_id=ticket["conversation_id"],
        sender_role="agent",
        sender_name=sender_name,
        message=message,
        is_internal_note=is_internal_note
    )

    return jsonify({
        "status": "success",
        "message": "Internal note saved" if is_internal_note else "Reply sent to customer chat",
        "record": msg_record
    }), 201

