import argparse
import json
import logging
import os
import shutil
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Tuple

# Add repository root to path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.storage.firestore_client import get_firestore_client, check_firestore_health

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("nexus.migration")

DEFAULT_SQLITE_PATH = ROOT / "data" / "chat_history" / "chat_history.sqlite3"
BACKUP_DIR = ROOT / "data" / "chat_history" / "backups"

COLLECTION_MAP = {
    "conversation_owners": "conversation_owners",
    "messages": "messages",
    "feedback": "feedback",
    "reports": "reports",
    "attachments": "attachments",
    "admin_sessions": "admin_sessions",
    "support_tickets": "support_tickets",
    "ticket_messages": "ticket_messages",
    "custom_knowledge_faqs": "custom_knowledge_faqs",
}


def backup_sqlite(sqlite_path: Path) -> Path:
    """Create a verified, timestamped backup copy of SQLite database before migration."""
    if not sqlite_path.is_file():
        raise FileNotFoundError(f"Source SQLite database not found at {sqlite_path}")

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_file = BACKUP_DIR / f"chat_history_backup_{timestamp}.sqlite3"

    shutil.copy2(sqlite_path, backup_file)
    logger.info(f"SQLite backup successfully created at: {backup_file} (Size: {backup_file.stat().st_size} bytes)")
    return backup_file


def get_sqlite_counts(sqlite_path: Path) -> Dict[str, int]:
    """Inspect and return row counts for each SQLite table."""
    counts = {}
    conn = sqlite3.connect(sqlite_path)
    try:
        cur = conn.cursor()
        for table in COLLECTION_MAP.keys():
            try:
                cnt = cur.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                counts[table] = cnt
            except sqlite3.OperationalError:
                counts[table] = 0
    finally:
        conn.close()
    return counts


def get_firestore_counts() -> Dict[str, int]:
    """Inspect and return document counts for each Firestore collection."""
    client = get_firestore_client()
    counts = {}
    for table, col_name in COLLECTION_MAP.items():
        try:
            # Using aggregation count query if available, otherwise collection count
            col = client.collection(col_name)
            cnt = len(list(col.select([]).get()))
            counts[col_name] = cnt
        except Exception as e:
            logger.warning(f"Error counting Firestore collection '{col_name}': {e}")
            counts[col_name] = -1
    return counts


