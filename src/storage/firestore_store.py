import json
import logging
import secrets
import time
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple

from google.cloud.firestore_v1.base_query import FieldFilter
from google.cloud import firestore

from src.storage.firestore_client import get_firestore_client

logger = logging.getLogger("nexus.firestore_store")
ROOT = Path(__file__).resolve().parents[2]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# =============================================================================
# CONVERSATION OWNERSHIP & SECURITY
# =============================================================================

def register_conversation_owner(conversation_id: str, session_token: str, db: Optional[Any] = None) -> bool:
    """Register ownership of a conversation in Firestore. If already registered, ownership cannot be stolen."""
    if not conversation_id or not session_token:
        return False
    client = get_firestore_client()
    doc_ref = client.collection("conversation_owners").document(str(conversation_id))
    
    # Check if exists
    doc = doc_ref.get()
    if doc.exists:
        return False

    now = _now_iso()
    doc_ref.set({
        "conversation_id": str(conversation_id),
        "session_token": str(session_token),
        "custom_title": None,
        "created_at": now,
        "updated_at": now
    })
    return True


def get_conversation_owner(conversation_id: str, db: Optional[Any] = None) -> Optional[str]:
    """Retrieve the owner session_token for a conversation."""
    if not conversation_id:
        return None
    client = get_firestore_client()
    doc = client.collection("conversation_owners").document(str(conversation_id)).get()
    if doc.exists:
        data = doc.to_dict()
        return data.get("session_token")

    # Check if messages exist for this conversation
    msgs = client.collection("messages").where(filter=FieldFilter("conversation_id", "==", str(conversation_id))).limit(1).get()
    if len(msgs) > 0:
        return "legacy_unassigned"

    # Check if a support ticket exists for this conversation
    tickets = client.collection("support_tickets").where(filter=FieldFilter("conversation_id", "==", str(conversation_id))).limit(1).get()
    if len(tickets) > 0:
        return tickets[0].to_dict().get("session_token")
    return None


def claim_legacy_conversation(conversation_id: str, session_token: str, db: Optional[Any] = None) -> bool:
    """
    Recover an unassigned legacy conversation by assigning it to the requesting customer session.
    Only conversations with owner == 'legacy_unassigned' can be claimed.
    """
    if not conversation_id or not session_token:
        return False
    client = get_firestore_client()
    doc_ref = client.collection("conversation_owners").document(str(conversation_id))
    doc = doc_ref.get()
    if not doc.exists:
        # Check if messages exist
        msgs = client.collection("messages").where(filter=FieldFilter("conversation_id", "==", str(conversation_id))).limit(1).get()
        if len(msgs) == 0:
            return False
        doc_ref.set({
            "conversation_id": str(conversation_id),
            "session_token": str(session_token),
            "custom_title": None,
            "created_at": _now_iso(),
            "updated_at": _now_iso()
        })
        return True

    data = doc.to_dict()
    if data.get("session_token") == "legacy_unassigned":
        doc_ref.update({
            "session_token": str(session_token),
            "updated_at": _now_iso()
        })
        return True
    return False


def verify_conversation_ownership(
    conversation_id: str,
    session_token: Optional[str],
    is_admin: bool = False,
    db: Optional[Any] = None
) -> Tuple[bool, str]:
    """
    Verify whether the requesting session is authorized to access or modify a conversation.
    Returns (is_authorized, reason) where reason is:
    - 'admin': Authorized via admin privileges.
    - 'owner': Authorized as legitimate owner matching session token.
    - 'not_found': Conversation does not exist.
    - 'forbidden': Conversation belongs to another customer or token is invalid.
    """
    if is_admin:
        return True, "admin"

    owner = get_conversation_owner(conversation_id, db=db)
    if owner is None:
        return False, "not_found"

    if owner == "legacy_unassigned" and session_token:
        claim_legacy_conversation(conversation_id, session_token, db=db)
        return True, "owner"

    if not session_token or str(owner) != str(session_token):
        return False, "forbidden"

    return True, "owner"


# =============================================================================
# MESSAGES & TURNS
# =============================================================================

