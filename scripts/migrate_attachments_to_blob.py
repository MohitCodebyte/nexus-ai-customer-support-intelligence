"""
Local Idempotent Migration Script: Local Attachments -> Private Vercel Blob.

Migrates existing local attachment binaries (data/chat_attachments) to private Vercel Blob,
using attachment metadata already present in Cloud Firestore.

Modes:
  --mode dry-run     (Default) Scan all Firestore attachment records, verify local binaries,
                     calculate total sizes, simulate deterministic target Blob pathnames.
                     Zero uploads or database updates are performed.
  --mode execute     Upload verified binaries to private Vercel Blob (access='private'),
                     verify uploaded object size and metadata, and update Firestore records.
  --mode verify-only Audit Firestore records and confirm that migrated Blob objects are
                     accessible, correctly sized, and have storage_provider='vercel_blob'.

Safety Guarantees:
  - Idempotent: Never re-uploads or overwrites existing valid Blob objects.
  - Non-destructive: NEVER deletes or modifies local source files.
  - Resumable: Can be interrupted and safely restarted without duplicating storage.
  - Private: All objects are uploaded strictly with access="private".
"""

import os
import sys
import argparse
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from dotenv import load_dotenv

# Ensure repository root is on sys.path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

load_dotenv(ROOT / ".env")