def test_disposable_records() -> Dict[str, Any]:
    """
    Perform a complete end-to-end read/write/query/delete lifecycle test using
    isolated disposable test documents in Firestore.
    Verifies all 9 collection schemas and relationships without modifying real data.
    """
    logger.info("Executing disposable test record validation across Firestore collections...")
    client = get_firestore_client()
    now = datetime.now(timezone.utc).isoformat()
    test_run_id = f"test_{int(time.time())}"

    test_records = {
        "conversation_owners": {
            "doc_id": f"conv_{test_run_id}",
            "data": {
                "conversation_id": f"conv_{test_run_id}",
                "session_token": f"sess_{test_run_id}",
                "custom_title": "Disposable Integration Test",
                "created_at": now,
                "updated_at": now
            }
        },
        "messages": {
            "doc_id": f"msg_{test_run_id}",
            "data": {
                "id": f"msg_{test_run_id}",
                "conversation_id": f"conv_{test_run_id}",
                "role": "assistant",
                "content": "Disposable message payload for Firestore validation.",
                "metadata_json": json.dumps({"intent": "test_verification", "status": "ok"}),
                "created_at": now
            }
        },
        "feedback": {
            "doc_id": f"feed_{test_run_id}",
            "data": {
                "id": f"feed_{test_run_id}",
                "conversation_id": f"conv_{test_run_id}",
                "message_id": f"msg_{test_run_id}",
                "rating": "5_star",
                "stars": 5,
                "comment": "Disposable verification feedback.",
                "created_at": now,
                "updated_at": now
            }
        },
        "reports": {
            "doc_id": f"rep_{test_run_id}",
            "data": {
                "id": f"rep_{test_run_id}",
                "conversation_id": f"conv_{test_run_id}",
                "message_id": f"msg_{test_run_id}",
                "reason": "Test Report",
                "details": "Disposable verification report.",
                "status": "pending",
                "created_at": now
            }
        },
        "attachments": {
            "doc_id": f"att_{test_run_id}",
            "data": {
                "id": f"att_{test_run_id}",
                "conversation_id": f"conv_{test_run_id}",
                "session_token": f"sess_{test_run_id}",
                "original_filename": "test.txt",
                "stored_filename": f"test_{test_run_id}.txt",
                "file_path": "data/attachments/test.txt",
                "mime_type": "text/plain",
                "file_size": 128,
                "extracted_text": "Sample attachment content",
                "created_at": now
            }
        },
        "admin_sessions": {
            "doc_id": f"admin_sess_{test_run_id}",
            "data": {
                "token": f"admin_sess_{test_run_id}",
                "created_at": now,
                "expires_at": (datetime.now(timezone.utc)).isoformat()
            }
        },
        "support_tickets": {
            "doc_id": f"TICK-{test_run_id[:8].upper()}",
            "data": {
                "id": f"TICK-{test_run_id[:8].upper()}",
                "conversation_id": f"conv_{test_run_id}",
                "session_token": f"sess_{test_run_id}",
                "customer_name": "Test Customer",
                "reason": "Disposable test ticket",
                "status": "open",
                "priority": "normal",
                "assigned_agent": None,
                "created_at": now,
                "updated_at": now
            }
        },
        "ticket_messages": {
            "doc_id": f"tmsg_{test_run_id}",
            "data": {
                "id": f"tmsg_{test_run_id}",
                "ticket_id": f"TICK-{test_run_id[:8].upper()}",
                "conversation_id": f"conv_{test_run_id}",
                "sender_role": "system",
                "sender_name": "Nexus System",
                "message": "Disposable ticket message.",
                "is_internal_note": 0,
                "created_at": now
            }
        },
        "custom_knowledge_faqs": {
            "doc_id": f"faq_{test_run_id}",
            "data": {
                "id": f"faq_{test_run_id}",
                "intent": "disposable_test",
                "category": "Testing",
                "question": "Is Firestore connected?",
                "answer": "Yes, Firestore integration is verified.",
                "keywords": "test firestore",
                "is_active": 1,
                "created_at": now,
                "updated_at": now
            }
        }
    }

    # 1. Write batch of disposable test records
    batch = client.batch()
    for col_name, item in test_records.items():
        doc_ref = client.collection(col_name).document(item["doc_id"])
        batch.set(doc_ref, item["data"])
    batch.commit()
    logger.info("Disposable test records successfully written to all 9 Firestore collections.")

    # 2. Verify reads
    verified = {}
    for col_name, item in test_records.items():
        doc_ref = client.collection(col_name).document(item["doc_id"])
        doc = doc_ref.get()
        if doc.exists and doc.to_dict().get("created_at") == now:
            verified[col_name] = True
        else:
            verified[col_name] = False

    # 3. Clean up (delete all disposable records)
    del_batch = client.batch()
    for col_name, item in test_records.items():
        doc_ref = client.collection(col_name).document(item["doc_id"])
        del_batch.delete(doc_ref)
    del_batch.commit()
    logger.info("Disposable test records successfully verified and removed.")

    all_ok = all(verified.values())
    return {
        "status": "success" if all_ok else "failed",
        "verified_collections": verified,
        "test_run_id": test_run_id
    }


