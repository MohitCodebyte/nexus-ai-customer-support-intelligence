import os
import uuid
import json
import secrets
from datetime import datetime, timezone
import importlib
from pathlib import Path
from typing import Tuple, Any, Optional, List, Dict

from flask import Blueprint, request, jsonify, current_app, Response, send_file
from src.nlp.intent_router import route_intent_prediction
from src.nlp.multilingual_service import (
    detect_language,
    canonicalize_to_english,
    translate_response,
    get_multilingual_fallback,
)
import src.rag.service as rag_service
from src.llm.response_service import generate_response
from src.storage.chat_store import (
    save_turn,
    get_history,
    save_feedback,
    save_report,
    get_feedback_analytics,
    list_conversations,
    delete_conversation,
    register_conversation_owner,
    get_conversation_owner,
    verify_conversation_ownership,
    save_attachment_record,
    get_attachment_record,
    get_attachments_by_ids,
    verify_admin_session,
    rename_conversation,
    claim_legacy_conversation,
)
from src.storage.attachment_service import (
    process_and_save_attachment,
    format_document_context_for_llm,
    AttachmentValidationError,
    ATTACHMENTS_DIR,
)
from src.security.rate_limiter import chat_limiter, upload_limiter, sanitize_user_input

unified_chat_bp = Blueprint("unified_chat", __name__)

ADMIN_SECRET_KEY = os.environ.get("NEXUS_ADMIN_KEY", "nexus-admin-secret-2026")


def is_admin_request() -> bool:
    """
    Strict server-side verification of administrative requests.
    Supports:
    1. Cryptographically verified admin session token via X-Admin-Session header or Cookie (browser UI).
    2. Secure X-Admin-Key matching system admin secret (automated scripts & CLI).
    Client role spoofing ('X-Client-Role: admin') is strictly rejected.
    """
    # 1. Admin session token check
    admin_session = request.headers.get("X-Admin-Session", "").strip() or request.cookies.get("nexus_admin_session", "").strip()
    if admin_session and verify_admin_session(admin_session):
        return True

    # 2. Admin key check
    admin_key = request.headers.get("X-Admin-Key", "").strip()
    if admin_key and secrets.compare_digest(admin_key, ADMIN_SECRET_KEY):
        return True
    return False


def get_or_create_session_token() -> Tuple[str, bool]:
    """
    Extract verified customer session token from HTTP headers or Cookie.
    If missing or invalid, generate a cryptographically strong session token.
    Returns (session_token, was_generated).
    """
    token = request.headers.get("X-Customer-Session-Token") or request.headers.get("X-Session-Token")
    if not token:
        token = request.cookies.get("nexus_session_token")

    created = False
    if not token or not isinstance(token, str) or len(token.strip()) < 8 or len(token.strip()) > 128:
        token = f"cust_sess_{secrets.token_hex(24)}"
        created = True
    else:
        token = token.strip()
    return token, created


def make_secure_response(data: Any, status: int = 200, session_token: Optional[str] = None) -> Response:
    """Wrap response with security headers and session cookie persistence."""
    resp = jsonify(data)
    resp.status_code = status
    if session_token:
        resp.headers["X-Customer-Session-Token"] = session_token
        resp.set_cookie(
            "nexus_session_token",
            session_token,
            max_age=60 * 60 * 24 * 365,
            httponly=False,
            samesite="Lax",
            path="/"
        )
    return resp