def save_turn(conversation_id, user_message, assistant_message, metadata, session_token=None):
    """Save customer and assistant turns while enforcing ownership registration."""
    db = get_firestore_client()
    now = _now_iso()

    # 1. Ensure conversation ownership binding
    if session_token:
        owner_ref = db.collection("conversation_owners").document(str(conversation_id))
        owner_doc = owner_ref.get()
        if owner_doc.exists:
            owner_data = owner_doc.to_dict()
            if owner_data.get("session_token") == str(session_token):
                owner_ref.update({"updated_at": now})
        else:
            owner_ref.set({
                "conversation_id": str(conversation_id),
                "session_token": str(session_token),
                "custom_title": None,
                "created_at": now,
                "updated_at": now
            })

    # 2. Prepare user message
    user_meta = {}
    if isinstance(metadata, dict) and "attachments" in metadata:
        user_meta["attachments"] = metadata["attachments"]
    user_meta_json = json.dumps(user_meta, ensure_ascii=False) if user_meta else "{}"

    asst_meta_json = json.dumps(metadata, ensure_ascii=False) if isinstance(metadata, dict) else str(metadata)

    # 3. Add to messages collection
    ts_millis = int(time.time() * 1000)
    batch = db.batch()
    
    user_msg_ref = db.collection("messages").document()
    batch.set(user_msg_ref, {
        "id": f"{ts_millis}_u",
        "conversation_id": str(conversation_id),
        "role": "user",
        "content": str(user_message),
        "metadata_json": user_meta_json,
        "created_at": now,
        "timestamp_millis": ts_millis
    })

    asst_msg_ref = db.collection("messages").document()
    batch.set(asst_msg_ref, {
        "id": f"{ts_millis + 1}_a",
        "conversation_id": str(conversation_id),
        "role": "assistant",
        "content": str(assistant_message),
        "metadata_json": asst_meta_json,
        "created_at": now,
        "timestamp_millis": ts_millis + 1
    })

    batch.commit()


def get_history(conversation_id, limit=50, session_token=None, is_admin=False):
    """Retrieve message history for a conversation with ownership enforcement."""
    if session_token is not None or is_admin:
        authorized, reason = verify_conversation_ownership(conversation_id, session_token, is_admin=is_admin)
        if not authorized:
            if reason == "forbidden":
                raise PermissionError("Access denied: You do not have permission to access this conversation.")
            return None

    db = get_firestore_client()
    query = (
        db.collection("messages")
        .where(filter=FieldFilter("conversation_id", "==", str(conversation_id)))
    )

    docs = query.get()
    rows = []
    for d in docs:
        data = d.to_dict()
        rows.append({
            "id": data.get("id", d.id),
            "role": data.get("role"),
            "content": data.get("content"),
            "metadata_json": data.get("metadata_json", "{}"),
            "created_at": data.get("created_at")
        })

    # Sort in memory chronologically: user precedes assistant if timestamps match
    rows.sort(key=lambda x: (str(x.get("created_at") or ""), 0 if x.get("role") == "user" else 1, str(x.get("id") or "")))
    if limit and len(rows) > limit:
        rows = rows[-limit:]
    return rows


# =============================================================================
# CONVERSATION LISTING & SEARCH
# =============================================================================