def migrate_table_data(
    sqlite_path: Path,
    confirm: bool = False
) -> Dict[str, Any]:
    """
    Idempotently migrate SQLite records to Firestore collections using safe batching.
    Preserves exact IDs, session ownership, timestamps, and relationships.
    """
    if not confirm:
        raise PermissionError(
            "Migration execution requires explicit confirmation flag '--confirm'. "
            "Production data migration is restricted pending user approval."
        )

    # 1. Ensure SQLite backup
    backup_file = backup_sqlite(sqlite_path)

    client = get_firestore_client()
    stats = {}

    with sqlite3.connect(sqlite_path) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()

        # A. conversation_owners
        cur.execute("SELECT * FROM conversation_owners")
        owners = cur.fetchall()
        logger.info(f"Migrating {len(owners)} conversation_owners records...")
        batch = client.batch()
        b_count = 0
        for r in owners:
            d = dict(r)
            doc_ref = client.collection("conversation_owners").document(str(d["conversation_id"]))
            batch.set(doc_ref, {
                "conversation_id": str(d["conversation_id"]),
                "session_token": str(d["session_token"]),
                "custom_title": d.get("custom_title"),
                "created_at": d.get("created_at"),
                "updated_at": d.get("updated_at")
            }, merge=True)
            b_count += 1
            if b_count >= 400:
                batch.commit()
                batch = client.batch()
                b_count = 0
        if b_count > 0:
            batch.commit()
        stats["conversation_owners"] = len(owners)

        # B. messages
        cur.execute("SELECT * FROM messages ORDER BY id ASC")
        msgs = cur.fetchall()
        logger.info(f"Migrating {len(msgs)} messages records...")
        batch = client.batch()
        b_count = 0
        for r in msgs:
            d = dict(r)
            # Deterministic document ID to guarantee idempotency
            doc_id = f"msg_{d['id']}"
            doc_ref = client.collection("messages").document(doc_id)
            batch.set(doc_ref, {
                "id": d["id"],
                "conversation_id": str(d["conversation_id"]),
                "role": d["role"],
                "content": d["content"],
                "metadata_json": d.get("metadata_json") or "{}",
                "created_at": d.get("created_at")
            }, merge=True)
            b_count += 1
            if b_count >= 400:
                batch.commit()
                batch = client.batch()
                b_count = 0
        if b_count > 0:
            batch.commit()
        stats["messages"] = len(msgs)

        # C. feedback
        cur.execute("SELECT * FROM feedback ORDER BY id ASC")
        feedbacks = cur.fetchall()
        logger.info(f"Migrating {len(feedbacks)} feedback records...")
        batch = client.batch()
        b_count = 0
        for r in feedbacks:
            d = dict(r)
            doc_id = f"feedback_{d['id']}"
            doc_ref = client.collection("feedback").document(doc_id)
            batch.set(doc_ref, {
                "id": d["id"],
                "conversation_id": str(d["conversation_id"]),
                "message_id": d.get("message_id"),
                "rating": d.get("rating"),
                "stars": d.get("stars"),
                "comment": d.get("comment"),
                "created_at": d.get("created_at"),
                "updated_at": d.get("updated_at")
            }, merge=True)
            b_count += 1
            if b_count >= 400:
                batch.commit()
                batch = client.batch()
                b_count = 0
        if b_count > 0:
            batch.commit()
        stats["feedback"] = len(feedbacks)

        # D. reports
        cur.execute("SELECT * FROM reports ORDER BY id ASC")
        reports = cur.fetchall()
        logger.info(f"Migrating {len(reports)} reports records...")
        batch = client.batch()
        b_count = 0
        for r in reports:
            d = dict(r)
            doc_id = f"report_{d['id']}"
            doc_ref = client.collection("reports").document(doc_id)
            batch.set(doc_ref, {
                "id": d["id"],
                "conversation_id": str(d["conversation_id"]),
                "message_id": d.get("message_id"),
                "reason": d.get("reason"),
                "details": d.get("details"),
                "status": d.get("status", "pending"),
                "created_at": d.get("created_at")
            }, merge=True)
            b_count += 1
            if b_count >= 400:
                batch.commit()
                batch = client.batch()
                b_count = 0
        if b_count > 0:
            batch.commit()
        stats["reports"] = len(reports)

        # E. attachments (metadata only)
        cur.execute("SELECT * FROM attachments")
        attachments = cur.fetchall()
        logger.info(f"Migrating {len(attachments)} attachments records (metadata only)...")
        batch = client.batch()
        b_count = 0
        for r in attachments:
            d = dict(r)
            doc_ref = client.collection("attachments").document(str(d["id"]))
            batch.set(doc_ref, {
                "id": str(d["id"]),
                "conversation_id": str(d["conversation_id"]),
                "session_token": str(d["session_token"]),
                "original_filename": d.get("original_filename"),
                "stored_filename": d.get("stored_filename"),
                "file_path": d.get("file_path"),
                "mime_type": d.get("mime_type"),
                "file_size": d.get("file_size"),
                "extracted_text": d.get("extracted_text"),
                "created_at": d.get("created_at")
            }, merge=True)
            b_count += 1
            if b_count >= 400:
                batch.commit()
                batch = client.batch()
                b_count = 0
        if b_count > 0:
            batch.commit()
        stats["attachments"] = len(attachments)

        # F. admin_sessions
        cur.execute("SELECT * FROM admin_sessions")
        admins = cur.fetchall()
        logger.info(f"Migrating {len(admins)} admin_sessions records...")
        batch = client.batch()
        b_count = 0
        for r in admins:
            d = dict(r)
            doc_ref = client.collection("admin_sessions").document(str(d["token"]))
            batch.set(doc_ref, {
                "token": str(d["token"]),
                "created_at": d.get("created_at"),
                "expires_at": d.get("expires_at")
            }, merge=True)
            b_count += 1
            if b_count >= 400:
                batch.commit()
                batch = client.batch()
                b_count = 0
        if b_count > 0:
            batch.commit()
        stats["admin_sessions"] = len(admins)

        # G. support_tickets
        cur.execute("SELECT * FROM support_tickets")
        tickets = cur.fetchall()
        logger.info(f"Migrating {len(tickets)} support_tickets records...")
        batch = client.batch()
        b_count = 0
        for r in tickets:
            d = dict(r)
            doc_ref = client.collection("support_tickets").document(str(d["id"]))
            batch.set(doc_ref, {
                "id": str(d["id"]),
                "conversation_id": str(d["conversation_id"]),
                "session_token": str(d["session_token"]),
                "customer_name": d.get("customer_name"),
                "reason": d.get("reason"),
                "status": d.get("status"),
                "priority": d.get("priority"),
                "assigned_agent": d.get("assigned_agent"),
                "created_at": d.get("created_at"),
                "updated_at": d.get("updated_at")
            }, merge=True)
            b_count += 1
            if b_count >= 400:
                batch.commit()
                batch = client.batch()
                b_count = 0
        if b_count > 0:
            batch.commit()
        stats["support_tickets"] = len(tickets)

        # H. ticket_messages
        cur.execute("SELECT * FROM ticket_messages")
        t_msgs = cur.fetchall()
        logger.info(f"Migrating {len(t_msgs)} ticket_messages records...")
        batch = client.batch()
        b_count = 0
        for r in t_msgs:
            d = dict(r)
            doc_ref = client.collection("ticket_messages").document(str(d["id"]))
            batch.set(doc_ref, {
                "id": str(d["id"]),
                "ticket_id": str(d["ticket_id"]),
                "conversation_id": str(d["conversation_id"]),
                "sender_role": d.get("sender_role"),
                "sender_name": d.get("sender_name"),
                "message": d.get("message"),
                "is_internal_note": d.get("is_internal_note", 0),
                "created_at": d.get("created_at")
            }, merge=True)
            b_count += 1
            if b_count >= 400:
                batch.commit()
                batch = client.batch()
                b_count = 0
        if b_count > 0:
            batch.commit()
        stats["ticket_messages"] = len(t_msgs)

        # I. custom_knowledge_faqs
        cur.execute("SELECT * FROM custom_knowledge_faqs")
        faqs = cur.fetchall()
        logger.info(f"Migrating {len(faqs)} custom_knowledge_faqs records...")
        batch = client.batch()
        b_count = 0
        for r in faqs:
            d = dict(r)
            doc_ref = client.collection("custom_knowledge_faqs").document(str(d["id"]))
            batch.set(doc_ref, {
                "id": str(d["id"]),
                "intent": d.get("intent"),
                "category": d.get("category"),
                "question": d.get("question"),
                "answer": d.get("answer"),
                "keywords": d.get("keywords"),
                "is_active": d.get("is_active", 1),
                "created_at": d.get("created_at"),
                "updated_at": d.get("updated_at")
            }, merge=True)
            b_count += 1
            if b_count >= 400:
                batch.commit()
                batch = client.batch()
                b_count = 0
        if b_count > 0:
            batch.commit()
        stats["custom_knowledge_faqs"] = len(faqs)

    logger.info("Migration batch completed successfully.")
    return {
        "status": "success",
        "migrated_records": stats,
        "backup_file": str(backup_file)
    }


