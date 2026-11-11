import os
import json
import secrets
import shutil
from datetime import datetime, timezone
from pathlib import Path
from flask import Blueprint, request, jsonify, current_app, make_response

from src.storage.chat_store import (
    create_admin_session,
    verify_admin_session,
    revoke_admin_session,
    get_admin_overview_analytics,
    list_conversations,
    get_history,
    list_knowledge_faqs,
    save_knowledge_faq,
    delete_knowledge_faq,
)
import src.rag.service as rag_service
from src.security.rate_limiter import auth_limiter

admin_bp = Blueprint("admin", __name__)

ADMIN_SECRET_KEY = os.environ.get("NEXUS_ADMIN_KEY", "nexus-admin-secret-2026")
ROOT = Path(__file__).resolve().parents[1]
INDEX_DIR = ROOT / "models" / "embeddings" / "bitext_faq"
BACKUP_DIR = ROOT / "models" / "embeddings" / "bitext_faq_backups"


def is_authenticated_admin() -> bool:
    """Verify admin authorization from session header, cookie, or API key."""
    # 1. Admin session token from header or cookie
    token = request.headers.get("X-Admin-Session") or request.cookies.get("nexus_admin_session")
    if token and verify_admin_session(token):
        return True

    # 2. X-Admin-Key header matching secret key
    key = request.headers.get("X-Admin-Key")
    if key and secrets.compare_digest(key.strip(), ADMIN_SECRET_KEY):
        return True

    return False


@admin_bp.route("/api/admin/login", methods=["POST"])
def admin_login():
    """Authenticate administrator and issue secure admin session token with brute-force throttling."""
    client_ip = request.remote_addr or "client"

    # Check brute-force lockout status
    is_locked, wait_sec = auth_limiter.record_login_attempt(client_ip, success=False, max_failures=5, lockout_seconds=900.0)
    # wait_sec > 0 means already locked out or just triggered lockout
    if is_locked and wait_sec > 0:
        return jsonify({
            "error": f"Too many failed login attempts from this address. Temporarily locked for {wait_sec} seconds."
        }), 429

    body = request.get_json(silent=True) or {}
    provided_key = str(body.get("password") or body.get("key") or "").strip()

    if not provided_key:
        return jsonify({"error": "Admin password/key required"}), 400

    if not secrets.compare_digest(provided_key, ADMIN_SECRET_KEY):
        # Record failed attempt
        is_now_locked, lockout_time = auth_limiter.record_login_attempt(client_ip, success=False, max_failures=5, lockout_seconds=900.0)
        if is_now_locked:
            return jsonify({
                "error": f"Too many failed login attempts. Temporarily locked for {lockout_time} seconds."
            }), 429
        return jsonify({"error": "Invalid administrator credentials"}), 401

    # Successful login: reset failure counter
    auth_limiter.record_login_attempt(client_ip, success=True)

    session_token = create_admin_session(hours=24)
    resp = make_response(jsonify({
        "status": "success",
        "message": "Administrator authenticated successfully",
        "admin_token": session_token
    }), 200)

    # Set secure HttpOnly cookie
    resp.set_cookie(
        "nexus_admin_session",
        session_token,
        httponly=True,
        samesite="Lax",
        secure=request.is_secure,
        max_age=24 * 3600
    )
    return resp


@admin_bp.route("/api/admin/logout", methods=["POST"])
def admin_logout():
    """Revoke admin session and clear cookie."""
    token = request.headers.get("X-Admin-Session") or request.cookies.get("nexus_admin_session")
    if token:
        revoke_admin_session(token)

    resp = make_response(jsonify({"status": "success", "message": "Logged out"}), 200)
    resp.delete_cookie("nexus_admin_session")
    return resp


@admin_bp.route("/api/admin/me", methods=["GET"])
def admin_me():
    """Check current admin authentication status."""
    auth = is_authenticated_admin()
    return jsonify({"authenticated": auth}), 200