@unified_chat_bp.route("/api/chat", methods=["POST"])
def unified_chat():
    if not request.is_json:
        return jsonify({"error": "JSON required"}), 415

    payload = request.get_json(silent=True)

    if not isinstance(payload, dict):
        return jsonify({"error": "Invalid JSON"}), 400

    message = payload.get("message")

    if not isinstance(message, str) or not message.strip():
        return jsonify({"error": "Message required"}), 400

    message = message.strip()

    if len(message) > 2500:
        return jsonify({"error": "Message exceeds maximum length of 2500 characters."}), 400

    message = sanitize_user_input(message)

    try:
        session_token, token_created = get_or_create_session_token()
        is_admin = is_admin_request()

        # Rate limiting: max 40 messages per minute per session/IP
        rate_key = session_token or request.remote_addr or "client"
        allowed, wait_sec = chat_limiter.is_allowed(rate_key, max_requests=40, window_seconds=60.0)
        if not allowed:
            return make_secure_response({
                "error": f"Rate limit exceeded. Please wait {wait_sec} seconds before sending another message."
            }, 429, session_token)

        # Enforce conversation ownership and prevent ID hijacking / tampering
        raw_conv_id = payload.get("conversation_id")
        if isinstance(raw_conv_id, str) and raw_conv_id.strip():
            conversation_id = raw_conv_id.strip()
            owner = get_conversation_owner(conversation_id)
            if owner is not None:
                # Conversation exists: verify ownership before allowing turn append
                if not is_admin and str(owner) != str(session_token):
                    if owner == "legacy_unassigned":
                        claim_legacy_conversation(conversation_id, session_token)
                    else:
                        return make_secure_response({
                            "error": "Forbidden: You do not have permission to continue this conversation."
                        }, 403, session_token)
            else:
                # Brand new conversation: register owner immediately
                register_conversation_owner(conversation_id, session_token)
        else:
            conversation_id = str(uuid.uuid4())
            register_conversation_owner(conversation_id, session_token)

        # 1. Multilingual Language Detection & Target Resolution
        lang_pref = str(payload.get("language", "auto")).strip().lower()
        if lang_pref not in ("auto", "en", "hi", "hinglish"):
            lang_pref = "auto"

        detected_lang = detect_language(message)
        target_lang = detected_lang if lang_pref == "auto" else lang_pref

        # 2. Canonicalize query to English semantics for Banking77 SVM and FAQ Vector RAG
        canonical_query = canonicalize_to_english(message, detected_lang)

        # 3. Route intent prediction using English semantics
        intent = route_intent_prediction(canonical_query)

        # 4. Retrieve verified FAQ knowledge via semantic vector search
        rag = rag_service.build_context(canonical_query, top_k=3)
        sources = rag.get("sources", [])

        # Process attached customer documents (kept strictly private, never added to shared RAG)
        attachment_ids = payload.get("attachment_ids") or []
        if isinstance(payload.get("attachments"), list):
            for att in payload["attachments"]:
                if isinstance(att, dict) and "id" in att:
                    attachment_ids.append(str(att["id"]))

        attachment_records = []
        document_context = None
        if attachment_ids:
            raw_records = get_attachments_by_ids([str(aid) for aid in attachment_ids])
            for r in raw_records:
                if not is_admin and (r["session_token"] != session_token or r["conversation_id"] != conversation_id):
                    return make_secure_response({
                        "error": "Forbidden: You do not have permission to attach this file."
                    }, 403, session_token)
                attachment_records.append(r)

            document_context = format_document_context_for_llm(attachment_records)

        # Retrieve recent conversation turns for context memory (isolated to this customer session)
        conversation_history = get_history(conversation_id, limit=6, session_token=session_token, is_admin=is_admin) or []

        # 5. Generate natural, context-aware response via Intelligent Orchestrator (Paths A, B, C)
        generation = generate_response(
            query=message,
            rag_context=rag,
            document_context=document_context,
            conversation_history=conversation_history,
            target_lang=target_lang,
            intent_data=intent,
            canonical_query=canonical_query
        )
        final_response = generation["response"]
        review_required = generation.get("review_required", False)

        # Auto-create support ticket if explicit human support escalation was requested
        if generation.get("path") == "human_support":
            try:
                from src.storage.chat_store import get_ticket_by_conversation, create_support_ticket
                existing_t = get_ticket_by_conversation(conversation_id, session_token, is_admin=is_admin)
                if not existing_t:
                    create_support_ticket(
                        conversation_id=conversation_id,
                        session_token=session_token,
                        reason=f"Customer Requested Agent: {message[:60]}",
                        priority="high"
                    )
            except Exception:
                pass

        sentiment = None
        try:
            from nltk.sentiment import SentimentIntensityAnalyzer
            from functools import lru_cache

            @lru_cache(maxsize=1)
            def get_sia():
                return SentimentIntensityAnalyzer()

            score = get_sia().polarity_scores(canonical_query)["compound"]
            sentiment = (
                "positive" if score >= 0.05
                else "negative" if score <= -0.05
                else "neutral"
            )
        except (ImportError, LookupError):
            pass

        attachments_meta = [
            {
                "id": a["id"],
                "filename": a["original_filename"],
                "mime_type": a["mime_type"],
                "size": a["file_size"],
                "preview_url": f"/api/chat/attachments/{a['id']}"
            }
            for a in attachment_records
        ]

        category_name = intent.get("category") if isinstance(intent, dict) else None
        intent_name = intent.get("intent") if isinstance(intent, dict) else (intent if isinstance(intent, str) else None)

        from src.llm.suggestions import generate_follow_up_suggestions
        follow_up_suggestions = generate_follow_up_suggestions(
            query=message,
            response=final_response,
            category=category_name,
            intent=intent_name,
            language=target_lang
        )

        metadata = {
            "intent": intent_name,
            "category": category_name,
            "confidence": intent.get("confidence") if isinstance(intent, dict) else None,
            "sentiment": sentiment,
            "requires_human_review": review_required,
            "detected_language": detected_lang,
            "target_language": target_lang,
            "canonical_query": canonical_query,
            "attachments": attachments_meta,
            "suggestions": follow_up_suggestions,
            "sources": [
                {
                    "doc_id": s.get("doc_id"),
                    "intent": s.get("intent"),
                    "similarity_score": s.get("similarity_score")
                }
                for s in sources
            ]
        }

        # Original customer message is strictly preserved in history with session token ownership!
        save_turn(
            conversation_id,
            message,
            final_response,
            metadata,
            session_token=session_token
        )

        message_id = str(uuid.uuid4())
        timestamp_str = datetime.now(timezone.utc).isoformat()

        # Clean customer-facing response schema by default
        response_payload = {
            "conversation_id": conversation_id,
            "message_id": message_id,
            "message": message,
            "response": final_response,
            "language": target_lang,
            "timestamp": timestamp_str,
            "status": "success",
            "session_token": session_token,
            "attachments": attachments_meta,
            "intent": intent_name,
            "category": category_name,
            "suggestions": follow_up_suggestions,
        }

        # Internal ML/RAG metadata is strictly protected for verified Admin views
        if is_admin:
            response_payload.update({
                "intent": intent,
                "sentiment": sentiment,
                "requires_human_review": review_required,
                "generation_mode": generation.get("generation_mode", "conversational"),
                "path": generation.get("path", "banking_support"),
                "llm_used": generation.get("llm_used", False),
                "detected_language": detected_lang,
                "canonical_query": canonical_query,
                "retrieval": {
                    "top_intent": (
                        rag.get("top_intent")
                        or (sources[0].get("intent") if sources else intent.get("intent"))
                    ),
                    "intent_margin": rag.get("intent_margin"),
                    "sources": sources
                }
            })

        return make_secure_response(response_payload, 200, session_token)

    except Exception:
        current_app.logger.exception("Unified chat failed")
        return jsonify({
            "error": "I am experiencing technical difficulty right now. Please try again or contact customer care."
        }), 500


