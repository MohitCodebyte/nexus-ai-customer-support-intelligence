import os
from pathlib import Path
from datetime import datetime, timezone
from flask import Flask, jsonify, request, make_response
from dotenv import load_dotenv

load_dotenv()

from app.chat_routes import chat_bp
from app.unified_chat_routes import unified_chat_bp
from app.admin_routes import admin_bp
from app.ticket_routes import ticket_bp
from app.contact_routes import contact_bp
from src.storage.chat_store import get_db_connection, get_active_storage_backend
from src.storage.firestore_client import is_firestore_available, check_firestore_health
from src.storage.blob_storage import is_blob_configured, check_blob_health

ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = ROOT / "models" / "intent_classification" / "banking77_intent_model_final.joblib"
RAG_PATH = ROOT / "models" / "embeddings" / "bitext_faq"
ATTACHMENTS_PATH = ROOT / "data" / "chat_attachments"


def create_app():
    """Create and configure the production Flask application."""
    app = Flask(__name__)

    # 16 MB maximum content length to support document and image attachments
    app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024

    # Register all modular blueprints
    app.register_blueprint(chat_bp)
    app.register_blueprint(unified_chat_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(ticket_bp)
    app.register_blueprint(contact_bp)

    # Allow only configured frontend origins and local development origins.
    def get_allowed_origins():
        configured = [
            os.getenv("FRONTEND_URL", ""),
        ]

        cors_value = os.getenv("CORS_ALLOWED_ORIGINS", "")
        configured.extend(cors_value.replace(";", ",").split(","))

        is_production = (
            os.getenv("APP_ENV", "").strip().lower() == "production"
            or os.getenv("VERCEL", "").strip() == "1"
        )

        # Localhost origins are allowed only during local development.
        if not is_production:
            configured.extend([
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "http://localhost:5000",
                "http://127.0.0.1:5000",
            ])

        return {
            value.strip().rstrip("/")
            for value in configured
            if value and value.strip()
        }

    allowed_origins = get_allowed_origins()

    @app.after_request
    def set_security_headers(response):
        """Apply security headers and strict origin-allowlisted CORS."""

        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(self), camera=()"

        origin = request.headers.get("Origin", "").strip().rstrip("/")

        if origin and origin in allowed_origins:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Headers"] = (
                "Content-Type, Authorization, X-Customer-Session-Token, X-Session-Token, "
                "X-Admin-Session, X-Admin-Key, X-Client-Role, X-Requested-With"
            )
            response.headers["Access-Control-Expose-Headers"] = (
                "X-Customer-Session-Token, X-Admin-Session, Content-Disposition"
            )
            response.headers["Access-Control-Allow-Methods"] = (
                "GET, POST, PUT, PATCH, DELETE, OPTIONS"
            )

            vary = [
                item.strip()
                for item in response.headers.get("Vary", "").split(",")
                if item.strip()
            ]
            if not any(item.lower() == "origin" for item in vary):
                vary.append("Origin")
            response.headers["Vary"] = ", ".join(vary)

        return response

    @app.route("/api/<path:subpath>", methods=["OPTIONS"])
    @app.route("/<path:subpath>", methods=["OPTIONS"])
    def handle_options_preflight(subpath=""):
        """Return an OPTIONS response; after_request validates its Origin."""
        return make_response("", 204)

    def run_health_checks():
        checks = {}
        all_ok = True

        # 1. Storage Backend & Database Checks
        active_backend = get_active_storage_backend()
        checks["storage_backend"] = active_backend

        if active_backend == "firestore":
            # SQLite is explicitly not applicable in Firestore-only mode
            checks["sqlite_database"] = "not_applicable"

            # Genuine Firestore Check
            if is_firestore_available():
                try:
                    fs_health = check_firestore_health()
                    connected = fs_health.get("connected", False)
                    checks["firestore"] = "ok" if connected else f"error: {fs_health.get('error')}"
                    checks["firestore_latency_ms"] = fs_health.get("latency_ms")
                    checks["firestore_project"] = fs_health.get("project_id")
                    checks["database"] = "ok" if connected else "error"
                    if not connected:
                        all_ok = False
                except Exception as e:
                    checks["firestore"] = f"error: {str(e)}"
                    checks["database"] = f"error: {str(e)}"
                    all_ok = False
            else:
                checks["firestore"] = "not_configured"
                checks["database"] = "error: firestore_not_configured"
                all_ok = False

            # Attachments Storage Check for Firestore / Cloud mode
            if is_blob_configured():
                blob_health = check_blob_health()
                if blob_health.get("connected"):
                    checks["attachments_storage"] = "ok"
                    checks["blob_store_id"] = blob_health.get("store_id")
                    checks["blob_access"] = "private"
                else:
                    checks["attachments_storage"] = f"error: {blob_health.get('error')}"
                    all_ok = False
            else:
                # If local attachments directory exists, report ok; avoid attempting mkdir under read-only /var/task
                if ATTACHMENTS_PATH.is_dir():
                    checks["attachments_storage"] = "ok"
                else:
                    try:
                        ATTACHMENTS_PATH.mkdir(parents=True, exist_ok=True)
                        checks["attachments_storage"] = "ok"
                    except Exception as e:
                        checks["attachments_storage"] = f"error: {str(e)}"
                        all_ok = False
        else:
            # SQLite Mode Check (Local Development)
            try:
                with get_db_connection() as conn:
                    conn.execute("SELECT 1").fetchone()
                checks["sqlite_database"] = "ok"
                checks["database"] = "ok"
            except Exception as e:
                checks["sqlite_database"] = f"error: {str(e)}"
                checks["database"] = f"error: {str(e)}"
                all_ok = False

            # Optional Firestore Check in SQLite mode
            if is_firestore_available():
                try:
                    fs_health = check_firestore_health()
                    checks["firestore"] = "ok" if fs_health.get("connected") else f"error: {fs_health.get('error')}"
                except Exception as e:
                    checks["firestore"] = f"error: {str(e)}"
            else:
                checks["firestore"] = "not_configured"

            # Attachments directory check in SQLite mode
            try:
                ATTACHMENTS_PATH.mkdir(parents=True, exist_ok=True)
                checks["attachments_storage"] = "ok"
            except Exception as e:
                checks["attachments_storage"] = f"error: {str(e)}"
                all_ok = False

        # 2. Banking77 ML Intent Model Check
        checks["intent_model"] = "ok" if MODEL_PATH.exists() else "missing"
        if not MODEL_PATH.exists():
            all_ok = False

        # 3. Bitext Semantic RAG Index Check
        checks["rag_index"] = "ok" if RAG_PATH.exists() else "missing"
        if not RAG_PATH.exists():
            all_ok = False

        status_code = 200 if all_ok else 503
        return jsonify({
            "status": "ok" if all_ok else "degraded",
            "service": "AI Customer Support Intelligence",
            "version": "2.0.0-enterprise",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "checks": checks
        }), status_code

    @app.route("/health", methods=["GET"])
    @app.route("/api/health", methods=["GET"])
    def health():
        return run_health_checks()

    return app


app = create_app()


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=False,
    )
