# Nexus AI Support — Vercel Preview & Production Deployment Guide

## 1. Environment Variables for Vercel

Configure the following environment variables in the Vercel Dashboard under **Project Settings > Environment Variables** (Preview and Production):

| Variable | Recommended / Required Value | Description |
| :--- | :--- | :--- |
| `STORAGE_BACKEND` | `firestore` | Enforces Firestore as the persistent chat store; disables SQLite and writes under `/var/task`. |
| `FIREBASE_PROJECT_ID` | `nexus-ai-support-8efec` | Google Cloud / Firebase project identifier. |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | `[Base64-encoded Service Account JSON]` | Decoded at startup into `/tmp` and injected into `GOOGLE_APPLICATION_CREDENTIALS`. |
| `BLOB_STORE_ID` | `store_nexus_...` | ID of the private Vercel Blob store (`nexus-customer-attachments`, region `BOM1`). |
| `BLOB_READ_WRITE_TOKEN` | `vercel_blob_rw_...` | Full read-write token for Vercel Blob store. |
| `BLOB_WEBHOOK_PUBLIC_KEY` | `[Public Key]` | Optional webhook signing verification key. |
| `SECRET_KEY` | `[Secure Random Secret]` | Flask cryptographic session key. |
| `NEXUS_ADMIN_KEY` | `[Secure Admin Secret]` | Admin portal authentication secret. |
| `GEMINI_API_KEY` | `[Gemini API Key]` | Used for speech-to-text audio transcription (`gemini-3.5-transcribe`). |
| `GEMINI_STT_MODEL` | `gemini-3.5-transcribe` | STT transcription model identifier. |
| `MAIL_SERVER` | `smtp.gmail.com` | SMTP host for customer inquiry notifications. |
| `MAIL_PORT` | `587` | SMTP port (TLS). |
| `MAIL_USE_TLS` | `true` | SMTP TLS encryption flag. |
| `MAIL_USERNAME` | `[Your Gmail]` | Dispatcher email account. |
| `MAIL_PASSWORD` | `[Gmail App Password]` | 16-character Google App Password. |
| `CONTACT_RECIPIENT` | `[Your Gmail]` | Support team recipient inbox. |
| `FRONTEND_URL` | `https://[your-app].vercel.app` | Production or preview deployment URL. |
| `CORS_ALLOWED_ORIGINS` | `https://[your-app].vercel.app` | Allowed CORS origins for browser fetch API. |

---

## 2. Serverless Architecture & Storage Decoupling

When `STORAGE_BACKEND=firestore`:
- **Read-Only Filesystem Compliance**: All write operations under `/var/task` (including SQLite directory creation, SQLite DB connection attempts, and local attachment folders) are completely disabled.
- **Persistent Database**: Firestore is the sole persistent store for all 9 collections (messages, conversation_owners, feedback, reports, attachments, admin_sessions, support_tickets, ticket_messages, custom_knowledge_faqs).
- **Attachments Storage**: Binary attachments are staged in memory and uploaded directly to **private Vercel Blob** via `blob.sync.put_blob(..., access="private")`.
- **Health Check Integrity**: `/health` genuinely queries Firestore and Vercel Blob, reporting `sqlite_database: "not_applicable"`, `database: "ok"`, `firestore: "ok"`, and `status: "ok"`.

---

## 3. Upload Boundary & Serverless Limitations

- **Vercel Serverless Function Limit**: Vercel Functions enforce a maximum request-body limit of **4.5 MB**.
- **Enforced Boundary**: The frontend composer and API client guard against files exceeding **4.5 MB**, returning clear user guidance before network failure:
  `"File size exceeds the 4.5 MB limit for attachments. Please select a file under 4.5 MB."`
- **Supported Formats**: PDF, TXT, CSV, JPG, PNG (validated via magic bytes and MIME signatures).

---

## 4. Attachment Binary Migration Instructions

Existing attachment metadata records (212 items) reside in Firestore, while binary files exist on the local disk at `data/chat_attachments`. Use the idempotent migration tool:

### A. Dry-Run (Safe Inspection)
```bash
python scripts/migrate_attachments_to_blob.py --mode dry-run
```
*Scans all 212 records, confirms local binary presence on disk, computes total payload size (~89 KB), and simulates deterministic Blob target pathnames.*

### B. Execute Migration
```bash
python scripts/migrate_attachments_to_blob.py --mode execute
```
*Uploads binaries to private Vercel Blob with `access="private"`, verifies object sizes, and updates Firestore metadata with `storage_provider: "vercel_blob"`, `blob_pathname`, and `blob_url`. Local source files are never deleted.*

### C. Verify Only
```bash
python scripts/migrate_attachments_to_blob.py --mode verify-only
```
*Audits all Firestore records to confirm that objects exist in private Blob storage and match expected sizes.*