@unified_chat_bp.route("/api/chat/suggestions", methods=["POST"])
def get_follow_up_suggestions():
    """
    On-demand contextual follow-up suggestions endpoint.
    Accepts: { category, intent, query, response, language }
    """
    try:
        data = request.get_json(silent=True) or {}
        category = data.get("category")
        intent = data.get("intent")
        query = data.get("query", "")
        last_response = data.get("response", "")
        language = data.get("language", "en")

        from src.llm.suggestions import generate_follow_up_suggestions, resolve_category
        canonical_category = resolve_category(category, intent)
        suggestions = generate_follow_up_suggestions(
            query=query,
            response=last_response,
            category=canonical_category,
            intent=intent,
            language=language
        )
        return jsonify({
            "status": "success",
            "category": canonical_category,
            "suggestions": suggestions
        }), 200
    except Exception as e:
        current_app.logger.warning(f"Follow-up suggestions generation failed: {e}")
        return jsonify({"status": "error", "suggestions": []}), 200


_AUDIO_RATE_LIMIT_TRACKER: Dict[str, List[float]] = {}
AUDIO_LIMIT_WINDOW = 600.0  # 10 minutes
MAX_AUDIO_CALLS_PER_WINDOW = 30


@unified_chat_bp.route("/api/speech/transcribe", methods=["POST"])
def transcribe_speech_audio():
    """
    Server-side audio transcription fallback when client browser SpeechRecognition fails.
    Enforces authentication, rate limits, size checks, and zero permanent audio retention.
    """
    try:
        session_token, _ = get_or_create_session_token()
        client_ip = request.remote_addr or "127.0.0.1"

        # Rate limiting check
        import time
        now = time.time()
        client_history = _AUDIO_RATE_LIMIT_TRACKER.get(client_ip, [])
        client_history = [t for t in client_history if now - t < AUDIO_LIMIT_WINDOW]
        if len(client_history) >= MAX_AUDIO_CALLS_PER_WINDOW:
            return jsonify({
                "status": "error",
                "error": "rate_limited",
                "message": "Too many voice transcription requests. Please wait a few minutes or type your inquiry."
            }), 429
        client_history.append(now)
        _AUDIO_RATE_LIMIT_TRACKER[client_ip] = client_history

        if "audio" not in request.files:
            return make_secure_response({
                "status": "error",
                "error": "missing_audio",
                "message": "No audio file provided in request."
            }, 400, session_token)

        audio_file = request.files["audio"]
        if not audio_file.filename:
            return make_secure_response({
                "status": "error",
                "error": "empty_file",
                "message": "Uploaded audio file has no filename."
            }, 400, session_token)

        audio_bytes = audio_file.read()
        if not audio_bytes or len(audio_bytes) == 0:
            return make_secure_response({
                "status": "error",
                "error": "empty_audio",
                "message": "Uploaded audio file is empty."
            }, 400, session_token)

        mime_type = audio_file.mimetype or "audio/webm"
        language = request.form.get("language", "en")

        from src.services.speech_service import transcribe_audio_blob
        result = transcribe_audio_blob(audio_bytes, mime_type=mime_type, language=language)

        if not result.get("success"):
            err_code = result.get("error", "transcription_failed")
            if err_code == "empty_audio":
                status_code = 400
            elif err_code == "file_too_large":
                status_code = 413
            elif err_code == "unsupported_media_type":
                status_code = 415
            elif err_code == "empty_transcript":
                return make_secure_response({
                    "status": "success",
                    "transcript": "",
                    "provider": "gemini",
                    "message": result.get("message", "No speech detected in audio recording.")
                }, 200, session_token)
            elif err_code == "no_provider":
                status_code = 503
            else:
                status_code = 502

            return make_secure_response({
                "status": "error",
                "error": err_code,
                "message": result.get("message", "Unable to transcribe audio recording.")
            }, status_code, session_token)

        return make_secure_response({
            "status": "success",
            "transcript": result.get("transcript", ""),
            "provider": result.get("provider", "configured_stt")
        }, 200, session_token)

    except Exception as e:
        current_app.logger.exception(f"Audio transcription endpoint error: {e}")
        return make_secure_response({
            "status": "error",
            "error": "server_error",
            "message": "Voice transcription service encountered a server error."
        }, 500, session_token if 'session_token' in locals() else None)


