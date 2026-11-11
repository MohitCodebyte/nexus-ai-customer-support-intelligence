import os
import sys
import logging
import threading
from pathlib import Path
from typing import Optional, Dict, Any

logger = logging.getLogger("nexus.firestore")

_firestore_client = None
_client_lock = threading.Lock()
_initialized = False

DEFAULT_PROJECT_ID = "nexus-ai-support-8efec"
DEFAULT_DATABASE = "(default)"


def get_credential_path() -> Optional[str]:
    """
    Discover the Google Application Credentials path from:
    1. GOOGLE_APPLICATION_CREDENTIALS environment variable
    2. User/System Environment variables on Windows
    3. Common secure local paths
    """
    # 1. Direct environment variable
    cred_env = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if cred_env and Path(cred_env).is_file():
        return cred_env

    # 2. Windows User/System environment variable check
    if sys.platform == "win32":
        try:
            import winreg
            for hkey in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
                try:
                    with winreg.OpenKey(hkey, r"Environment") as key:
                        val, _ = winreg.QueryValueEx(key, "GOOGLE_APPLICATION_CREDENTIALS")
                        if val and Path(val).is_file():
                            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = val
                            return val
                except (FileNotFoundError, OSError):
                    pass
        except Exception as e:
            logger.debug(f"Registry credential lookup skipped: {e}")

    # 3. Known secure path configured for this project
    known_path = Path(r"C:\Users\HP\nexus-ai-secrets\firebase-service-account.json")
    if known_path.is_file():
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(known_path)
        return str(known_path)

    return None


def get_firestore_client():
    """
    Thread-safe lazy initializer for Firebase Admin SDK and Firestore client.
    Returns google.cloud.firestore.Client instance or raises RuntimeError.
    """
    global _firestore_client, _initialized
    if _firestore_client is not None:
        return _firestore_client

    with _client_lock:
        if _firestore_client is not None:
            return _firestore_client

        try:
            import firebase_admin
            from firebase_admin import credentials, firestore
        except ImportError as e:
            raise RuntimeError(
                "firebase-admin is not installed. Run 'pip install firebase-admin' to enable Firestore."
            ) from e

        cred_path = get_credential_path()
        project_id = os.environ.get("FIREBASE_PROJECT_ID", DEFAULT_PROJECT_ID)
        database_id = os.environ.get("FIRESTORE_DATABASE", DEFAULT_DATABASE)

        try:
            # Check if default app is already initialized
            app = firebase_admin.get_app()
        except ValueError:
            # Not initialized yet
            if cred_path and Path(cred_path).is_file():
                logger.info(f"Initializing Firebase Admin with credentials from: {cred_path}")
                cred = credentials.Certificate(cred_path)
                app = firebase_admin.initialize_app(cred, {
                    "projectId": project_id,
                })
            else:
                logger.info("Initializing Firebase Admin with Application Default Credentials")
                app = firebase_admin.initialize_app(options={
                    "projectId": project_id,
                })

        try:
            # Initialize Firestore client for the specific database
            if database_id and database_id != "(default)":
                _firestore_client = firestore.client(database=database_id)
            else:
                _firestore_client = firestore.client()
            _initialized = True
            logger.info(f"Connected to Firestore: project={project_id}, database={database_id}")
            return _firestore_client
        except Exception as e:
            logger.error(f"Failed to create Firestore client: {e}")
            raise


def is_firestore_available() -> bool:
    """Check if Firestore client can be initialized and credentials exist."""
    try:
        cred = get_credential_path()
        if not cred and not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
            return False
        client = get_firestore_client()
        return client is not None
    except Exception:
        return False


_last_health_check: Optional[Dict[str, Any]] = None
_last_health_time: float = 0.0
_health_lock = threading.Lock()


def check_firestore_health(force: bool = False) -> Dict[str, Any]:
    """
    Perform a health ping to verify live read/write capability to Firestore.
    Caches results for 60 seconds to avoid blocking frequent health probes and wasting network I/O.
    """
    global _last_health_check, _last_health_time
    import time

    now = time.time()
    if not force and _last_health_check is not None and (now - _last_health_time < 60.0):
        return _last_health_check

    with _health_lock:
        now = time.time()
        if not force and _last_health_check is not None and (now - _last_health_time < 60.0):
            return _last_health_check

        start_time = time.time()
        try:
            client = get_firestore_client()
            test_ref = client.collection("_health_check").document("nexus_ping")
            test_ref.set({
                "status": "healthy",
                "timestamp": time.time(),
                "service": "nexus-ai-support"
            })
            doc = test_ref.get()
            latency_ms = round((time.time() - start_time) * 1000, 2)
            if doc.exists:
                test_ref.delete()
                result = {
                    "status": "healthy",
                    "connected": True,
                    "latency_ms": latency_ms,
                    "project_id": os.environ.get("FIREBASE_PROJECT_ID", DEFAULT_PROJECT_ID),
                    "database": os.environ.get("FIRESTORE_DATABASE", DEFAULT_DATABASE)
                }
            else:
                result = {
                    "status": "degraded",
                    "connected": False,
                    "error": "Document write succeeded but read returned missing",
                    "latency_ms": latency_ms
                }
        except Exception as e:
            latency_ms = round((time.time() - start_time) * 1000, 2)
            result = {
                "status": "unhealthy",
                "connected": False,
                "error": str(e),
                "latency_ms": latency_ms
            }

        _last_health_check = result
        _last_health_time = time.time()
        return result