@admin_bp.route("/api/admin/analytics", methods=["GET"])
def get_analytics():
    """Return comprehensive analytics data computed directly from SQLite database."""
    if not is_authenticated_admin():
        return jsonify({"error": "Access denied. Admin authentication required."}), 403

    days = int(request.args.get("days", 30))
    analytics = get_admin_overview_analytics(days=days)
    return jsonify(analytics), 200


@admin_bp.route("/api/admin/conversations", methods=["GET"])
def admin_list_conversations():
    """Admin endpoint to inspect all customer conversations with pagination and search."""
    if not is_authenticated_admin():
        return jsonify({"error": "Access denied. Admin authentication required."}), 403

    search = request.args.get("search", "").strip()
    limit = int(request.args.get("limit", 25))
    offset = int(request.args.get("offset", 0))

    result = list_conversations(
        is_admin=True,
        search=search,
        limit=limit,
        offset=offset
    )
    return jsonify(result), 200


@admin_bp.route("/api/admin/conversations/<conversation_id>", methods=["GET"])
def admin_get_conversation_audit(conversation_id):
    """Admin inspection of a conversation including complete internal ML and RAG audit metadata."""
    if not is_authenticated_admin():
        return jsonify({"error": "Access denied. Admin authentication required."}), 403

    messages = get_history(conversation_id, is_admin=True)
    if messages is None:
        return jsonify({"error": "Conversation not found"}), 404

    # Parse metadata_json for convenience
    audit_messages = []
    for m in messages:
        meta = {}
        if m.get("metadata_json"):
            try:
                meta = json.loads(m["metadata_json"])
            except Exception:
                meta = {}
        audit_messages.append({
            **m,
            "parsed_metadata": meta
        })

    return jsonify({
        "conversation_id": conversation_id,
        "messages": audit_messages
    }), 200


# =============================================================================
# KNOWLEDGE BASE FAQ MANAGEMENT
# =============================================================================

@admin_bp.route("/api/admin/knowledge/faqs", methods=["GET", "POST"])
def manage_faqs():
    """List or create custom FAQ knowledge base entries."""
    if not is_authenticated_admin():
        return jsonify({"error": "Access denied. Admin authentication required."}), 403

    if request.method == "GET":
        search = request.args.get("search", "").strip()
        limit = int(request.args.get("limit", 50))
        offset = int(request.args.get("offset", 0))

        result = list_knowledge_faqs(search=search, limit=limit, offset=offset)

        # Include sample verified system FAQs if custom list is small
        if result["total"] == 0 and INDEX_DIR.exists():
            docs_file = INDEX_DIR / "documents.json"
            if docs_file.exists():
                try:
                    with docs_file.open("r", encoding="utf-8") as f:
                        all_docs = json.load(f)
                    sample_docs = []
                    for d in all_docs[:30]:
                        sample_docs.append({
                            "id": d.get("doc_id", "sys_doc"),
                            "intent": d.get("intent", "General"),
                            "category": "Bitext Verified FAQ",
                            "question": d.get("question", ""),
                            "answer": d.get("response", ""),
                            "keywords": "",
                            "is_system": True,
                            "updated_at": "Pre-indexed"
                        })
                    result["system_faqs_sample"] = sample_docs
                    result["total_system_documents"] = len(all_docs)
                except Exception:
                    pass

        return jsonify(result), 200

    if request.method == "POST":
        body = request.get_json(silent=True) or {}
        question = str(body.get("question", "")).strip()
        answer = str(body.get("answer", "")).strip()
        intent = str(body.get("intent", "General")).strip()
        category = str(body.get("category", "General Banking")).strip()
        keywords = str(body.get("keywords", "")).strip()
        faq_id = body.get("id")

        if not question or not answer:
            return jsonify({"error": "Question and answer are required"}), 400

        faq = save_knowledge_faq(faq_id, intent, category, question, answer, keywords)
        return jsonify({"status": "success", "faq": faq}), 201


@admin_bp.route("/api/admin/knowledge/faqs/<faq_id>", methods=["DELETE"])
def delete_faq(faq_id):
    """Delete a custom FAQ entry."""
    if not is_authenticated_admin():
        return jsonify({"error": "Access denied. Admin authentication required."}), 403

    success = delete_knowledge_faq(faq_id)
    if not success:
        return jsonify({"error": "FAQ entry not found"}), 404
    return jsonify({"status": "success", "message": "FAQ deleted"}), 200