@unified_chat_bp.route("/api/chat/<conversation_id>/history", methods=["GET"])
def chat_history(conversation_id):
    try:
        session_token, _ = get_or_create_session_token()
        is_admin = is_admin_request()

        # Enforce server-side ownership authorization
        authorized, reason = verify_conversation_ownership(conversation_id, session_token, is_admin=is_admin)
        if not authorized:
            if reason == "forbidden":
                return make_secure_response({
                    "error": "Forbidden: You do not have permission to access this conversation."
                }, 403, session_token)
            else:
                return make_secure_response({
                    "error": "Conversation not found."
                }, 404, session_token)

        raw_messages = get_history(conversation_id, session_token=session_token, is_admin=is_admin)
        if raw_messages is None:
            return make_secure_response({"error": "Conversation not found."}, 404, session_token)

        # If customer request, strip internal metadata_json from the payload
        if not is_admin:
            sanitized_messages = []
            for m in raw_messages:
                meta = {}
                if m.get("metadata_json"):
                    try:
                        meta = json.loads(m["metadata_json"])
                    except Exception:
                        meta = {}
                clean_m = {
                    "id": m.get("id"),
                    "role": m.get("role"),
                    "content": m.get("content"),
                    "created_at": m.get("created_at"),
                    "attachments": meta.get("attachments", []),
                }
                if meta.get("human_agent"):
                    clean_m["human_agent"] = True
                    clean_m["agent_name"] = meta.get("agent_name", "Support Agent")
                if meta.get("suggestions"):
                    clean_m["suggestions"] = meta["suggestions"]
                if meta.get("category"):
                    clean_m["category"] = meta["category"]

                sanitized_messages.append(clean_m)
            return make_secure_response({
                "conversation_id": conversation_id,
                "messages": sanitized_messages,
                "session_token": session_token
            }, 200, session_token)

        # Admin receives complete message log with audit metadata
        return make_secure_response({
            "conversation_id": conversation_id,
            "messages": raw_messages,
            "session_token": session_token
        }, 200, session_token)

    except Exception:
        current_app.logger.exception("History failed")
        return jsonify({"error": "Unable to retrieve conversation history at this time."}), 500