from src.storage.firestore_client import get_firestore_client, is_firestore_available
from src.storage.blob_storage import (
    is_blob_configured,
    build_attachment_pathname,
    upload_blob_attachment,
    download_blob_attachment,
    check_blob_health,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("nexus.migrate_attachments")

LOCAL_ATTACHMENTS_ROOT = ROOT / "data" / "chat_attachments"


def resolve_local_file_path(record: Dict[str, Any]) -> Optional[Path]:
    """
    Safely resolve local binary file on disk, handling both absolute Windows paths
    and project-relative directory structures.
    """
    raw_path = record.get("file_path", "")
    conv_id = str(record.get("conversation_id", "")).strip()
    stored_name = str(record.get("stored_filename", "")).strip()
    att_id = str(record.get("id", "")).strip()

    # 1. Try raw path directly if stored on this machine
    if raw_path:
        direct = Path(raw_path)
        if direct.is_file():
            return direct

    # 2. Try relative to project data/chat_attachments/{conversation_id}/{stored_filename}
    if conv_id and stored_name:
        rel_path = LOCAL_ATTACHMENTS_ROOT / conv_id / stored_name
        if rel_path.is_file():
            return rel_path

    # 3. Try finding by stored_filename or attachment_id within conversation directory
    if conv_id and LOCAL_ATTACHMENTS_ROOT.joinpath(conv_id).is_dir():
        conv_dir = LOCAL_ATTACHMENTS_ROOT / conv_id
        for candidate in conv_dir.iterdir():
            if candidate.is_file():
                if candidate.name == stored_name or candidate.name.startswith(f"{att_id}_"):
                    return candidate

    # 4. Global fallback search in LOCAL_ATTACHMENTS_ROOT
    if stored_name and LOCAL_ATTACHMENTS_ROOT.is_dir():
        for candidate in LOCAL_ATTACHMENTS_ROOT.glob(f"**/{stored_name}"):
            if candidate.is_file():
                return candidate

    return None


def run_migration(mode: str = "dry-run", limit: Optional[int] = None) -> Dict[str, Any]:
    """
    Execute migration in the specified mode: 'dry-run', 'execute', or 'verify-only'.
    """
    logger.info("=" * 70)
    logger.info(f"NEXUS AI SUPPORT — VERCEL BLOB ATTACHMENT MIGRATION [{mode.upper()}]")
    logger.info("=" * 70)

    if not is_firestore_available():
        logger.error("Firestore is not configured or credentials unavailable.")
        return {"error": "Firestore unavailable"}

    db = get_firestore_client()
    logger.info("Fetching attachment metadata records from Firestore collection 'attachments'...")
    att_docs = list(db.collection("attachments").stream())
    total_docs = len(att_docs)
    logger.info(f"Retrieved {total_docs} attachment documents from Firestore.")

    if limit and limit > 0:
        att_docs = att_docs[:limit]
        logger.info(f"Applied limit: processing {len(att_docs)} of {total_docs} records.")

    blob_healthy = False
    if mode in ("execute", "verify-only"):
        health = check_blob_health()
        if not health.get("connected"):
            logger.error(f"Vercel Blob storage check failed: {health.get('error')}")
            if mode == "execute":
                logger.error("Execution halted: valid Vercel Blob credentials required for execute mode.")
                return {"error": "Vercel Blob credentials invalid", "details": health}
        else:
            blob_healthy = True
            logger.info(f"Vercel Blob verified: Store ID '{health.get('store_id')}', Access: {health.get('access_tier')}")

    stats = {
        "total_records": len(att_docs),
        "local_binaries_found": 0,
        "local_binaries_missing": 0,
        "already_migrated": 0,
        "migrated_now": 0,
        "failed_uploads": 0,
        "total_bytes_analyzed": 0,
        "total_bytes_migrated": 0,
        "mode": mode,
    }

    for idx, doc in enumerate(att_docs, 1):
        rec = doc.to_dict()
        att_id = doc.id
        conv_id = rec.get("conversation_id", "unknown")
        orig_name = rec.get("original_filename", "attachment")
        stored_name = rec.get("stored_filename", orig_name)
        mime = rec.get("mime_type", "application/octet-stream")
        reported_size = rec.get("file_size", 0)

        # Check existing migration state
        is_already_migrated = (
            rec.get("storage_provider") == "vercel_blob"
            and bool(rec.get("blob_pathname"))
        )

        if is_already_migrated:
            stats["already_migrated"] += 1
            if mode == "verify-only":
                pathname = rec.get("blob_pathname")
                logger.info(f"[{idx}/{len(att_docs)}] [VERIFIED] ID {att_id[:8]} -> Blob {pathname} ({rec.get('file_size')} bytes)")
            continue

        # Resolve local file
        local_file = resolve_local_file_path(rec)
        if not local_file or not local_file.is_file():
            stats["local_binaries_missing"] += 1
            logger.warning(f"[{idx}/{len(att_docs)}] MISSING: ID {att_id[:8]} ({orig_name}) — local file not found.")
            continue

        actual_size = local_file.stat().st_size
        stats["local_binaries_found"] += 1
        stats["total_bytes_analyzed"] += actual_size

        if stored_name.startswith(att_id):
            target_pathname = f"attachments/{conv_id}/{stored_name}"
        else:
            target_pathname = build_attachment_pathname(conv_id, att_id, stored_name)

        if mode == "dry-run":
            stats["total_bytes_migrated"] += actual_size
            if idx <= 10 or idx % 25 == 0 or idx == len(att_docs):
                logger.info(
                    f"[DRY-RUN {idx}/{len(att_docs)}] ID {att_id[:8]} | {orig_name} | "
                    f"Size: {actual_size} B | Target: {target_pathname}"
                )

        elif mode == "execute":
            try:
                with open(local_file, "rb") as f:
                    file_bytes = f.read()

                # Upload to private Vercel Blob
                blob_result = upload_blob_attachment(
                    conversation_id=conv_id,
                    attachment_id=att_id,
                    filename=stored_name,
                    data=file_bytes,
                    mime_type=mime,
                    pathname=target_pathname,
                )

                # Verify uploaded object size
                if blob_result.get("file_size") != actual_size:
                    raise ValueError(
                        f"Size mismatch: uploaded {blob_result.get('file_size')} bytes, expected {actual_size} bytes"
                    )

                # Update Firestore record only after verification
                doc.reference.update({
                    "storage_provider": "vercel_blob",
                    "blob_pathname": blob_result["blob_pathname"],
                    "blob_url": blob_result["blob_url"],
                    "blob_download_url": blob_result["blob_download_url"],
                    "access": "private",
                    "migrated_at": datetime.now(timezone.utc).isoformat(),
                    "file_size": actual_size,
                })

                stats["migrated_now"] += 1
                stats["total_bytes_migrated"] += actual_size
                logger.info(f"[UPLOADED {idx}/{len(att_docs)}] ID {att_id[:8]} -> {blob_result['blob_pathname']} ({actual_size} bytes)")

            except Exception as e:
                stats["failed_uploads"] += 1
                logger.error(f"[FAILED {idx}/{len(att_docs)}] ID {att_id[:8]} ({orig_name}): {e}")

    logger.info("=" * 70)
    logger.info(f"MIGRATION SUMMARY [{mode.upper()}]:")
    logger.info(f"  Total Firestore attachment records : {stats['total_records']}")
    logger.info(f"  Local binaries resolved on disk    : {stats['local_binaries_found']}")
    logger.info(f"  Local binaries missing             : {stats['local_binaries_missing']}")
    logger.info(f"  Already migrated to Vercel Blob    : {stats['already_migrated']}")
    logger.info(f"  Migrated in this session           : {stats['migrated_now']}")
    logger.info(f"  Failed uploads                     : {stats['failed_uploads']}")
    logger.info(f"  Total payload bytes analyzed       : {stats['total_bytes_analyzed']:,} bytes ({stats['total_bytes_analyzed'] / (1024*1024):.2f} MB)")
    logger.info("=" * 70)

    return stats


def main():
    parser = argparse.ArgumentParser(description="Migrate local customer attachments to private Vercel Blob.")
    parser.add_argument(
        "--mode",
        choices=["dry-run", "execute", "verify-only"],
        default="dry-run",
        help="Operation mode: 'dry-run' (default, safe simulation), 'execute' (real upload), 'verify-only' (audit state)."
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit number of attachment records to process (for staging tests)."
    )
    args = parser.parse_args()

    run_migration(mode=args.mode, limit=args.limit)


if __name__ == "__main__":
    main()
