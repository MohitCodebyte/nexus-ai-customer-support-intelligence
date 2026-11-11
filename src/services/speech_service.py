"""
Backend Speech-to-Text Transcription Service for Nexus AI Support.

Provides official Google Gen AI SDK audio transcription with secure temporary
file management, format validation, and automated cleanup.
"""

import os
import re
import tempfile
import logging
from typing import Dict, Any, Optional, Tuple
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

MAX_AUDIO_BYTES = 5 * 1024 * 1024  # 5 MB max audio size
ALLOWED_MIME_TYPES = {
    "audio/webm",
    "audio/wav",
    "audio/wave",
    "audio/x-wav",
    "audio/ogg",
    "audio/mp3",
    "audio/mpeg",
    "audio/mp4",
    "audio/m4a",
    "audio/x-m4a",
}

MIME_TO_EXT = {
    "audio/webm": ".webm",
    "audio/wav": ".wav",
    "audio/wave": ".wav",
    "audio/x-wav": ".wav",
    "audio/ogg": ".ogg",
    "audio/mp3": ".mp3",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".mp4",
    "audio/m4a": ".m4a",
    "audio/x-m4a": ".m4a",
}


def is_stt_configured() -> bool:
    """Return True if an external AI STT provider key is present."""
    return bool(
        os.getenv("GEMINI_API_KEY")
        or os.getenv("GOOGLE_API_KEY")
        or os.getenv("OPENAI_API_KEY")
    )


def sanitize_error_message(msg: str) -> str:
    """Sanitize error messages to remove API keys, bearer tokens, or internal URLs."""
    if not msg:
        return ""
    # Strip key=... or Bearer ... or similar patterns
    cleaned = re.sub(r'(key|token|auth|password)=[\w\-]+', r'\1=[REDACTED]', str(msg), flags=re.IGNORECASE)
    cleaned = re.sub(r'Bearer\s+[\w\.\-]+', 'Bearer [REDACTED]', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'AIza[0-9A-Za-z\-_]{35}', '[REDACTED_API_KEY]', cleaned)
    return cleaned[:300]


def transcribe_with_gemini(
    audio_bytes: bytes,
    mime_type: str,
    language: str = "en"
) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    """
    Transcribe audio using official Google Gen AI SDK with gemini-3.5-transcribe.
    Returns (transcript, error_dict).
    """
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return None, {
            "error": "no_provider",
            "message": "Gemini API key is not configured in backend environment."
        }

    clean_mime = mime_type.split(";")[0].strip().lower() or "audio/webm"
    if clean_mime not in ALLOWED_MIME_TYPES:
        return None, {
            "error": "unsupported_media_type",
            "message": f"MIME type '{clean_mime}' is not supported for speech transcription."
        }

    if not audio_bytes or len(audio_bytes) == 0:
        return None, {
            "error": "empty_audio",
            "message": "Audio recording payload is empty."
        }

    if len(audio_bytes) > MAX_AUDIO_BYTES:
        return None, {
            "error": "file_too_large",
            "message": f"Audio file exceeds maximum allowed limit of {MAX_AUDIO_BYTES // (1024 * 1024)}MB."
        }

    suffix = MIME_TO_EXT.get(clean_mime, ".webm")
    temporary_audio_path = None
    client = None
    audio_file = None

    try:
        from google import genai

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp_file:
            tmp_file.write(audio_bytes)
            temporary_audio_path = tmp_file.name

        client = genai.Client(api_key=api_key)
        audio_file = client.files.upload(file=temporary_audio_path)

        model_name = os.getenv("GEMINI_STT_MODEL") or os.getenv("GEMINI_MODEL") or "gemini-3.5-transcribe"

        transcript = None
        try:
            interaction = client.interactions.create(
                model=model_name,
                input=[
                    {
                        "type": "audio",
                        "uri": audio_file.uri,
                        "mime_type": audio_file.mime_type or clean_mime,
                    }
                ],
            )
            transcript = getattr(interaction, "output_text", None)
            if not transcript and hasattr(interaction, "outputs") and interaction.outputs:
                texts = [getattr(o, "text", "") for o in interaction.outputs if getattr(o, "text", None)]
                if texts:
                    transcript = " ".join(texts).strip()
        except Exception as interaction_err:
            logger.info("Interactions API call note: %s. Invoking client.models.generate_content fallback.", interaction_err)
            lang_prompt = "English" if language == "en" else "Hindi" if language == "hi" else "Hinglish (conversational Hindi in Latin script)"
            prompt_text = (
                f"Listen carefully to this customer banking inquiry audio. "
                f"Transcribe EXACTLY what the user said in {lang_prompt}. "
                f"Do NOT answer the question, do NOT add commentary. Return ONLY the transcribed words."
            )
            gen_resp = client.models.generate_content(
                model=model_name,
                contents=[audio_file, prompt_text]
            )
            transcript = getattr(gen_resp, "text", None)

        if not transcript or not transcript.strip():
            return None, {
                "error": "empty_transcript",
                "message": "No speech was detected in the audio recording. Please speak clearly into your microphone."
            }

        return transcript.strip(), None

    except Exception as e:
        sanitized = sanitize_error_message(str(e))
        logger.warning("Gemini audio transcription failed: %s: %s", type(e).__name__, sanitized)
        return None, {
            "error": "upstream_error",
            "message": f"Gemini audio transcription service error: {sanitized}"
        }

    finally:
        if client and audio_file and hasattr(audio_file, "name"):
            try:
                client.files.delete(name=audio_file.name)
            except Exception as del_err:
                logger.debug("Failed to delete uploaded Gemini file %s: %s", audio_file.name, del_err)
        if temporary_audio_path and os.path.exists(temporary_audio_path):
            try:
                os.remove(temporary_audio_path)
            except Exception as rm_err:
                logger.debug("Failed to remove temporary audio file %s: %s", temporary_audio_path, rm_err)