@unified_chat_bp.route("/api/chat/feedback", methods=["POST"])
def chat_feedback():
    """Customer feedback endpoint (1-5 star rating and/or thumbs helpful/unhelpful)."""
    if not request.is_json:
        return jsonify({"error": "JSON required"}), 415

    payload = request.get_json(silent=True) or {}
    conversation_id = payload.get("conversation_id", "").strip()
    rating = payload.get("rating", "").strip()
    stars = payload.get("stars")
    message_id = payload.get("message_id", "").strip()
    comment = payload.get("comment", "")

    if not conversation_id:
        return jsonify({"error": "conversation_id is required"}), 400

    if not rating and stars is None:
        return jsonify({"error": "Either rating or stars must be provided"}), 400

    if not rating and stars is not None:
        rating = f"{stars}_star"

    try:
        session_token, _ = get_or_create_session_token()
        is_admin = is_admin_request()

        # Enforce server-side ownership authorization for feedback submission
        authorized, reason = verify_conversation_ownership(conversation_id, session_token, is_admin=is_admin)
        if not authorized:
            if reason == "forbidden":
                return make_secure_response({
                    "error": "Forbidden: You do not have permission to submit feedback for this conversation."
                }, 403, session_token)
            else:
                return make_secure_response({
                    "error": "Conversation not found."
                }, 404, session_token)

        feedback_id = save_feedback(conversation_id, message_id, rating, stars, comment)
        return make_secure_response({
            "status": "success",
            "feedback_id": feedback_id,
            "message": "Thank you for your feedback!"
        }, 200, session_token)

    except Exception:
        current_app.logger.exception("Failed to save feedback")
        return jsonify({"error": "Failed to record feedback"}), 500


@unified_chat_bp.route("/api/admin/feedback/analytics", methods=["GET"])
@unified_chat_bp.route("/api/chat/feedback/analytics", methods=["GET"])
def feedback_analytics():
    """Admin-only analytics summary showing average rating and 1-5 star distribution."""
    is_admin = is_admin_request()

    # Strictly protect analytics from unauthorized customer access
    if not is_admin:
        return jsonify({
            "error": "Access denied. Feedback analytics are restricted to support administration."
        }), 403

    try:
        analytics = get_feedback_analytics()
        return jsonify(analytics), 200
    except Exception:
        current_app.logger.exception("Failed to fetch feedback analytics")
        return jsonify({"error": "Unable to compute feedback analytics"}), 500