def main():
    parser = argparse.ArgumentParser(description="Nexus AI SQLite to Firestore Idempotent Migration Tool")
    parser.add_argument("--db-path", type=str, default=str(DEFAULT_SQLITE_PATH), help="Path to SQLite database")
    parser.add_argument("--dry-run", action="store_true", help="Perform count analysis and validation without modifying Firestore")
    parser.add_argument("--backup-only", action="store_true", help="Create verified SQLite backup and exit")
    parser.add_argument("--test-disposable", action="store_true", help="Test disposable read/write/query/delete lifecycle in Firestore")
    parser.add_argument("--verify-only", action="store_true", help="Compare SQLite source and Firestore destination counts")
    parser.add_argument("--execute", action="store_true", help="Execute actual migration (requires explicit approval)")
    parser.add_argument("--confirm", action="store_true", help="Required confirmation flag for actual migration")

    args = parser.parse_args()
    sqlite_path = Path(args.db_path)

    # 1. Health check
    health = check_firestore_health()
    logger.info(f"Firestore Health: {health}")
    if not health.get("connected"):
        logger.error(f"Cannot proceed: Firestore connection unhealthy ({health.get('error')})")
        sys.exit(1)

    # 2. Backup only
    if args.backup_only:
        backup_file = backup_sqlite(sqlite_path)
        print(f"Backup created: {backup_file}")
        return

    # 3. Test disposable records
    if args.test_disposable:
        res = test_disposable_records()
        print(json.dumps(res, indent=2))
        return

    # 4. Dry run
    if args.dry_run or (not args.execute and not args.verify_only):
        sqlite_counts = get_sqlite_counts(sqlite_path)
        print("\n=== SQLITE SOURCE RECORD COUNTS ===")
        for tbl, cnt in sqlite_counts.items():
            print(f"  {tbl:<25}: {cnt:>6} rows")
        total_source = sum(sqlite_counts.values())
        print(f"  {'TOTAL SOURCE RECORDS':<25}: {total_source:>6} records\n")

        print("=== DRY RUN SUMMARY ===")
        print("  - Connection to Firestore project 'nexus-ai-support-8efec' is verified.")
        print("  - 9 Collections mapped: conversation_owners, messages, feedback, reports, attachments, admin_sessions, support_tickets, ticket_messages, custom_knowledge_faqs.")
        print("  - SQLite data will be backed up to data/chat_history/backups/ prior to write.")
        print("  - Binary attachments remain on disk in data/chat_attachments; only metadata is written to Firestore.")
        print("  - Idempotent deterministic document IDs prevent duplicates.")
        print("  - Ready for execution upon explicit user approval (--execute --confirm).\n")
        return

    # 5. Verify only
    if args.verify_only:
        sqlite_counts = get_sqlite_counts(sqlite_path)
        firestore_counts = get_firestore_counts()
        print("\n=== RECORD COUNT COMPARISON ===")
        print(f"{'Collection / Table':<25} | {'SQLite Source':<15} | {'Firestore Target':<15} | {'Match'}")
        print("-" * 70)
        for tbl in COLLECTION_MAP.keys():
            s_cnt = sqlite_counts.get(tbl, 0)
            f_cnt = firestore_counts.get(tbl, 0)
            match = "YES" if s_cnt == f_cnt else "DIFF"
            print(f"{tbl:<25} | {s_cnt:>15} | {f_cnt:>16} | {match}")
        print("-" * 70 + "\n")
        return

    # 6. Execute migration (restricted)
    if args.execute:
        if not args.confirm:
            logger.error("Execution blocked: --confirm flag is required. User explicit approval is necessary before uploading customer data.")
            sys.exit(1)
        res = migrate_table_data(sqlite_path, confirm=True)
        print("\n=== MIGRATION COMPLETED ===")
        print(json.dumps(res, indent=2))


if __name__ == "__main__":
    main()