def transcribe_with_openai_whisper(
    audio_bytes: bytes,
    filename: str = "audio.webm",
    language: str = "en"
) -> Optional[str]:
    """Transcribe audio using OpenAI Whisper API as secondary fallback."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None

    import io
    import json
    from urllib.request import Request, urlopen

    boundary = "----WebKitFormBoundaryNexusSpeech7MA4YWxkTrZu0gW"
    body = io.BytesIO()

    body.write(f"--{boundary}\r\n".encode())
    body.write(b'Content-Disposition: form-data; name="model"\r\n\r\n')
    body.write(b"whisper-1\r\n")

    if language in ("en", "hi"):
        body.write(f"--{boundary}\r\n".encode())
        body.write(b'Content-Disposition: form-data; name="language"\r\n\r\n')
        body.write(language.encode() + b"\r\n")

    body.write(f"--{boundary}\r\n".encode())
    body.write(f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode())
    body.write(b"Content-Type: application/octet-stream\r\n\r\n")
    body.write(audio_bytes)
    body.write(b"\r\n")

    body.write(f"--{boundary}--\r\n".encode())
    payload = body.getvalue()

    req = Request(
        "https://api.openai.com/v1/audio/transcriptions",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST"
    )

    try:
        with urlopen(req, timeout=18.0) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            text = result.get("text", "").strip()
            if text:
                return text
    except Exception as e:
        logger.warning("OpenAI Whisper transcription failed: %s", sanitize_error_message(str(e)))

    return None


def transcribe_audio_blob(
    audio_bytes: bytes,
    mime_type: str = "audio/webm",
    language: str = "en"
) -> Dict[str, Any]:
    """
    Main transcription dispatcher.
    Returns: {"success": bool, "transcript": str, "provider": str}
    """
    if not audio_bytes or len(audio_bytes) == 0:
        return {
            "success": False,
            "error": "empty_audio",
            "message": "Audio recording payload is empty."
        }

    if len(audio_bytes) > MAX_AUDIO_BYTES:
        return {
            "success": False,
            "error": "file_too_large",
            "message": f"Audio file exceeds maximum allowed limit of {MAX_AUDIO_BYTES // (1024 * 1024)}MB."
        }

    clean_mime = mime_type.split(";")[0].strip().lower()
    if clean_mime and clean_mime not in ALLOWED_MIME_TYPES:
        return {
            "success": False,
            "error": "unsupported_media_type",
            "message": f"MIME type '{clean_mime}' is not supported for speech transcription."
        }

    # 1. Try Google Gemini with official SDK
    if os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"):
        transcript, err_dict = transcribe_with_gemini(audio_bytes, clean_mime, language=language)
        if transcript:
            return {"success": True, "transcript": transcript, "provider": "gemini"}
        
        # If Gemini returned an error, try Whisper fallback if configured
        if os.getenv("OPENAI_API_KEY"):
            ext = "wav" if "wav" in clean_mime else "webm"
            whisper_text = transcribe_with_openai_whisper(audio_bytes, filename=f"voice.{ext}", language=language)
            if whisper_text:
                return {"success": True, "transcript": whisper_text, "provider": "openai"}

        # Return the genuine Gemini error
        if err_dict:
            return {
                "success": False,
                "error": err_dict.get("error", "transcription_failed"),
                "message": err_dict.get("message", "Gemini speech transcription failed.")
            }

    # 2. Try OpenAI Whisper if Gemini not configured
    if os.getenv("OPENAI_API_KEY"):
        ext = "wav" if "wav" in clean_mime else "webm"
        transcript = transcribe_with_openai_whisper(audio_bytes, filename=f"voice.{ext}", language=language)
        if transcript:
            return {"success": True, "transcript": transcript, "provider": "openai"}

    # 3. No genuine provider configured
    return {
        "success": False,
        "error": "no_provider",
        "message": (
            "Voice transcription is currently unavailable because an AI speech provider "
            "(Google Gemini or OpenAI Whisper) is not active in the environment. Please type your query in the composer."
        )
    }