def list_conversations(
    session_token: Optional[str] = None,
    is_admin: bool = False,
    search: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
    conversation_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    List paginated conversations with title, last message preview, and search filtering.
    Security: If is_admin is False, queries are strictly scoped to the customer's server-managed session_token.
    """
    db = get_firestore_client()

    if not is_admin:
        if not session_token or not str(session_token).strip():
            return {"conversations": [], "total": 0, "has_more": False, "limit": limit, "offset": offset}
        owners_query = db.collection("conversation_owners").where(filter=FieldFilter("session_token", "==", str(session_token).strip()))
    else:
        if conversation_ids is not None:
            if not conversation_ids:
                return {"conversations": [], "total": 0, "has_more": False, "limit": limit, "offset": offset}
            # Firestore 'in' query allows up to 30 items
            owners_query = db.collection("conversation_owners").where(filter=FieldFilter("conversation_id", "in", conversation_ids[:30]))
        else:
            owners_query = db.collection("conversation_owners")

    owner_docs = owners_query.get()
    owner_list = [d.to_dict() for d in owner_docs]
    # Sort by updated_at desc
    owner_list.sort(key=lambda x: x.get("updated_at") or x.get("created_at") or "", reverse=True)

    conversations = []
    search_clean = search.strip().lower() if search and search.strip() else None

    for o in owner_list:
        c_id = o.get("conversation_id")
        if not c_id:
            continue

        # Fetch first and last message for preview
        msgs_query = (
            db.collection("messages")
            .where(filter=FieldFilter("conversation_id", "==", c_id))
        )
        msgs = [m.to_dict() for m in msgs_query.get()]
        msgs.sort(key=lambda x: str(x.get("created_at") or ""))
        if not msgs and not o.get("custom_title"):
            continue

        first_user_msg = next((m.get("content") for m in msgs if m.get("role") == "user"), None)
        last_msg = msgs[-1].get("content") if msgs else ""
        msg_count = len(msgs)

        custom_title = o.get("custom_title")
        if custom_title and str(custom_title).strip():
            title = str(custom_title).strip()
        elif first_user_msg:
            title = first_user_msg[:65] + ("..." if len(first_user_msg) > 65 else "")
        else:
            title = f"Conversation {c_id[:8]}"

        last_preview = last_msg[:95] + ("..." if len(last_msg) > 95 else "") if last_msg else ""

        # Search filter
        if search_clean:
            matches_title = search_clean in title.lower()
            matches_id = search_clean in c_id.lower()
            matches_content = any(search_clean in (m.get("content") or "").lower() for m in msgs)
            if not (matches_title or matches_id or matches_content):
                continue

        conversations.append({
            "conversation_id": c_id,
            "title": title,
            "custom_title": custom_title,
            "first_user_message": first_user_msg,
            "last_message": last_preview,
            "message_count": msg_count,
            "created_at": o.get("created_at"),
            "last_updated": o.get("updated_at") or o.get("created_at"),
        })

    total = len(conversations)
    paged = conversations[offset: offset + limit]
    has_more = (offset + len(paged)) < total

    return {
        "conversations": paged,
        "total": total,
        "has_more": has_more,
        "limit": limit,
        "offset": offset
    }


def rename_conversation(
    conversation_id: str,
    new_title: str,
    session_token: Optional[str] = None,
    is_admin: bool = False
) -> bool:
    """Rename a conversation title while enforcing ownership."""
    clean_title = str(new_title or "").strip()
    if not clean_title:
        return False

    authorized, reason = verify_conversation_ownership(conversation_id, session_token, is_admin=is_admin)
    if not authorized:
        if reason == "forbidden":
            raise PermissionError("Access denied: You cannot rename a conversation you do not own.")
        return False

    db = get_firestore_client()
    doc_ref = db.collection("conversation_owners").document(str(conversation_id))
    doc = doc_ref.get()
    if not doc.exists:
        return False

    doc_ref.update({
        "custom_title": clean_title[:100],
        "updated_at": _now_iso()
    })
    return True


def delete_conversation(
    conversation_id: str,
    session_token: Optional[str] = None,
    is_admin: bool = False
) -> bool:
    """
    Delete messages, feedback, and attachments for a conversation if authorized.
    Raises PermissionError if the conversation belongs to another customer.
    Returns False if conversation not found.
    """
    authorized, reason = verify_conversation_ownership(conversation_id, session_token, is_admin=is_admin)
    if not authorized:
        if reason == "forbidden":
            raise PermissionError("Access denied: You do not have permission to delete this conversation.")
        return False

    db = get_firestore_client()
    c_id = str(conversation_id)

    # 1. Clean up disk attachments
    att_docs = db.collection("attachments").where(filter=FieldFilter("conversation_id", "==", c_id)).get()
    for d in att_docs:
        data = d.to_dict()
        fpath = data.get("file_path")
        if fpath:
            try:
                p = Path(fpath)
                if p.is_file():
                    p.unlink(missing_ok=True)
            except Exception:
                pass

    conv_dir = ROOT / "data" / "chat_attachments" / c_id
    if conv_dir.is_dir():
        try:
            for f in conv_dir.glob("*"):
                f.unlink(missing_ok=True)
            conv_dir.rmdir()
        except Exception:
            pass

    # 2. Batch delete Firestore documents across collections
    batch = db.batch()
    batch_count = 0

    def _delete_query_docs(query):
        nonlocal batch, batch_count
        for doc in query.get():
            batch.delete(doc.reference)
            batch_count += 1
            if batch_count >= 400:
                batch.commit()
                batch = db.batch()
                batch_count = 0

    # Delete conversation owner
    owner_ref = db.collection("conversation_owners").document(c_id)
    batch.delete(owner_ref)
    batch_count += 1

    _delete_query_docs(db.collection("messages").where(filter=FieldFilter("conversation_id", "==", c_id)))
    _delete_query_docs(db.collection("feedback").where(filter=FieldFilter("conversation_id", "==", c_id)))
    _delete_query_docs(db.collection("reports").where(filter=FieldFilter("conversation_id", "==", c_id)))
    _delete_query_docs(db.collection("attachments").where(filter=FieldFilter("conversation_id", "==", c_id)))
    _delete_query_docs(db.collection("support_tickets").where(filter=FieldFilter("conversation_id", "==", c_id)))
    _delete_query_docs(db.collection("ticket_messages").where(filter=FieldFilter("conversation_id", "==", c_id)))

    if batch_count > 0:
        batch.commit()

    return True


# =============================================================================
# FEEDBACK & REPORTS
# =============================================================================

def save_feedback(conversation_id, message_id, rating, stars=None, comment=None):
    """Save or update customer feedback against a specific assistant message."""
    db = get_firestore_client()
    clean_stars = None
    if stars is not None:
        try:
            parsed = int(stars)
            if 1 <= parsed <= 5:
                clean_stars = parsed
        except (ValueError, TypeError):
            clean_stars = None

    clean_rating = str(rating).strip() if rating else (f"{clean_stars}_star" if clean_stars else "feedback")
    clean_comment = str(comment).strip() if comment and str(comment).strip() else None
    now = _now_iso()

    # Check for existing feedback
    feed_id = None
    if message_id:
        existing = (
            db.collection("feedback")
            .where(filter=FieldFilter("conversation_id", "==", str(conversation_id)))
            .where(filter=FieldFilter("message_id", "==", str(message_id)))
            .limit(1)
            .get()
        )
        if len(existing) > 0:
            doc = existing[0]
            feed_id = doc.id
            update_data = {
                "rating": clean_rating,
                "updated_at": now
            }
            if clean_stars is not None:
                update_data["stars"] = clean_stars
            if clean_comment is not None:
                update_data["comment"] = clean_comment
            doc.reference.update(update_data)
            return feed_id

    # Create new feedback
    feed_ref = db.collection("feedback").document()
    feed_ref.set({
        "id": feed_ref.id,
        "conversation_id": str(conversation_id),
        "message_id": str(message_id) if message_id else None,
        "rating": clean_rating,
        "stars": clean_stars,
        "comment": clean_comment,
        "created_at": now,
        "updated_at": now
    })
    return feed_ref.id


def get_feedback_analytics():
    """Compute aggregate analytics for Admin views: average rating, 1-5 star distribution, thumbs counts."""
    db = get_firestore_client()
    feedbacks = [d.to_dict() for d in db.collection("feedback").get()]

    distribution = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    total_stars = 0
    sum_stars = 0
    thumbs = {"helpful": 0, "unhelpful": 0}
    recent_comments = []

    for f in feedbacks:
        st = f.get("stars")
        if st and isinstance(st, int) and 1 <= st <= 5:
            distribution[st] += 1
            total_stars += 1
            sum_stars += st

        rat = f.get("rating")
        if rat in thumbs:
            thumbs[rat] += 1

        comm = f.get("comment")
        if comm and str(comm).strip():
            recent_comments.append(f)

    avg_rating = round(sum_stars / total_stars, 2) if total_stars > 0 else 0.0

    # Sort comments desc
    recent_comments.sort(key=lambda x: x.get("created_at") or "", reverse=True)

    return {
        "total_feedback": len(feedbacks),
        "total_star_ratings": total_stars,
        "average_rating": avg_rating,
        "star_distribution": distribution,
        "thumbs": thumbs,
        "recent_comments": recent_comments[:15]
    }


def save_report(conversation_id, message_id, reason, details=None):
    """Save customer-reported incorrect or problematic responses."""
    db = get_firestore_client()
    rep_ref = db.collection("reports").document()
    rep_ref.set({
        "id": rep_ref.id,
        "conversation_id": str(conversation_id),
        "message_id": str(message_id) if message_id else None,
        "reason": str(reason),
        "details": str(details) if details else None,
        "status": "pending",
        "created_at": _now_iso()
    })
    return rep_ref.id


# =============================================================================
# ATTACHMENT RECORDS (METADATA ONLY - BINARIES STORED ON DISK)
# =============================================================================

def save_attachment_record(
    attachment_id: str,
    conversation_id: str,
    session_token: str,
    original_filename: str,
    stored_filename: str,
    file_path: str,
    mime_type: str,
    file_size: int,
    extracted_text: Optional[str] = None,
    storage_provider: Optional[str] = None,
    blob_pathname: Optional[str] = None,
    blob_url: Optional[str] = None,
    blob_download_url: Optional[str] = None,
    access: Optional[str] = None
) -> None:
    """Save an attachment metadata record in Firestore with Vercel Blob metadata."""
    db = get_firestore_client()
    doc_ref = db.collection("attachments").document(str(attachment_id))
    payload: Dict[str, Any] = {
        "id": str(attachment_id),
        "conversation_id": str(conversation_id),
        "session_token": str(session_token),
        "original_filename": str(original_filename),
        "stored_filename": str(stored_filename),
        "file_path": str(file_path),
        "mime_type": str(mime_type),
        "file_size": int(file_size),
        "extracted_text": extracted_text,
        "created_at": _now_iso(),
        "storage_provider": storage_provider or "local",
    }
    if blob_pathname:
        payload["blob_pathname"] = str(blob_pathname)
    if blob_url:
        payload["blob_url"] = str(blob_url)
    if blob_download_url:
        payload["blob_download_url"] = str(blob_download_url)
    if access:
        payload["access"] = str(access)

    doc_ref.set(payload, merge=True)


def get_attachment_record(attachment_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve an attachment metadata record by ID."""
    db = get_firestore_client()
    doc = db.collection("attachments").document(str(attachment_id)).get()
    return doc.to_dict() if doc.exists else None


def get_attachments_by_ids(attachment_ids: List[str]) -> List[Dict[str, Any]]:
    """Retrieve multiple attachment records by IDs."""
    if not attachment_ids:
        return []
    db = get_firestore_client()
    results = []
    # Process in batches of 30 for Firestore IN queries
    for i in range(0, len(attachment_ids), 30):
        chunk = [str(x) for x in attachment_ids[i:i + 30]]
        docs = db.collection("attachments").where(filter=FieldFilter("id", "in", chunk)).get()
        for d in docs:
            results.append(d.to_dict())
    return results


# =============================================================================
# ADMIN SESSION MANAGEMENT
# =============================================================================

def create_admin_session(hours: int = 24) -> str:
    """Create a new cryptographically secure admin session token."""
    db = get_firestore_client()
    token = f"admin_sess_{secrets.token_hex(32)}"
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()
    db.collection("admin_sessions").document(token).set({
        "token": token,
        "created_at": _now_iso(),
        "expires_at": expires_at
    })
    return token


def verify_admin_session(token: Optional[str]) -> bool:
    """Verify if an admin session token is valid and unexpired."""
    if not token or not str(token).strip():
        return False
    db = get_firestore_client()
    doc_ref = db.collection("admin_sessions").document(str(token).strip())
    doc = doc_ref.get()
    if not doc.exists:
        return False

    data = doc.to_dict()
    exp_str = data.get("expires_at")
    if not exp_str:
        return False

    try:
        expires = datetime.fromisoformat(exp_str)
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires:
            doc_ref.delete()
            return False
        return True
    except Exception:
        return False


def revoke_admin_session(token: Optional[str]) -> bool:
    """Revoke an active admin session."""
    if not token:
        return False
    db = get_firestore_client()
    doc_ref = db.collection("admin_sessions").document(str(token).strip())
    doc = doc_ref.get()
    if doc.exists:
        doc_ref.delete()
        return True
    return False


# =============================================================================
# HUMAN SUPPORT TICKETS
# =============================================================================

def create_support_ticket(
    conversation_id: str,
    session_token: str,
    reason: str,
    customer_name: str = "Customer",
    priority: str = "normal"
) -> Dict[str, Any]:
    """Create a human support escalation ticket in Firestore."""
    db = get_firestore_client()
    ticket_id = f"TICK-{uuid.uuid4().hex[:8].upper()}"
    now = _now_iso()
    clean_prio = str(priority).lower() if str(priority).lower() in ("low", "normal", "high", "urgent") else "normal"

    ticket_data = {
        "id": ticket_id,
        "conversation_id": str(conversation_id),
        "session_token": str(session_token),
        "customer_name": str(customer_name or "Customer").strip()[:60],
        "reason": str(reason).strip()[:500],
        "status": "open",
        "priority": clean_prio,
        "assigned_agent": None,
        "created_at": now,
        "updated_at": now
    }

    batch = db.batch()
    ticket_ref = db.collection("support_tickets").document(ticket_id)
    batch.set(ticket_ref, ticket_data)

    # Initial system message
    msg_id = str(uuid.uuid4())
    msg_ref = db.collection("ticket_messages").document(msg_id)
    batch.set(msg_ref, {
        "id": msg_id,
        "ticket_id": ticket_id,
        "conversation_id": str(conversation_id),
        "sender_role": "system",
        "sender_name": "Nexus System",
        "message": f"Customer requested human support agent escalation. Reason: {reason}",
        "is_internal_note": 0,
        "created_at": now
    })

    batch.commit()
    return ticket_data


def get_ticket_by_conversation(
    conversation_id: str,
    session_token: Optional[str] = None,
    is_admin: bool = False
) -> Optional[Dict[str, Any]]:
    """Get active support ticket details for a conversation."""
    db = get_firestore_client()
    query = db.collection("support_tickets").where(filter=FieldFilter("conversation_id", "==", str(conversation_id)))
    if not is_admin:
        if not session_token:
            return None
        query = query.where(filter=FieldFilter("session_token", "==", str(session_token)))

    docs = [d.to_dict() for d in query.get()]
    if not docs:
        return None
    docs.sort(key=lambda t: str(t.get("created_at") or ""), reverse=True)
    return docs[0]


def list_support_tickets(
    status: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
) -> Dict[str, Any]:
    """List support tickets for Support Agent Workspace (admin only)."""
    db = get_firestore_client()
    query = db.collection("support_tickets")

    if status and status.strip() and status != "all":
        query = query.where(filter=FieldFilter("status", "==", status.strip().lower()))

    docs = [d.to_dict() for d in query.get()]

    # Filter search
    if search and search.strip():
        term = search.strip().lower()
        docs = [
            t for t in docs
            if term in t.get("id", "").lower()
            or term in t.get("customer_name", "").lower()
            or term in t.get("reason", "").lower()
            or term in t.get("conversation_id", "").lower()
        ]

    # Priority sort: urgent -> high -> normal -> low, then created_at desc
    prio_map = {"urgent": 1, "high": 2, "normal": 3, "low": 4}
    docs.sort(key=lambda t: (prio_map.get(t.get("priority", "normal"), 5), -(datetime.fromisoformat(t.get("created_at", "1970-01-01T00:00:00")).timestamp() if t.get("created_at") else 0)))

    total = len(docs)
    paged = docs[offset: offset + limit]
    return {
        "tickets": paged,
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": (offset + len(paged)) < total
    }


def get_ticket_details(ticket_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve full ticket details including conversation messages and ticket timeline."""
    db = get_firestore_client()
    doc = db.collection("support_tickets").document(str(ticket_id)).get()
    if not doc.exists:
        return None

    ticket = doc.to_dict()
    msgs_query = (
        db.collection("ticket_messages")
        .where(filter=FieldFilter("ticket_id", "==", str(ticket_id)))
    )
    t_msgs = [m.to_dict() for m in msgs_query.get()]
    t_msgs.sort(key=lambda m: str(m.get("created_at") or ""))
    ticket["messages"] = t_msgs
    return ticket


def update_ticket(
    ticket_id: str,
    status: Optional[str] = None,
    assigned_agent: Optional[str] = None,
    priority: Optional[str] = None
) -> bool:
    """Update support ticket status, assigned agent, or priority."""
    db = get_firestore_client()
    doc_ref = db.collection("support_tickets").document(str(ticket_id))
    doc = doc_ref.get()
    if not doc.exists:
        return False

    updates = {}
    if status and status.strip() in ("open", "in_progress", "waiting", "resolved"):
        updates["status"] = status.strip()

    if assigned_agent is not None:
        updates["assigned_agent"] = str(assigned_agent).strip() if assigned_agent else None

    if priority and priority.strip().lower() in ("low", "normal", "high", "urgent"):
        updates["priority"] = priority.strip().lower()

    if not updates:
        return False

    updates["updated_at"] = _now_iso()
    doc_ref.update(updates)
    return True


def add_ticket_message(
    ticket_id: str,
    conversation_id: str,
    sender_role: str,
    sender_name: str,
    message: str,
    is_internal_note: bool = False
) -> Dict[str, Any]:
    """Add a message or internal note to a support ticket, and post agent replies to the chat history."""
    db = get_firestore_client()
    msg_id = str(uuid.uuid4())
    clean_msg = str(message).strip()
    now = _now_iso()

    batch = db.batch()
    msg_ref = db.collection("ticket_messages").document(msg_id)
    batch.set(msg_ref, {
        "id": msg_id,
        "ticket_id": str(ticket_id),
        "conversation_id": str(conversation_id),
        "sender_role": str(sender_role),
        "sender_name": str(sender_name),
        "message": clean_msg,
        "is_internal_note": 1 if is_internal_note else 0,
        "created_at": now
    })

    # If agent replied publicly, inject into conversation messages and update ticket status
    if sender_role == "agent" and not is_internal_note:
        meta = {
            "human_agent": True,
            "agent_name": sender_name,
            "ticket_id": ticket_id
        }
        ts_millis = int(time.time() * 1000)
        cmsg_ref = db.collection("messages").document()
        batch.set(cmsg_ref, {
            "id": f"{ts_millis}_agent",
            "conversation_id": str(conversation_id),
            "role": "assistant",
            "content": clean_msg,
            "metadata_json": json.dumps(meta),
            "created_at": now,
            "timestamp_millis": ts_millis
        })

        t_ref = db.collection("support_tickets").document(str(ticket_id))
        batch.update(t_ref, {
            "status": "in_progress",
            "updated_at": now
        })

    batch.commit()
    return {
        "id": msg_id,
        "ticket_id": ticket_id,
        "sender_role": sender_role,
        "sender_name": sender_name,
        "message": clean_msg,
        "is_internal_note": is_internal_note,
        "created_at": now
    }


def get_ticket_messages(ticket_id: str, include_internal: bool = False) -> List[Dict[str, Any]]:
    """Retrieve messages for a support ticket, optionally filtering internal notes."""
    db = get_firestore_client()
    query = (
        db.collection("ticket_messages")
        .where(filter=FieldFilter("ticket_id", "==", str(ticket_id)))
    )
    docs = [d.to_dict() for d in query.get()]
    docs.sort(key=lambda m: str(m.get("created_at") or ""))
    if not include_internal:
        docs = [d for d in docs if not d.get("is_internal_note")]
    return docs


# =============================================================================
# ADMIN ANALYTICS OVERVIEW
# =============================================================================

def get_admin_overview_analytics(days: int = 30) -> Dict[str, Any]:
    """Compute comprehensive real-data analytics across Firestore collections."""
    db = get_firestore_client()

    msgs = [d.to_dict() for d in db.collection("messages").get()]
    feedbacks = [d.to_dict() for d in db.collection("feedback").get()]
    tickets = [d.to_dict() for d in db.collection("support_tickets").get()]
    attachments = [d.to_dict() for d in db.collection("attachments").get()]
    reports = [d.to_dict() for d in db.collection("reports").get()]

    total_convs = len(set(m.get("conversation_id") for m in msgs if m.get("conversation_id")))
    total_msgs = len(msgs)
    user_msgs = sum(1 for m in msgs if m.get("role") == "user")
    ai_msgs = sum(1 for m in msgs if m.get("role") == "assistant")

    # Star distribution
    star_counts = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    total_star_ratings = 0
    sum_stars = 0
    thumbs_up = 0
    thumbs_down = 0

    for f in feedbacks:
        st = f.get("stars")
        if st and isinstance(st, int) and 1 <= st <= 5:
            star_counts[st] += 1
            total_star_ratings += 1
            sum_stars += st
        if f.get("rating") == "helpful":
            thumbs_up += 1
        elif f.get("rating") == "unhelpful":
            thumbs_down += 1

    avg_stars = round(sum_stars / total_star_ratings, 2) if total_star_ratings > 0 else 0.0

    # Intent and sentiment
    intent_counts: Dict[str, int] = {}
    sentiment_counts = {"positive": 0, "neutral": 0, "negative": 0}
    review_required_count = 0

    for m in msgs:
        if m.get("role") == "assistant":
            m_json = m.get("metadata_json")
            if m_json:
                try:
                    meta = json.loads(m_json) if isinstance(m_json, str) else m_json
                    if isinstance(meta, dict):
                        intent_name = meta.get("intent")
                        if intent_name and isinstance(intent_name, str):
                            intent_counts[intent_name] = intent_counts.get(intent_name, 0) + 1
                        sent = meta.get("sentiment")
                        if sent in sentiment_counts:
                            sentiment_counts[sent] += 1
                        if meta.get("requires_human_review"):
                            review_required_count += 1
                except Exception:
                    pass

    top_intents = sorted(
        [{"intent": k, "count": v} for k, v in intent_counts.items()],
        key=lambda x: x["count"],
        reverse=True
    )[:10]

    # Attachments
    total_attachments = len(attachments)
    total_attachment_bytes = sum(a.get("file_size", 0) for a in attachments)

    # Tickets
    open_tickets = sum(1 for t in tickets if t.get("status") == "open")
    in_progress_tickets = sum(1 for t in tickets if t.get("status") == "in_progress")
    resolved_tickets = sum(1 for t in tickets if t.get("status") == "resolved")

    # Trends
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    period_msgs_list = []
    period_conv_set = set()
    period_feedback_cnt = 0

    for m in msgs:
        c_at = m.get("created_at")
        if c_at:
            try:
                dt = datetime.fromisoformat(c_at)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                if dt >= cutoff:
                    period_msgs_list.append(m)
                    if m.get("conversation_id"):
                        period_conv_set.add(m.get("conversation_id"))
            except Exception:
                pass

    for f in feedbacks:
        c_at = f.get("created_at")
        if c_at:
            try:
                dt = datetime.fromisoformat(c_at)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                if dt >= cutoff:
                    period_feedback_cnt += 1
            except Exception:
                pass

    # Group trends by day
    trend_dict: Dict[str, Dict[str, Any]] = {}
    for m in period_msgs_list:
        day_str = (m.get("created_at") or "")[:10]
        if day_str:
            if day_str not in trend_dict:
                trend_dict[day_str] = {"conversations": set(), "messages": 0}
            trend_dict[day_str]["messages"] += 1
            if m.get("conversation_id"):
                trend_dict[day_str]["conversations"].add(m.get("conversation_id"))

    trends = [
        {"date": day, "conversations": len(data["conversations"]), "messages": data["messages"]}
        for day, data in sorted(trend_dict.items())
    ]

    return {
        "overview": {
            "selected_days": days,
            "period_conversations": len(period_conv_set),
            "period_messages": len(period_msgs_list),
            "period_feedback": period_feedback_cnt,
            "total_conversations": total_convs,
            "total_messages": total_msgs,
            "user_messages": user_msgs,
            "assistant_messages": ai_msgs,
            "total_attachments": total_attachments,
            "total_attachment_mb": round(total_attachment_bytes / (1024 * 1024), 2),
            "open_tickets": open_tickets,
            "in_progress_tickets": in_progress_tickets,
            "resolved_tickets": resolved_tickets,
            "reports_count": len(reports),
            "requires_review_count": review_required_count
        },
        "csat": {
            "average_rating": avg_stars,
            "total_ratings": total_star_ratings,
            "total_feedback": len(feedbacks),
            "stars_distribution": star_counts,
            "thumbs_up": thumbs_up,
            "thumbs_down": thumbs_down,
        },
        "intents": top_intents,
        "sentiment": sentiment_counts,
        "trends": trends
    }


# =============================================================================
# CUSTOM KNOWLEDGE BASE FAQ MANAGEMENT
# =============================================================================

def list_knowledge_faqs(search: str = "", limit: int = 50, offset: int = 0) -> Dict[str, Any]:
    """List custom FAQs with search and pagination."""
    db = get_firestore_client()
    docs = [d.to_dict() for d in db.collection("custom_knowledge_faqs").get()]

    if search and search.strip():
        term = search.strip().lower()
        docs = [
            f for f in docs
            if term in f.get("question", "").lower()
            or term in f.get("answer", "").lower()
            or term in f.get("intent", "").lower()
            or term in f.get("category", "").lower()
        ]

    docs.sort(key=lambda x: x.get("updated_at") or x.get("created_at") or "", reverse=True)
    total = len(docs)
    paged = docs[offset: offset + limit]

    return {
        "faqs": paged,
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": (offset + len(paged)) < total
    }


def save_knowledge_faq(
    faq_id: Optional[str],
    intent: str,
    category: str,
    question: str,
    answer: str,
    keywords: str = ""
) -> Dict[str, Any]:
    """Create or update a custom FAQ record in Firestore."""
    db = get_firestore_client()
    clean_id = str(faq_id).strip() if faq_id and str(faq_id).strip() else f"faq_{uuid.uuid4().hex[:12]}"
    now = _now_iso()

    doc_ref = db.collection("custom_knowledge_faqs").document(clean_id)
    doc = doc_ref.get()

    record = {
        "id": clean_id,
        "intent": str(intent).strip(),
        "category": str(category or "General Banking").strip(),
        "question": str(question).strip(),
        "answer": str(answer).strip(),
        "keywords": str(keywords or "").strip(),
        "is_active": 1,
        "updated_at": now
    }

    if doc.exists:
        doc_ref.update(record)
        record["created_at"] = doc.to_dict().get("created_at", now)
    else:
        record["created_at"] = now
        doc_ref.set(record)

    return record


def delete_knowledge_faq(faq_id: str) -> bool:
    """Delete a custom FAQ entry."""
    db = get_firestore_client()
    doc_ref = db.collection("custom_knowledge_faqs").document(str(faq_id))
    doc = doc_ref.get()
    if doc.exists:
        doc_ref.delete()
        return True
    return False