@admin_bp.route("/api/admin/knowledge/test", methods=["POST"])
def test_retrieval():
    """Live interactive test of query against semantic RAG retriever."""
    if not is_authenticated_admin():
        return jsonify({"error": "Access denied. Admin authentication required."}), 403

    body = request.get_json(silent=True) or {}
    query = str(body.get("query", "")).strip()
    top_k = int(body.get("top_k", 3))

    if not query:
        return jsonify({"error": "Query is required"}), 400

    try:
        retrieval = rag_service.build_context(query, top_k=top_k)
        return jsonify({
            "status": "success",
            "query": query,
            "results": retrieval
        }), 200
    except Exception as e:
        return jsonify({"error": f"Retrieval test failed: {str(e)}"}), 500


@admin_bp.route("/api/admin/knowledge/rebuild", methods=["POST"])
def rebuild_knowledge_index():
    """
    Safely back up and refresh the knowledge base index with automatic rollback on error.
    """
    if not is_authenticated_admin():
        return jsonify({"error": "Access denied. Admin authentication required."}), 403

    backup_target = None
    try:
        if INDEX_DIR.exists():
            BACKUP_DIR.mkdir(parents=True, exist_ok=True)
            timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            backup_target = BACKUP_DIR / f"bitext_faq_backup_{timestamp}"
            shutil.copytree(INDEX_DIR, backup_target, dirs_exist_ok=True)

        # Clear LRU cache so retriever reloads clean files
        rag_service.get_retriever.cache_clear()
        rag_service.get_intent_groups.cache_clear()
        rag_service.get_gate_config.cache_clear()

        # Validate that retriever can reload successfully
        try:
            retriever = rag_service.get_retriever()
            doc_count = len(retriever.documents)
        except Exception as load_err:
            # Automatic rollback if reload fails
            if backup_target and backup_target.exists():
                shutil.copytree(backup_target, INDEX_DIR, dirs_exist_ok=True)
                rag_service.get_retriever.cache_clear()
            raise RuntimeError(f"Index validation failed (auto-rolled back to backup): {load_err}")

        return jsonify({
            "status": "success",
            "message": f"Knowledge base verified and refreshed successfully with {doc_count} verified documents.",
            "documents_count": doc_count,
            "backup_created": True,
            "backup_name": backup_target.name if backup_target else None
        }), 200

    except Exception as e:
        current_app.logger.exception("Knowledge index rebuild failed")
        return jsonify({"error": f"Failed to refresh index: {str(e)}"}), 500


@admin_bp.route("/api/admin/knowledge/recover", methods=["POST"])
def recover_knowledge_index():
    """
    Recover knowledge base index from the latest verified backup.
    """
    if not is_authenticated_admin():
        return jsonify({"error": "Access denied. Admin authentication required."}), 403

    try:
        if not BACKUP_DIR.exists():
            return jsonify({"error": "No backup directory exists yet."}), 404

        backups = sorted(BACKUP_DIR.glob("bitext_faq_backup_*"), reverse=True)
        if not backups:
            return jsonify({"error": "No existing backups found to recover from."}), 404

        latest_backup = backups[0]
        shutil.copytree(latest_backup, INDEX_DIR, dirs_exist_ok=True)

        rag_service.get_retriever.cache_clear()
        rag_service.get_intent_groups.cache_clear()
        rag_service.get_gate_config.cache_clear()

        retriever = rag_service.get_retriever()
        doc_count = len(retriever.documents)

        return jsonify({
            "status": "success",
            "message": f"Index successfully restored from backup {latest_backup.name}.",
            "documents_count": doc_count,
            "recovered_backup": latest_backup.name
        }), 200

    except Exception as e:
        current_app.logger.exception("Knowledge index recovery failed")
        return jsonify({"error": f"Recovery failed: {str(e)}"}), 500


