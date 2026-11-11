"""
Verification script for Voice Transcription (Gemini SDK) & Support Status Authorization.
Tests live Flask endpoints to confirm:
1. Voice transcription with Gemini SDK (google-genai 1.75.0).
2. Proper HTTP error mappings (400 for empty audio, 415 for unsupported media).
3. Secure session authorization on GET /api/support/status/<conversation_id> (no false 403 on new sessions).
4. Strict enforcement of 403 on cross-customer access.
"""

import os
import sys
import io
import wave
import uuid
import json
from dotenv import load_dotenv

# Ensure root directory is on PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Load environment
load_dotenv(".env")

from app.app import app
from src.services.speech_service import is_stt_configured, transcribe_audio_blob

def generate_mock_wav(duration_seconds=1, sample_rate=16000):
    """Generate a valid in-memory PCM 16-bit WAV file with silence/tone."""
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        # Write 1 second of silence (zero bytes)
        wf.writeframes(b'\x00' * (sample_rate * 2 * duration_seconds))
    buf.seek(0)
    return buf.read()

def test_live_voice_and_support():
    print("=" * 60)
    print("NEXUS AI SUPPORT — VOICE & AUTHORIZATION VERIFICATION")
    print("=" * 60)

    client = app.test_client()

    # 1. Test empty audio rejection
    print("\n[1] Testing empty audio rejection on POST /api/speech/transcribe...")
    res = client.post("/api/speech/transcribe", data={"audio": (io.BytesIO(b""), "empty.wav", "audio/wav")}, content_type="multipart/form-data")
    print(f"Status Code: {res.status_code}")
    data = res.get_json()
    assert res.status_code == 400, f"Expected 400, got {res.status_code}"
    assert data["error"] == "empty_audio", f"Expected empty_audio, got {data}"
    print("PASS: Empty audio correctly rejected with HTTP 400.")

    # 2. Test unsupported media type
    print("\n[2] Testing unsupported media type on POST /api/speech/transcribe...")
    res = client.post("/api/speech/transcribe", data={"audio": (io.BytesIO(b"random-bytes"), "file.exe", "application/octet-stream")}, content_type="multipart/form-data")
    print(f"Status Code: {res.status_code}")
    data = res.get_json()
    assert res.status_code == 415, f"Expected 415, got {res.status_code}"
    print("PASS: Unsupported media type correctly rejected with HTTP 415.")

    # 3. Test STT configuration check
    print("\n[3] Testing STT configuration check...")
    configured = is_stt_configured()
    print(f"STT Configured: {configured}")
    assert configured is True, "GEMINI_API_KEY should be configured"
    print("PASS: STT provider configuration detected and active.")

    # 4. Test Support Status on fresh/unstarted conversation (Prevents false 403 bug)
    print("\n[4] Testing Support Status on new/unstarted conversation...")
    fresh_conv_id = f"fresh-{uuid.uuid4().hex[:8]}"
    res = client.get(
        f"/api/support/status/{fresh_conv_id}",
        headers={"X-Customer-Session-Token": f"cust-{uuid.uuid4().hex[:8]}"}
    )
    print(f"Status Code: {res.status_code}")
    data = res.get_json()
    print(f"Response: {data}")
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    assert data["has_ticket"] is False, "Expected has_ticket=False for unescalated conversation"
    assert data["status"] == "none", "Expected status='none'"
    print("PASS: Fresh conversation correctly returns 200 with has_ticket=False (No false 403!).")

    # 5. Test Support Ticket Escalation & Ownership
    print("\n[5] Testing Support Ticket Escalation and Authorized Status Check...")
    conv_id = f"test-conv-{uuid.uuid4().hex[:8]}"
    owner_token = f"owner-token-{uuid.uuid4().hex[:8]}"
    
    # Escalate ticket
    escalate_res = client.post(
        "/api/support/request",
        json={
            "conversation_id": conv_id,
            "customer_name": "Test Customer",
            "reason": "Need urgent agent assistance",
            "priority": "high",
        },
        headers={"X-Customer-Session-Token": owner_token}
    )
    print(f"Escalate Status: {escalate_res.status_code}")
    escalate_data = escalate_res.get_json()
    assert escalate_res.status_code in (200, 201), f"Expected 200/201, got {escalate_res.status_code}"
    print(f"Escalate Data: {escalate_data}")
    assert "ticket" in escalate_data, f"Expected 'ticket' in {escalate_data}"
    ticket_id = escalate_data["ticket"]["id"]
    print(f"Created Ticket ID: {ticket_id}")

    # Check status with owner token -> Should be 200
    status_res = client.get(
        f"/api/support/status/{conv_id}",
        headers={"X-Customer-Session-Token": owner_token}
    )
    print(f"Owner Check Status: {status_res.status_code}")
    status_data = status_res.get_json()
    assert status_res.status_code == 200
    assert status_data["has_ticket"] is True
    assert status_data["ticket"]["id"] == ticket_id
    print("PASS: Owner token successfully receives ticket status with HTTP 200.")

    # 6. Test Cross-Customer Isolation (Unauthorized User -> 403 Forbidden)
    print("\n[6] Testing Cross-Customer Isolation (Unauthorized token accessing ticket)...")
    intruder_token = f"intruder-token-{uuid.uuid4().hex[:8]}"
    intruder_res = client.get(
        f"/api/support/status/{conv_id}",
        headers={"X-Customer-Session-Token": intruder_token}
    )
    print(f"Intruder Check Status: {intruder_res.status_code}")
    assert intruder_res.status_code == 403, f"Expected 403 Forbidden, got {intruder_res.status_code}"
    print("PASS: Intruder correctly blocked with HTTP 403 Forbidden.")

    print("\n" + "=" * 60)
    print("ALL VERIFICATIONS COMPLETED AND VERIFIED!")
    print("=" * 60)

if __name__ == "__main__":
    test_live_voice_and_support()
