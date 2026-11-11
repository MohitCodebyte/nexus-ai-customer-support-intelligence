import os
import json
import base64
import tempfile
from pathlib import Path

# When deployed to Vercel or when Firebase service account is present, ensure Firestore backend is active
if os.environ.get("VERCEL") or os.environ.get("FIREBASE_SERVICE_ACCOUNT_BASE64"):
    os.environ.setdefault("STORAGE_BACKEND", "firestore")

encoded = os.environ.get("FIREBASE_SERVICE_ACCOUNT_BASE64")

if encoded:
    key_bytes = base64.b64decode(encoded, validate=True)
    json.loads(key_bytes.decode("utf-8"))

    key_path = Path(tempfile.gettempdir()) / "nexus-firebase-service-account.json"
    key_path.write_bytes(key_bytes)
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(key_path)

from app.app import app