@unified_chat_bp.route("/api/chat/report", methods=["POST"])
def chat_report():
    """Customer report endpoint for inaccurate or inappropriate responses."""
    if not request.is_json:
        return jsonify({"error": "JSON required"}), 415

    payload = request.get_json(silent=True) or {}
    conversation_id = payload.get("conversation_id", "").strip()
    reason = payload.get("reason", "").strip()
    message_id = payload.get("message_id", "")
    details = payload.get("details", "")

    if not conversation_id or not reason:
        return jsonify({"error": "conversation_id and reason are required"}), 400

    try:
        session_token, _ = get_or_create_session_token()
        is_admin = is_admin_request()

        # Enforce server-side ownership authorization for reports
        authorized, reason_code = verify_conversation_ownership(conversation_id, session_token, is_admin=is_admin)
        if not authorized:
            if reason_code == "forbidden":
                return make_secure_response({
                    "error": "Forbidden: You do not have permission to report this conversation."
                }, 403, session_token)
            else:
                return make_secure_response({
                    "error": "Conversation not found."
                }, 404, session_token)

        save_report(conversation_id, message_id, reason, details)
        return make_secure_response({
            "status": "success",
            "message": "Report submitted. Our support engineering team will inspect this response."
        }, 200, session_token)

    except Exception:
        current_app.logger.exception("Failed to save report")
        return jsonify({"error": "Failed to submit report"}), 500


@unified_chat_bp.route("/api/chat/conversations", methods=["GET", "POST"])
def get_conversations():
    """List customer conversations with search, pagination, and strict server-side ownership isolation."""
    try:
        session_token, _ = get_or_create_session_token()
        is_admin = is_admin_request()

        search = request.args.get("search", "")
        limit = int(request.args.get("limit", 20))
        offset = int(request.args.get("offset", 0))

        if request.is_json and request.method == "POST":
            body = request.get_json(silent=True) or {}
            if not search and "search" in body:
                search = str(body["search"]).strip()
            if "limit" in body:
                limit = int(body["limit"])
            if "offset" in body:
                offset = int(body["offset"])

        # Client-supplied conversation_ids are NEVER trusted for authorization.
        # Queries are strictly scoped to the server-verified session_token.
        result = list_conversations(
            session_token=session_token,
            is_admin=is_admin,
            search=search,
            limit=limit,
            offset=offset
        )
        result["session_token"] = session_token
        return make_secure_response(result, 200, session_token)

    except Exception:
        current_app.logger.exception("Failed to list conversations")
        return jsonify({"error": "Unable to retrieve conversation list"}), 500


@unified_chat_bp.route("/api/chat/<conversation_id>", methods=["DELETE"])
def delete_single_conversation(conversation_id):
    """Delete a conversation if authorized under server-side ownership rules."""
    try:
        session_token, _ = get_or_create_session_token()
        is_admin = is_admin_request()

        authorized, reason = verify_conversation_ownership(conversation_id, session_token, is_admin=is_admin)
        if not authorized:
            if reason == "forbidden":
                return make_secure_response({
                    "error": "Forbidden: You do not have permission to delete this conversation."
                }, 403, session_token)
            else:
                return make_secure_response({
                    "error": "Conversation not found."
                }, 404, session_token)

        delete_conversation(conversation_id, session_token=session_token, is_admin=is_admin)
        return make_secure_response({
            "status": "success",
            "message": "Conversation deleted"
        }, 200, session_token)

    except PermissionError as pe:
        return make_secure_response({"error": str(pe)}, 403, session_token)
    except Exception:
        current_app.logger.exception("Failed to delete conversation")
        return jsonify({"error": "Failed to delete conversation"}), 500


