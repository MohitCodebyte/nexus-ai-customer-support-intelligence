import os
import sqlite3
import json
import threading
import uuid
import secrets
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = ROOT / "data" / "chat_history" / "chat_history.sqlite3"

_db_init_lock = threading.Lock()
_db_initialized = False


def is_firestore_active() -> bool:
    """Return True if STORAGE_BACKEND environment variable is explicitly set to 'firestore'."""
    return os.environ.get("STORAGE_BACKEND", "sqlite").lower() == "firestore"


def get_active_storage_backend() -> str:
    """Return the currently active storage backend ('sqlite' or 'firestore')."""
    return "firestore" if is_firestore_active() else "sqlite"


def get_db_connection(timeout: float = 30.0) -> sqlite3.Connection:
    """Create a SQLite connection configured for concurrent WAL access and busy timeouts."""
    if is_firestore_active():
        raise RuntimeError("SQLite connection is disabled when STORAGE_BACKEND=firestore is active.")
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=timeout)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout=10000;")
    return conn


def init_db(db: sqlite3.Connection):
    """Ensure messages, conversation_owners, feedback, and reports tables exist."""
    db.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            metadata_json TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    db.execute("CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_messages_conv_id ON messages(conversation_id, id)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at)")

    db.execute("""
        CREATE TABLE IF NOT EXISTS conversation_owners (
            conversation_id TEXT PRIMARY KEY,
            session_token TEXT NOT NULL,
            custom_title TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    db.execute("CREATE INDEX IF NOT EXISTS idx_conv_owner_session ON conversation_owners(session_token)")

    # Ensure custom_title column exists if table existed previously
    owner_cols = [r[1] for r in db.execute("PRAGMA table_info(conversation_owners)").fetchall()]
    if "custom_title" not in owner_cols:
        db.execute("ALTER TABLE conversation_owners ADD COLUMN custom_title TEXT")

    db.execute("""
        CREATE TABLE IF NOT EXISTS attachments (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            session_token TEXT NOT NULL,
            original_filename TEXT NOT NULL,
            stored_filename TEXT NOT NULL,
            file_path TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            extracted_text TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    db.execute("CREATE INDEX IF NOT EXISTS idx_attachments_conv ON attachments(conversation_id)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_attachments_session ON attachments(session_token)")

    db.execute("""
        CREATE TABLE IF NOT EXISTS admin_sessions (
            token TEXT PRIMARY KEY,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            expires_at TEXT NOT NULL
        )
    """)

    db.execute("""
        CREATE TABLE IF NOT EXISTS support_tickets (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            session_token TEXT NOT NULL,
            customer_name TEXT DEFAULT 'Customer',
            reason TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open',
            priority TEXT NOT NULL DEFAULT 'normal',
            assigned_agent TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    db.execute("CREATE INDEX IF NOT EXISTS idx_tickets_conv ON support_tickets(conversation_id)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_tickets_session ON support_tickets(session_token)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status)")

    db.execute("""
        CREATE TABLE IF NOT EXISTS ticket_messages (
            id TEXT PRIMARY KEY,
            ticket_id TEXT NOT NULL,
            conversation_id TEXT NOT NULL,
            sender_role TEXT NOT NULL,
            sender_name TEXT NOT NULL,
            message TEXT NOT NULL,
            is_internal_note INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    db.execute("CREATE INDEX IF NOT EXISTS idx_ticket_msgs_ticket ON ticket_messages(ticket_id)")

    db.execute("""
        CREATE TABLE IF NOT EXISTS custom_knowledge_faqs (
            id TEXT PRIMARY KEY,
            intent TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'General Banking',
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            keywords TEXT,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Legacy migration: If existing conversations in `messages` have no owner record,
    # register them under 'legacy_unassigned' so existing data is preserved.
    db.execute("""
        INSERT OR IGNORE INTO conversation_owners (conversation_id, session_token, created_at, updated_at)
        SELECT conversation_id, 'legacy_unassigned', MIN(created_at), MAX(created_at)
        FROM messages
        WHERE conversation_id NOT IN (SELECT conversation_id FROM conversation_owners)
        GROUP BY conversation_id
    """)


def ensure_db_initialized():
    """Idempotently ensure tables and migrations are initialized once."""
    if is_firestore_active():
        return
    global _db_initialized
    if _db_initialized:
        return
    with _db_init_lock:
        if not _db_initialized:
            with get_db_connection() as db:
                init_db(db)
            _db_initialized = True


def register_conversation_owner(conversation_id: str, session_token: str, db: Optional[sqlite3.Connection] = None) -> bool:
    """Register ownership of a conversation. If already registered, ownership cannot be stolen."""
    if is_firestore_active():
        from src.storage import firestore_store
        return firestore_store.register_conversation_owner(conversation_id, session_token)
    if not conversation_id or not session_token:
        return False
    ensure_db_initialized()

    if db is not None:
        cur = db.execute(
            "INSERT OR IGNORE INTO conversation_owners (conversation_id, session_token) VALUES (?, ?)",
            (str(conversation_id), str(session_token))
        )
        return cur.rowcount > 0

    with get_db_connection() as conn:
        cur = conn.execute(
            "INSERT OR IGNORE INTO conversation_owners (conversation_id, session_token) VALUES (?, ?)",
            (str(conversation_id), str(session_token))
        )
        return cur.rowcount > 0


def get_conversation_owner(conversation_id: str, db: Optional[sqlite3.Connection] = None) -> Optional[str]:
    """Retrieve the owner session_token for a conversation."""
    if is_firestore_active():
        from src.storage import firestore_store
        return firestore_store.get_conversation_owner(conversation_id)
    if not conversation_id:
        return None
    ensure_db_initialized()

    def _query(conn: sqlite3.Connection):
        row = conn.execute(
            "SELECT session_token FROM conversation_owners WHERE conversation_id = ?",
            (str(conversation_id),)
        ).fetchone()
        if row:
            return str(row[0])
        msg_exists = conn.execute(
            "SELECT 1 FROM messages WHERE conversation_id = ? LIMIT 1",
            (str(conversation_id),)
        ).fetchone()
        if msg_exists:
            return "legacy_unassigned"
        ticket_row = conn.execute(
            "SELECT session_token FROM support_tickets WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 1",
            (str(conversation_id),)
        ).fetchone()
        if ticket_row and ticket_row[0]:
            return str(ticket_row[0])
        return None

    if db is not None:
        return _query(db)

    with get_db_connection() as conn:
        return _query(conn)


def claim_legacy_conversation(
    conversation_id: str,
    session_token: str,
    db: Optional[sqlite3.Connection] = None
) -> bool:
    """
    Recover an unassigned legacy conversation by assigning it to the requesting customer session.
    Only conversations with owner == 'legacy_unassigned' can be claimed.
    """
    if is_firestore_active():
        from src.storage import firestore_store
        return firestore_store.claim_legacy_conversation(conversation_id, session_token)
    if not conversation_id or not session_token:
        return False
    ensure_db_initialized()

    def _execute(conn: sqlite3.Connection) -> bool:
        cur = conn.execute("""
            UPDATE conversation_owners
            SET session_token = ?, updated_at = CURRENT_TIMESTAMP
            WHERE conversation_id = ? AND session_token = 'legacy_unassigned'
        """, (str(session_token), str(conversation_id)))
        return cur.rowcount > 0

    if db is not None:
        return _execute(db)
    with get_db_connection() as conn:
        return _execute(conn)


def verify_conversation_ownership(
    conversation_id: str,
    session_token: Optional[str],
    is_admin: bool = False,
    db: Optional[sqlite3.Connection] = None
) -> Tuple[bool, str]:
    """
    Verify whether the requesting session is authorized to access or modify a conversation.
    Returns (is_authorized, reason) where reason is:
    - 'admin': Authorized via admin privileges.
    - 'owner': Authorized as legitimate owner matching session token.
    - 'not_found': Conversation does not exist.
    - 'forbidden': Conversation belongs to another customer or token is invalid.
    """
    if is_firestore_active():
        from src.storage import firestore_store
        return firestore_store.verify_conversation_ownership(conversation_id, session_token, is_admin=is_admin)
    if is_admin:
        return True, "admin"

    owner = get_conversation_owner(conversation_id, db=db)
    if owner is None:
        return False, "not_found"

    # Legacy recovery: If conversation is unassigned from legacy data, allow legitimate session to adopt it
    if owner == "legacy_unassigned" and session_token:
        claim_legacy_conversation(conversation_id, session_token, db=db)
        return True, "owner"

    if not session_token or str(owner) != str(session_token):
        return False, "forbidden"

    return True, "owner"


def save_turn(conversation_id, user_message, assistant_message, metadata, session_token=None):
    """Save customer and assistant turns while enforcing ownership registration."""
    if is_firestore_active():
        from src.storage import firestore_store
        return firestore_store.save_turn(conversation_id, user_message, assistant_message, metadata, session_token=session_token)
    ensure_db_initialized()

    with get_db_connection() as db:
        # Ensure conversation ownership binding
        if session_token:
            db.execute("""
                INSERT INTO conversation_owners (conversation_id, session_token, created_at, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT(conversation_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
                WHERE session_token = ?
            """, (str(conversation_id), str(session_token), str(session_token)))

        user_meta = {}
        if isinstance(metadata, dict) and "attachments" in metadata:
            user_meta["attachments"] = metadata["attachments"]
        user_meta_json = json.dumps(user_meta, ensure_ascii=False) if user_meta else "{}"

        db.executemany("""
            INSERT INTO messages
            (conversation_id, role, content, metadata_json)
            VALUES (?, ?, ?, ?)
        """, [
            (str(conversation_id), "user", user_message, user_meta_json),
            (
                str(conversation_id),
                "assistant",
                assistant_message,
                json.dumps(metadata, ensure_ascii=False)
            )
        ])


def get_history(conversation_id, limit=50, session_token=None, is_admin=False):
    """Retrieve message history for a conversation with ownership enforcement."""
    if is_firestore_active():
        from src.storage import firestore_store
        return firestore_store.get_history(conversation_id, limit=limit, session_token=session_token, is_admin=is_admin)
    ensure_db_initialized()
    with get_db_connection() as db:
        # Enforce ownership check when session_token or is_admin is specified
        if session_token is not None or is_admin:
            authorized, reason = verify_conversation_ownership(conversation_id, session_token, is_admin=is_admin, db=db)
            if not authorized:
                if reason == "forbidden":
                    raise PermissionError("Access denied: You do not have permission to access this conversation.")
                return None

        db.row_factory = sqlite3.Row

        rows = db.execute("""
            SELECT id, role, content, metadata_json, created_at
            FROM messages
            WHERE conversation_id = ?
            ORDER BY id DESC
            LIMIT ?
        """, (str(conversation_id), limit)).fetchall()

    return [dict(row) for row in reversed(rows)]


def init_feedback_table(db):
    """Ensure feedback table exists with stars and updated_at columns."""
    db.execute("""
        CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id TEXT NOT NULL,
            message_id TEXT,
            rating TEXT NOT NULL,
            stars INTEGER,
            comment TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Ensure columns exist if table was created in an earlier migration
    cols = [r[1] for r in db.execute("PRAGMA table_info(feedback)").fetchall()]
    if "stars" not in cols:
        db.execute("ALTER TABLE feedback ADD COLUMN stars INTEGER")
    if "updated_at" not in cols:
        db.execute("ALTER TABLE feedback ADD COLUMN updated_at TEXT")
    db.execute("CREATE INDEX IF NOT EXISTS idx_feedback_conv ON feedback(conversation_id)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_feedback_msg ON feedback(message_id)")


def save_feedback(conversation_id, message_id, rating, stars=None, comment=None):
    """Save or update customer feedback against a specific assistant message. Prevents duplicate records."""
    if is_firestore_active():
        from src.storage import firestore_store
        return firestore_store.save_feedback(conversation_id, message_id, rating, stars=stars, comment=comment)
    ensure_db_initialized()

    with get_db_connection() as db:
        init_feedback_table(db)

        # Normalize stars (1 to 5)
        clean_stars = None
        if stars is not None:
            try:
                parsed_stars = int(stars)
                if 1 <= parsed_stars <= 5:
                    clean_stars = parsed_stars
            except (ValueError, TypeError):
                clean_stars = None

        # If rating is not provided or empty, default based on stars
        clean_rating = str(rating).strip() if rating else (f"{clean_stars}_star" if clean_stars else "feedback")
        clean_comment = str(comment).strip() if comment and str(comment).strip() else None

        # Check for existing feedback record for this specific message in the conversation
        existing = None
        if message_id:
            existing = db.execute(
                "SELECT id, stars, rating, comment FROM feedback WHERE conversation_id = ? AND message_id = ?",
                (str(conversation_id), str(message_id))
            ).fetchone()

        if existing:
            # Update existing rating/stars and optionally update comment if provided
            db.execute("""
                UPDATE feedback
                SET rating = ?,
                    stars = COALESCE(?, stars),
                    comment = CASE WHEN ? IS NOT NULL THEN ? ELSE comment END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (
                clean_rating,
                clean_stars,
                clean_comment,
                clean_comment,
                existing[0]
            ))
            feedback_id = existing[0]
        else:
            cur = db.execute("""
                INSERT INTO feedback
                (conversation_id, message_id, rating, stars, comment, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """, (
                str(conversation_id),
                str(message_id) if message_id else None,
                clean_rating,
                clean_stars,
                clean_comment
            ))
            feedback_id = cur.lastrowid

        return feedback_id


def get_feedback_analytics():
    """Compute aggregate analytics for Admin views: average rating, 1-5 star distribution, thumbs counts."""
    if is_firestore_active():
        from src.storage import firestore_store
        return firestore_store.get_feedback_analytics()
    ensure_db_initialized()

    with get_db_connection() as db:
        init_feedback_table(db)
        db.row_factory = sqlite3.Row

        # Calculate 1-5 star distribution
        rows = db.execute("""
            SELECT stars, COUNT(*) as cnt
            FROM feedback
            WHERE stars IS NOT NULL AND stars BETWEEN 1 AND 5
            GROUP BY stars
        """).fetchall()

        distribution = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        total_stars = 0
        sum_stars = 0
        for r in rows:
            st = int(r["stars"])
            cnt = int(r["cnt"])
            distribution[st] = cnt
            total_stars += cnt
            sum_stars += st * cnt

        avg_rating = round(sum_stars / total_stars, 2) if total_stars > 0 else 0.0

        # Thumbs count
        thumbs_rows = db.execute("""
            SELECT rating, COUNT(*) as cnt
            FROM feedback
            WHERE rating IN ('helpful', 'unhelpful')
            GROUP BY rating
        """).fetchall()
        thumbs = {r["rating"]: int(r["cnt"]) for r in thumbs_rows}

        total_feedback = db.execute("SELECT COUNT(*) FROM feedback").fetchone()[0]

        # Recent comments
        recent_comments = db.execute("""
            SELECT id, conversation_id, message_id, rating, stars, comment, created_at, updated_at
            FROM feedback
            WHERE comment IS NOT NULL AND TRIM(comment) != ''
            ORDER BY id DESC
            LIMIT 15
        """).fetchall()

        return {
            "total_feedback": total_feedback,
            "total_star_ratings": total_stars,
            "average_rating": avg_rating,
            "star_distribution": distribution,
            "thumbs": {
                "helpful": thumbs.get("helpful", 0),
                "unhelpful": thumbs.get("unhelpful", 0),
            },
            "recent_comments": [dict(r) for r in recent_comments]
        }


def save_report(conversation_id, message_id, reason, details=None):
    """Save customer-reported incorrect or problematic responses."""
    if is_firestore_active():
        from src.storage import firestore_store
        return firestore_store.save_report(conversation_id, message_id, reason, details=details)
    ensure_db_initialized()

    with get_db_connection() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id TEXT NOT NULL,
                message_id TEXT,
                reason TEXT NOT NULL,
                details TEXT,
                status TEXT DEFAULT 'pending',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        db.execute("CREATE INDEX IF NOT EXISTS idx_reports_conv ON reports(conversation_id)")

        db.execute("""
            INSERT INTO reports
            (conversation_id, message_id, reason, details)
            VALUES (?, ?, ?, ?)
        """, (str(conversation_id), str(message_id) if message_id else None, str(reason), details))


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
    Client-supplied conversation_ids are NEVER trusted as proof of ownership.
    """
    if is_firestore_active():
        from src.storage import firestore_store
        return firestore_store.list_conversations(
            session_token=session_token,
            is_admin=is_admin,
            search=search,
            limit=limit,
            offset=offset,
            conversation_ids=conversation_ids
        )
    ensure_db_initialized()

    with get_db_connection() as db:
        db.row_factory = sqlite3.Row

        params: List[Any] = []
        where_clauses: List[str] = []

        if not is_admin:
            # Customers are strictly restricted to their own session token
            if not session_token or not str(session_token).strip():
                return {"conversations": [], "total": 0, "has_more": False, "limit": limit, "offset": offset}
            where_clauses.append("co.session_token = ?")
            params.append(str(session_token).strip())
        else:
            # Admin may optionally filter by specific IDs if needed
            if conversation_ids is not None:
                if not conversation_ids:
                    return {"conversations": [], "total": 0, "has_more": False, "limit": limit, "offset": offset}
                placeholders = ",".join("?" for _ in conversation_ids)
                where_clauses.append(f"m.conversation_id IN ({placeholders})")
                params.extend(conversation_ids)

        if search and search.strip():
            term = f"%{search.strip()}%"
            where_clauses.append("(m.content LIKE ? OR m.conversation_id LIKE ?)")
            params.extend([term, term])

        where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

        count_sql = f"""
            SELECT COUNT(DISTINCT m.conversation_id)
            FROM messages m
            JOIN conversation_owners co ON co.conversation_id = m.conversation_id
            {where_sql}
        """
        total = db.execute(count_sql, params).fetchone()[0]

        data_sql = f"""
            SELECT 
                m.conversation_id,
                co.custom_title,
                MIN(m.created_at) as created_at,
                MAX(m.created_at) as last_updated,
                COUNT(*) as message_count,
                (SELECT content FROM messages m2 WHERE m2.conversation_id = m.conversation_id AND m2.role = 'user' ORDER BY m2.id ASC LIMIT 1) as first_user_message,
                (SELECT content FROM messages m3 WHERE m3.conversation_id = m.conversation_id ORDER BY m3.id DESC LIMIT 1) as last_message
            FROM messages m
            JOIN conversation_owners co ON co.conversation_id = m.conversation_id
            {where_sql}
            GROUP BY m.conversation_id
            ORDER BY MAX(m.id) DESC
            LIMIT ? OFFSET ?
        """
        query_params = list(params) + [int(limit), int(offset)]
        rows = db.execute(data_sql, query_params).fetchall()

        conversations = []
        for r in rows:
            if r["custom_title"] and str(r["custom_title"]).strip():
                title = str(r["custom_title"]).strip()
            elif r["first_user_message"]:
                title = r["first_user_message"][:65] + ("..." if len(r["first_user_message"]) > 65 else "")
            else:
                title = f"Conversation {r['conversation_id'][:8]}"

            last_preview = r["last_message"] or ""
            last_preview = last_preview[:95] + ("..." if len(last_preview) > 95 else "")

            conversations.append({
                "conversation_id": r["conversation_id"],
                "title": title,
                "custom_title": r["custom_title"],
                "first_user_message": r["first_user_message"],
                "last_message": last_preview,
                "message_count": r["message_count"],
                "created_at": r["created_at"],
                "last_updated": r["last_updated"],
            })

        has_more = (offset + len(conversations)) < total
        return {
            "conversations": conversations,
            "total": total,
            "has_more": has_more,
            "limit": limit,
            "offset": offset
        }


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
    """Save an attachment record linked to its conversation and session owner."""
    if is_firestore_active():
        from src.storage import firestore_store
        return firestore_store.save_attachment_record(
            attachment_id=attachment_id,
            conversation_id=conversation_id,
            session_token=session_token,
            original_filename=original_filename,
            stored_filename=stored_filename,
            file_path=file_path,
            mime_type=mime_type,
            file_size=file_size,
            extracted_text=extracted_text,
            storage_provider=storage_provider,
            blob_pathname=blob_pathname,
            blob_url=blob_url,
            blob_download_url=blob_download_url,
            access=access
        )
    ensure_db_initialized()
    with get_db_connection() as db:
        db.execute("""
            INSERT INTO attachments
            (id, conversation_id, session_token, original_filename, stored_filename, file_path, mime_type, file_size, extracted_text)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            str(attachment_id),
            str(conversation_id),
            str(session_token),
            str(original_filename),
            str(stored_filename),
            str(file_path),
            str(mime_type),
            int(file_size),
            extracted_text
        ))


def get_attachment_record(attachment_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve an attachment record by ID."""
    if is_firestore_active():
        from src.storage import firestore_store
        return firestore_store.get_attachment_record(attachment_id)
    ensure_db_initialized()
    with get_db_connection() as db:
        db.row_factory = sqlite3.Row
        row = db.execute("SELECT * FROM attachments WHERE id = ?", (str(attachment_id),)).fetchone()
        return dict(row) if row else None


def get_attachments_by_ids(attachment_ids: List[str]) -> List[Dict[str, Any]]:
    """Retrieve multiple attachment records by IDs."""
    if not attachment_ids:
        return []
    if is_firestore_active():
        from src.storage import firestore_store
        return firestore_store.get_attachments_by_ids(attachment_ids)
    ensure_db_initialized()
    with get_db_connection() as db:
        db.row_factory = sqlite3.Row
        placeholders = ",".join("?" for _ in attachment_ids)
        rows = db.execute(f"SELECT * FROM attachments WHERE id IN ({placeholders})", [str(i) for i in attachment_ids]).fetchall()
        return [dict(r) for r in rows]


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
    if is_firestore_active():
        from src.storage import firestore_store
        return firestore_store.delete_conversation(conversation_id, session_token=session_token, is_admin=is_admin)
    ensure_db_initialized()
    with get_db_connection() as db:
        # Check authorization
        authorized, reason = verify_conversation_ownership(conversation_id, session_token, is_admin=is_admin, db=db)
        if not authorized:
            if reason == "forbidden":
                raise PermissionError("Access denied: You do not have permission to delete this conversation.")
            return False

        # Retrieve file paths to remove from disk
        attachment_rows = db.execute("SELECT file_path FROM attachments WHERE conversation_id = ?", (str(conversation_id),)).fetchall()
        for r in attachment_rows:
            try:
                p = Path(r[0])
                if p.is_file():
                    p.unlink(missing_ok=True)
            except Exception:
                pass

        # Cleanup attachment directory if empty
        conv_dir = ROOT / "data" / "chat_attachments" / str(conversation_id)
        if conv_dir.is_dir():
            try:
                for f in conv_dir.glob("*"):
                    f.unlink(missing_ok=True)
                conv_dir.rmdir()
            except Exception:
                pass

        db.execute("DELETE FROM conversation_owners WHERE conversation_id = ?", (str(conversation_id),))
        db.execute("DELETE FROM messages WHERE conversation_id = ?", (str(conversation_id),))
        db.execute("DELETE FROM feedback WHERE conversation_id = ?", (str(conversation_id),))
        db.execute("DELETE FROM reports WHERE conversation_id = ?", (str(conversation_id),))
        db.execute("DELETE FROM attachments WHERE conversation_id = ?", (str(conversation_id),))
        db.execute("DELETE FROM support_tickets WHERE conversation_id = ?", (str(conversation_id),))
        db.execute("DELETE FROM ticket_messages WHERE conversation_id = ?", (str(conversation_id),))
        return True


# =============================================================================
# CONVERSATION MANAGEMENT (RENAME & METADATA)
# =============================================================================

def rename_conversation(
    conversation_id: str,
    new_title: str,
    session_token: Optional[str] = None,
    is_admin: bool = False
) -> bool:
    """Rename a conversation title while enforcing ownership."""
    if is_firestore_active():
        from src.storage import firestore_store
        return firestore_store.rename_conversation(conversation_id, new_title, session_token=session_token, is_admin=is_admin)
    ensure_db_initialized()
    clean_title = str(new_title or "").strip()
    if not clean_title:
        return False

    with get_db_connection() as db:
        authorized, reason = verify_conversation_ownership(conversation_id, session_token, is_admin=is_admin, db=db)
        if not authorized:
            if reason == "forbidden":
                raise PermissionError("Access denied: You cannot rename a conversation you do not own.")
            return False

        cur = db.execute("""
            UPDATE conversation_owners
            SET custom_title = ?, updated_at = CURRENT_TIMESTAMP
            WHERE conversation_id = ?
        """, (clean_title[:100], str(conversation_id)))
        return cur.rowcount > 0


# =============================================================================
# ADMIN SESSION MANAGEMENT (AUTHENTICATION & PERSISTENCE)
# =============================================================================

def create_admin_session(hours: int = 24) -> str:
    """Create a new cryptographically secure admin session token."""
    if is_firestore_active():
        from src.storage import firestore_store
        return firestore_store.create_admin_session(hours=hours)
    ensure_db_initialized()
    token = f"admin_sess_{secrets.token_hex(32)}"
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()
    with get_db_connection() as db:
        db.execute(
            "INSERT INTO admin_sessions (token, expires_at) VALUES (?, ?)",
            (token, expires_at)
        )
    return token


def verify_admin_session(token: Optional[str]) -> bool:
    """Verify if an admin session token is valid and unexpired."""
    if is_firestore_active():
        from src.storage import firestore_store
        return firestore_store.verify_admin_session(token)
    if not token or not str(token).strip():
        return False
    ensure_db_initialized()
    with get_db_connection() as db:
        row = db.execute(
            "SELECT expires_at FROM admin_sessions WHERE token = ?",
            (str(token).strip(),)
        ).fetchone()
        if not row:
            return False
        try:
            expires = datetime.fromisoformat(row[0])
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > expires:
                db.execute("DELETE FROM admin_sessions WHERE token = ?", (str(token).strip(),))
                return False
            return True
        except Exception:
            return False


def revoke_admin_session(token: Optional[str]) -> bool:
    """Revoke an active admin session."""
    if is_firestore_active():
        from src.storage import firestore_store
        return firestore_store.revoke_admin_session(token)
    if not token:
        return False
    ensure_db_initialized()
    with get_db_connection() as db:
        cur = db.execute("DELETE FROM admin_sessions WHERE token = ?", (str(token).strip(),))
        return cur.rowcount > 0


# =============================================================================
# HUMAN SUPPORT TICKETS & ESCALATION WORKSPACE
# =============================================================================

def create_support_ticket(
    conversation_id: str,
    session_token: str,
    reason: str,
    customer_name: str = "Customer",
    priority: str = "normal"
) -> Dict[str, Any]:
    """Create a human support escalation ticket for a conversation."""
    if is_firestore_active():
        from src.storage import firestore_store
        return firestore_store.create_support_ticket(
            conversation_id=conversation_id,
            session_token=session_token,
            reason=reason,
            customer_name=customer_name,
            priority=priority
        )
    ensure_db_initialized()
    ticket_id = f"TICK-{uuid.uuid4().hex[:8].upper()}"
    with get_db_connection() as db:
        if session_token:
            db.execute("""
                INSERT OR IGNORE INTO conversation_owners (conversation_id, session_token)
                VALUES (?, ?)
            """, (str(conversation_id), str(session_token)))

        db.execute("""
            INSERT INTO support_tickets 
            (id, conversation_id, session_token, customer_name, reason, status, priority, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'open', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """, (
            ticket_id,
            str(conversation_id),
            str(session_token),
            str(customer_name or "Customer").strip()[:60],
            str(reason).strip()[:500],
            str(priority).lower() if str(priority).lower() in ("low", "normal", "high", "urgent") else "normal"
        ))

        # Record initial system event in ticket messages
        msg_id = str(uuid.uuid4())
        db.execute("""
            INSERT INTO ticket_messages (id, ticket_id, conversation_id, sender_role, sender_name, message, is_internal_note, created_at)
            VALUES (?, ?, ?, 'system', 'Nexus System', ?, 0, CURRENT_TIMESTAMP)
        """, (
            msg_id,
            ticket_id,
            str(conversation_id),
            f"Customer requested human support agent escalation. Reason: {reason}"
        ))

    return {
        "id": ticket_id,
        "conversation_id": conversation_id,
        "customer_name": customer_name,
        "reason": reason,
        "status": "open",
        "priority": priority,
    }


def get_ticket_by_conversation(
    conversation_id: str,
    session_token: Optional[str] = None,
    is_admin: bool = False
) -> Optional[Dict[str, Any]]:
    """Get active support ticket details for a conversation."""
    if is_firestore_active():
        from src.storage import firestore_store
        return firestore_store.get_ticket_by_conversation(conversation_id, session_token=session_token, is_admin=is_admin)
    ensure_db_initialized()
    with get_db_connection() as db:
        db.row_factory = sqlite3.Row
        if not is_admin:
            if not session_token:
                return None
            row = db.execute(
                "SELECT * FROM support_tickets WHERE conversation_id = ? AND session_token = ? ORDER BY created_at DESC LIMIT 1",
                (str(conversation_id), str(session_token))
            ).fetchone()
        else:
            row = db.execute(
                "SELECT * FROM support_tickets WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1",
                (str(conversation_id),)
            ).fetchone()

        if not row:
            return None
        return dict(row)


def list_support_tickets(
    status: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
) -> Dict[str, Any]:
    """List support tickets for Support Agent Workspace (admin only)."""
    if is_firestore_active():
        from src.storage import firestore_store
        return firestore_store.list_support_tickets(status=status, search=search, limit=limit, offset=offset)
    ensure_db_initialized()
    with get_db_connection() as db:
        db.row_factory = sqlite3.Row
        where_clauses = []
        params: List[Any] = []

        if status and status.strip() and status != "all":
            where_clauses.append("status = ?")
            params.append(status.strip().lower())

        if search and search.strip():
            term = f"%{search.strip()}%"
            where_clauses.append("(id LIKE ? OR customer_name LIKE ? OR reason LIKE ? OR conversation_id LIKE ?)")
            params.extend([term, term, term, term])

        where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

        total = db.execute(f"SELECT COUNT(*) FROM support_tickets {where_sql}", params).fetchone()[0]

        rows = db.execute(f"""
            SELECT * FROM support_tickets
            {where_sql}
            ORDER BY 
                CASE priority 
                    WHEN 'urgent' THEN 1 
                    WHEN 'high' THEN 2 
                    WHEN 'normal' THEN 3 
                    ELSE 4 
                END,
                created_at DESC
            LIMIT ? OFFSET ?
        """, params + [limit, offset]).fetchall()

        return {
            "tickets": [dict(r) for r in rows],
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": (offset + len(rows)) < total
        }


def get_ticket_details(ticket_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve full ticket details including conversation messages and ticket timeline."""
    if is_firestore_active():
        from src.storage import firestore_store
        return firestore_store.get_ticket_details(ticket_id)
    ensure_db_initialized()
    with get_db_connection() as db:
        db.row_factory = sqlite3.Row
        t_row = db.execute("SELECT * FROM support_tickets WHERE id = ?", (str(ticket_id),)).fetchone()
        if not t_row:
            return None
        ticket = dict(t_row)

        m_rows = db.execute("""
            SELECT * FROM ticket_messages
            WHERE ticket_id = ?
            ORDER BY created_at ASC
        """, (str(ticket_id),)).fetchall()
        ticket["messages"] = [dict(m) for m in m_rows]
        return ticket


def update_ticket(
    ticket_id: str,
    status: Optional[str] = None,
    assigned_agent: Optional[str] = None,
    priority: Optional[str] = None
) -> bool:
    """Update support ticket status, assigned agent, or priority."""
    if is_firestore_active():
        from src.storage import firestore_store
        return firestore_store.update_ticket(ticket_id, status=status, assigned_agent=assigned_agent, priority=priority)
    ensure_db_initialized()
    updates = []
    params: List[Any] = []

    if status and status.strip() in ("open", "in_progress", "waiting", "resolved"):
        updates.append("status = ?")
        params.append(status.strip())

    if assigned_agent is not None:
        updates.append("assigned_agent = ?")
        params.append(str(assigned_agent).strip() if assigned_agent else None)

    if priority and priority.strip().lower() in ("low", "normal", "high", "urgent"):
        updates.append("priority = ?")
        params.append(priority.strip().lower())

    if not updates:
        return False

    updates.append("updated_at = CURRENT_TIMESTAMP")
    params.append(str(ticket_id))

    with get_db_connection() as db:
        cur = db.execute(f"""
            UPDATE support_tickets
            SET {", ".join(updates)}
            WHERE id = ?
        """, params)
        return cur.rowcount > 0


def add_ticket_message(
    ticket_id: str,
    conversation_id: str,
    sender_role: str,
    sender_name: str,
    message: str,
    is_internal_note: bool = False
) -> Dict[str, Any]:
    """Add a message or internal note to a support ticket, and post agent replies to the chat history."""
    if is_firestore_active():
        from src.storage import firestore_store
        return firestore_store.add_ticket_message(
            ticket_id=ticket_id,
            conversation_id=conversation_id,
            sender_role=sender_role,
            sender_name=sender_name,
            message=message,
            is_internal_note=is_internal_note
        )
    ensure_db_initialized()
    msg_id = str(uuid.uuid4())
    clean_msg = str(message).strip()

    with get_db_connection() as db:
        db.execute("""
            INSERT INTO ticket_messages
            (id, ticket_id, conversation_id, sender_role, sender_name, message, is_internal_note, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (
            msg_id,
            str(ticket_id),
            str(conversation_id),
            str(sender_role),
            str(sender_name),
            clean_msg,
            1 if is_internal_note else 0
        ))

        # If agent replied publicly (not an internal note), inject directly into conversation messages
        if sender_role == "agent" and not is_internal_note:
            meta = {
                "human_agent": True,
                "agent_name": sender_name,
                "ticket_id": ticket_id
            }
            db.execute("""
                INSERT INTO messages (conversation_id, role, content, metadata_json)
                VALUES (?, 'assistant', ?, ?)
            """, (str(conversation_id), clean_msg, json.dumps(meta)))

            # Automatically move ticket to in_progress or waiting
            db.execute("""
                UPDATE support_tickets
                SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND status = 'open'
            """, (str(ticket_id),))

    return {
        "id": msg_id,
        "ticket_id": ticket_id,
        "sender_role": sender_role,
        "sender_name": sender_name,
        "message": clean_msg,
        "is_internal_note": is_internal_note,
        "created_at": datetime.now(timezone.utc).isoformat()
    }


def get_ticket_messages(ticket_id: str, include_internal: bool = False) -> List[Dict[str, Any]]:
    """Retrieve messages for a support ticket, optionally filtering internal notes."""
    if is_firestore_active():
        from src.storage import firestore_store
        return firestore_store.get_ticket_messages(ticket_id, include_internal=include_internal)
    ensure_db_initialized()
    with get_db_connection() as db:
        db.row_factory = sqlite3.Row
        if include_internal:
            rows = db.execute(
                "SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC",
                (str(ticket_id),)
            ).fetchall()
        else:
            rows = db.execute(
                "SELECT * FROM ticket_messages WHERE ticket_id = ? AND is_internal_note = 0 ORDER BY created_at ASC",
                (str(ticket_id),)
            ).fetchall()
        return [dict(r) for r in rows]


# =============================================================================
# ADMIN ANALYTICS OVERVIEW (REAL AGGREGATES)
# =============================================================================

def get_admin_overview_analytics(days: int = 30) -> Dict[str, Any]:
    """Compute comprehensive real-data analytics across conversations, feedback, and intent models."""
    if is_firestore_active():
        from src.storage import firestore_store
        return firestore_store.get_admin_overview_analytics(days=days)
    ensure_db_initialized()
    with get_db_connection() as db:
        init_feedback_table(db)
        db.row_factory = sqlite3.Row

        # 1. Total counts
        total_convs = db.execute("SELECT COUNT(DISTINCT conversation_id) FROM messages").fetchone()[0]
        total_msgs = db.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
        user_msgs = db.execute("SELECT COUNT(*) FROM messages WHERE role = 'user'").fetchone()[0]
        ai_msgs = db.execute("SELECT COUNT(*) FROM messages WHERE role = 'assistant'").fetchone()[0]

        # 2. Feedback CSAT stats
        star_rows = db.execute("""
            SELECT stars, COUNT(*) as cnt
            FROM feedback
            WHERE stars IS NOT NULL AND stars BETWEEN 1 AND 5
            GROUP BY stars
        """).fetchall()
        star_counts = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        total_star_ratings = 0
        sum_stars = 0
        for r in star_rows:
            s, c = int(r["stars"]), int(r["cnt"])
            star_counts[s] = c
            total_star_ratings += c
            sum_stars += s * c

        avg_stars = round(sum_stars / total_star_ratings, 2) if total_star_ratings > 0 else 0.0

        # Thumbs up / down
        thumbs_up = db.execute("SELECT COUNT(*) FROM feedback WHERE rating = 'helpful'").fetchone()[0]
        thumbs_down = db.execute("SELECT COUNT(*) FROM feedback WHERE rating = 'unhelpful'").fetchone()[0]
        total_feedback = db.execute("SELECT COUNT(*) FROM feedback").fetchone()[0]

        # 3. Intent & Sentiment breakdown extracted from assistant metadata
        intent_counts: Dict[str, int] = {}
        sentiment_counts = {"positive": 0, "neutral": 0, "negative": 0}
        review_required_count = 0

        assistant_rows = db.execute("""
            SELECT metadata_json FROM messages
            WHERE role = 'assistant' AND metadata_json IS NOT NULL AND metadata_json != '{}'
            ORDER BY id DESC LIMIT 500
        """).fetchall()

        for row in assistant_rows:
            try:
                m = json.loads(row["metadata_json"])
                if not isinstance(m, dict):
                    continue
                intent_name = m.get("intent")
                if intent_name and isinstance(intent_name, str):
                    intent_counts[intent_name] = intent_counts.get(intent_name, 0) + 1
                sent = m.get("sentiment")
                if sent in sentiment_counts:
                    sentiment_counts[sent] += 1
                if m.get("requires_human_review"):
                    review_required_count += 1
            except Exception:
                pass

        top_intents = sorted(
            [{"intent": k, "count": v} for k, v in intent_counts.items()],
            key=lambda x: x["count"],
            reverse=True
        )[:10]

        # 4. Attachments Stats
        att_row = db.execute("SELECT COUNT(*), COALESCE(SUM(file_size), 0) FROM attachments").fetchone()
        total_attachments = att_row[0] or 0
        total_attachment_bytes = att_row[1] or 0

        # 5. Support Tickets
        open_tickets = db.execute("SELECT COUNT(*) FROM support_tickets WHERE status = 'open'").fetchone()[0]
        in_progress_tickets = db.execute("SELECT COUNT(*) FROM support_tickets WHERE status = 'in_progress'").fetchone()[0]
        resolved_tickets = db.execute("SELECT COUNT(*) FROM support_tickets WHERE status = 'resolved'").fetchone()[0]
        reports_count = db.execute("SELECT COUNT(*) FROM reports").fetchone()[0]

        # 6. Conversation Trends and Period Counts (last N days)
        period_convs = db.execute(
            "SELECT COUNT(DISTINCT conversation_id) FROM messages WHERE created_at >= DATE('now', '-' || ? || ' days')",
            (str(days),)
        ).fetchone()[0]
        period_msgs = db.execute(
            "SELECT COUNT(*) FROM messages WHERE created_at >= DATE('now', '-' || ? || ' days')",
            (str(days),)
        ).fetchone()[0]
        period_feedback = db.execute(
            "SELECT COUNT(*) FROM feedback WHERE created_at >= DATE('now', '-' || ? || ' days')",
            (str(days),)
        ).fetchone()[0]

        trend_rows = db.execute("""
            SELECT DATE(created_at) as day, COUNT(DISTINCT conversation_id) as conv_count, COUNT(*) as msg_count
            FROM messages
            WHERE created_at >= DATE('now', '-' || ? || ' days')
            GROUP BY DATE(created_at)
            ORDER BY day ASC
        """, (str(days),)).fetchall()

        trends = [
            {"date": r["day"], "conversations": r["conv_count"], "messages": r["msg_count"]}
            for r in trend_rows
        ]

        return {
            "overview": {
                "selected_days": days,
                "period_conversations": period_convs,
                "period_messages": period_msgs,
                "period_feedback": period_feedback,
                "total_conversations": total_convs,
                "total_messages": total_msgs,
                "user_messages": user_msgs,
                "assistant_messages": ai_msgs,
                "total_attachments": total_attachments,
                "total_attachment_mb": round(total_attachment_bytes / (1024 * 1024), 2),
                "open_tickets": open_tickets,
                "in_progress_tickets": in_progress_tickets,
                "resolved_tickets": resolved_tickets,
                "reports_count": reports_count,
                "requires_review_count": review_required_count
            },
            "csat": {
                "average_rating": avg_stars,
                "total_ratings": total_star_ratings,
                "total_feedback": total_feedback,
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
    if is_firestore_active():
        from src.storage import firestore_store
        return firestore_store.list_knowledge_faqs(search=search, limit=limit, offset=offset)
    ensure_db_initialized()
    with get_db_connection() as db:
        db.row_factory = sqlite3.Row
        where_sql = ""
        params: List[Any] = []
        if search and search.strip():
            term = f"%{search.strip()}%"
            where_sql = "WHERE (question LIKE ? OR answer LIKE ? OR intent LIKE ? OR category LIKE ?)"
            params.extend([term, term, term, term])

        total = db.execute(f"SELECT COUNT(*) FROM custom_knowledge_faqs {where_sql}", params).fetchone()[0]
        rows = db.execute(f"""
            SELECT * FROM custom_knowledge_faqs
            {where_sql}
            ORDER BY updated_at DESC
            LIMIT ? OFFSET ?
        """, params + [limit, offset]).fetchall()

        return {
            "faqs": [dict(r) for r in rows],
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": (offset + len(rows)) < total
        }


def save_knowledge_faq(
    faq_id: Optional[str],
    intent: str,
    category: str,
    question: str,
    answer: str,
    keywords: str = ""
) -> Dict[str, Any]:
    """Create or update a custom FAQ record in the knowledge store."""
    if is_firestore_active():
        from src.storage import firestore_store
        return firestore_store.save_knowledge_faq(faq_id, intent, category, question, answer, keywords=keywords)
    ensure_db_initialized()
    clean_id = str(faq_id).strip() if faq_id and str(faq_id).strip() else f"faq_{uuid.uuid4().hex[:12]}"
    with get_db_connection() as db:
        db.execute("""
            INSERT INTO custom_knowledge_faqs
            (id, intent, category, question, answer, keywords, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                intent = excluded.intent,
                category = excluded.category,
                question = excluded.question,
                answer = excluded.answer,
                keywords = excluded.keywords,
                updated_at = CURRENT_TIMESTAMP
        """, (
            clean_id,
            str(intent).strip(),
            str(category or "General Banking").strip(),
            str(question).strip(),
            str(answer).strip(),
            str(keywords or "").strip()
        ))
    return {
        "id": clean_id,
        "intent": intent,
        "category": category,
        "question": question,
        "answer": answer,
        "keywords": keywords
    }


def delete_knowledge_faq(faq_id: str) -> bool:
    """Delete a custom FAQ entry."""
    if is_firestore_active():
        from src.storage import firestore_store
        return firestore_store.delete_knowledge_faq(faq_id)
    ensure_db_initialized()
    with get_db_connection() as db:
        cur = db.execute("DELETE FROM custom_knowledge_faqs WHERE id = ?", (str(faq_id),))
        return cur.rowcount > 0