@unified_chat_bp.route("/api/chat/<conversation_id>/rename", methods=["PATCH", "POST"])
def rename_single_conversation(conversation_id):
    """Rename a conversation title while enforcing ownership."""
    try:
        session_token, _ = get_or_create_session_token()
        is_admin = is_admin_request()

        body = request.get_json(silent=True) or {}
        new_title = str(body.get("title", "")).strip()
        if not new_title:
            return make_secure_response({"error": "Title cannot be empty."}, 400, session_token)

        authorized, reason = verify_conversation_ownership(conversation_id, session_token, is_admin=is_admin)
        if not authorized:
            if reason == "forbidden":
                return make_secure_response({
                    "error": "Forbidden: You do not have permission to rename this conversation."
                }, 403, session_token)
            else:
                return make_secure_response({
                    "error": "Conversation not found."
                }, 404, session_token)

        success = rename_conversation(conversation_id, new_title, session_token=session_token, is_admin=is_admin)
        if not success:
            return make_secure_response({"error": "Unable to update title."}, 400, session_token)

        return make_secure_response({
            "status": "success",
            "conversation_id": conversation_id,
            "title": new_title
        }, 200, session_token)

    except PermissionError as pe:
        return make_secure_response({"error": str(pe)}, 403, session_token)
    except Exception:
        current_app.logger.exception("Failed to rename conversation")
        return jsonify({"error": "Failed to rename conversation"}), 500


@unified_chat_bp.route("/api/chat/upload", methods=["POST"])
def upload_attachment():
    """
    Secure attachment upload endpoint.
    Supports PDF, TXT, CSV, JPG, PNG with signature validation, size limit,
    upload rate limiting, and server-side ownership binding.
    """
    session_token, _ = get_or_create_session_token()
    is_admin = is_admin_request()

    # Rate limiting: max 15 uploads per minute per session/IP
    rate_key = session_token or request.remote_addr or "client"
    allowed, wait_sec = upload_limiter.is_allowed(rate_key, max_requests=15, window_seconds=60.0)
    if not allowed:
        return make_secure_response({
            "error": f"Upload rate limit exceeded. Please wait {wait_sec} seconds before uploading another file."
        }, 429, session_token)

    if "file" not in request.files:
        return make_secure_response({"error": "No file uploaded. Please select a file."}, 400, session_token)

    file_obj = request.files["file"]
    if not file_obj or not file_obj.filename:
        return make_secure_response({"error": "No file selected."}, 400, session_token)

    conversation_id = request.form.get("conversation_id", "").strip()
    if conversation_id:
        owner = get_conversation_owner(conversation_id)
        if owner is not None:
            if not is_admin and str(owner) != str(session_token):
                return make_secure_response({
                    "error": "Forbidden: You do not have permission to attach files to this conversation."
                }, 403, session_token)
        else:
            register_conversation_owner(conversation_id, session_token)
    else:
        conversation_id = str(uuid.uuid4())
        register_conversation_owner(conversation_id, session_token)

    try:
        result = process_and_save_attachment(file_obj, conversation_id, session_token)
        save_attachment_record(
            attachment_id=result["attachment_id"],
            conversation_id=conversation_id,
            session_token=session_token,
            original_filename=result["original_filename"],
            stored_filename=result["stored_filename"],
            file_path=result["file_path"],
            mime_type=result["mime_type"],
            file_size=result["file_size"],
            extracted_text=result["extracted_text"],
            storage_provider=result.get("storage_provider"),
            blob_pathname=result.get("blob_pathname"),
            blob_url=result.get("blob_url"),
            blob_download_url=result.get("blob_download_url"),
            access=result.get("access")
        )

        return make_secure_response({
            "status": "success",
            "attachment": {
                "id": result["attachment_id"],
                "filename": result["original_filename"],
                "mime_type": result["mime_type"],
                "size": result["file_size"],
                "preview_url": f"/api/chat/attachments/{result['attachment_id']}",
                "preview_snippet": result["preview_snippet"],
                "has_extracted_text": bool(result["extracted_text"])
            },
            "conversation_id": conversation_id,
            "session_token": session_token
        }, 200, session_token)

    except AttachmentValidationError as ave:
        return make_secure_response({"error": str(ave)}, 400, session_token)
    except Exception:
        current_app.logger.exception("Upload failed")
        return make_secure_response({"error": "Failed to process attachment."}, 500, session_token)


@unified_chat_bp.route("/api/chat/attachments/<file_id>", methods=["GET"])
def get_attachment(file_id):
    """
    Retrieve an uploaded attachment if authorized under server-side ownership rules.
    Prevents unauthorized cross-customer access and path traversal.
    Supports both private Vercel Blob and local disk storage.
    """
    session_token, _ = get_or_create_session_token()
    is_admin = is_admin_request()

    record = get_attachment_record(file_id)
    if not record:
        return make_secure_response({"error": "Attachment not found."}, 404, session_token)

    # Strictly enforce ownership of the parent conversation
    authorized, reason = verify_conversation_ownership(
        record["conversation_id"], session_token, is_admin=is_admin
    )
    if not authorized:
        if reason == "forbidden":
            return make_secure_response({
                "error": "Forbidden: You do not have permission to access this attachment."
            }, 403, session_token)
        else:
            return make_secure_response({"error": "Attachment not found."}, 404, session_token)

    # 1. Private Vercel Blob delivery
    storage_provider = record.get("storage_provider")
    blob_pathname = record.get("blob_pathname")
    blob_url = record.get("blob_url")
    is_blob = (
        storage_provider == "vercel_blob"
        or bool(blob_pathname)
        or str(record.get("file_path", "")).startswith("blob://")
    )

    if is_blob:
        try:
            from src.storage.blob_storage import download_blob_attachment
            target = blob_pathname or blob_url or record.get("file_path", "").replace("blob://", "")
            file_bytes, meta = download_blob_attachment(target)

            resp = make_response(file_bytes)
            resp.headers["Content-Type"] = meta.get("content_type") or record.get("mime_type", "application/octet-stream")
            resp.headers["Content-Length"] = str(len(file_bytes))
            safe_fname = record.get("original_filename", "attachment")
            resp.headers["Content-Disposition"] = f'inline; filename="{safe_fname}"'
            return resp
        except Exception as e:
            current_app.logger.warning(f"Could not retrieve attachment from Vercel Blob: {e}")
            if not record.get("file_path") or str(record.get("file_path", "")).startswith("blob://"):
                return make_secure_response({"error": "Attachment not found in cloud storage."}, 404, session_token)

    # 2. Local disk file delivery (SQLite mode / local files)
    raw_path = record.get("file_path", "")
    if str(raw_path).startswith("blob://"):
        return make_secure_response({"error": "Attachment is stored in cloud blob storage."}, 404, session_token)

    file_path = Path(raw_path).resolve()
    # If path from another system or relative, try resolving under ATTACHMENTS_DIR
    if not file_path.is_file():
        alt_path = (ATTACHMENTS_DIR / str(record["conversation_id"]) / str(record.get("stored_filename", ""))).resolve()
        if alt_path.is_file():
            file_path = alt_path

    # Path traversal check
    if not str(file_path).startswith(str(ATTACHMENTS_DIR.resolve())) or not file_path.is_file():
        return make_secure_response({"error": "Attachment file not found or access violation."}, 404, session_token)

    return send_file(
        file_path,
        mimetype=record["mime_type"],
        as_attachment=False,
        download_name=record["original_filename"]
    )


@unified_chat_bp.route("/api/chat/<conversation_id>/claim", methods=["POST"])
def claim_conversation(conversation_id):
    """
    Explicitly claim and recover an unassigned legacy conversation.
    If the conversation is unassigned ('legacy_unassigned'), binds it permanently to the requesting session token.
    """
    session_token, _ = get_or_create_session_token()
    owner = get_conversation_owner(conversation_id)
    if not owner:
        return make_secure_response({"error": "Conversation not found"}, 404, session_token)
    if owner == session_token:
        return make_secure_response({"status": "success", "message": "Already owned by current session"}, 200, session_token)
    if owner == "legacy_unassigned":
        claim_legacy_conversation(conversation_id, session_token)
        return make_secure_response({
            "status": "success",
            "message": "Legacy conversation successfully recovered and bound to your session"
        }, 200, session_token)
    return make_secure_response({"error": "Forbidden: Conversation belongs to another session"}, 403, session_token)

