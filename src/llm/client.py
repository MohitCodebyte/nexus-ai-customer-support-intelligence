"""
Configurable LLM Client for Nexus AI Support.

Supports:
- Google Gemini (via GEMINI_API_KEY or GOOGLE_API_KEY)
- OpenAI (via OPENAI_API_KEY)
- Groq (via GROQ_API_KEY)
- Generic OpenAI-compatible endpoints (via LLM_API_KEY & LLM_BASE_URL)

Handles timeouts, retry with exponential backoff, prompt formatting with
conversation memory, and safe failure recovery.
"""

import os
import json
import logging
from typing import List, Dict, Any, Optional
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
import time

logger = logging.getLogger(__name__)


class LLMConfig:
    @staticmethod
    def get_provider() -> Optional[str]:
        if os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"):
            return "gemini"
        if os.getenv("OPENAI_API_KEY"):
            return "openai"
        if os.getenv("GROQ_API_KEY"):
            return "groq"
        if os.getenv("LLM_API_KEY"):
            return "generic"
        return None

    @staticmethod
    def is_configured() -> bool:
        return LLMConfig.get_provider() is not None


def call_openai_compatible_api(
    base_url: str,
    api_key: str,
    model: str,
    messages: List[Dict[str, str]],
    temperature: float = 0.3,
    max_tokens: int = 800,
    timeout: float = 12.0
) -> Optional[str]:
    """Call an OpenAI-compatible /chat/completions endpoint."""
    endpoint = base_url.rstrip("/")
    if not endpoint.endswith("/chat/completions"):
        endpoint += "/chat/completions"

    payload = {
        "model": model,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "messages": messages,
    }

    req = Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "NexusAI-Support/2.0",
        },
        method="POST"
    )

    for attempt in range(2):
        try:
            with urlopen(req, timeout=timeout) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                content = result["choices"][0]["message"]["content"]
                if content and content.strip():
                    return content.strip()
        except (HTTPError, URLError, TimeoutError, KeyError, IndexError) as err:
            logger.warning(f"LLM API attempt {attempt + 1} failed: {err}")
            if attempt == 0:
                time.sleep(0.5)
            continue
        except Exception as e:
            logger.error(f"Unexpected error in LLM API call: {e}")
            break

    return None


def call_gemini_api(
    api_key: str,
    model: str,
    system_prompt: str,
    messages: List[Dict[str, str]],
    temperature: float = 0.3,
    max_tokens: int = 800,
    timeout: float = 12.0
) -> Optional[str]:
    """Call Google Gemini generateContent REST API."""
    clean_model = model or "gemini-1.5-flash"
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{clean_model}:generateContent?key={api_key}"

    # Build contents for Gemini format
    gemini_contents = []
    for msg in messages:
        role = "user" if msg["role"] == "user" else "model"
        gemini_contents.append({
            "role": role,
            "parts": [{"text": msg["content"]}]
        })

    payload: Dict[str, Any] = {
        "contents": gemini_contents,
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
        }
    }

    if system_prompt:
        payload["systemInstruction"] = {
            "parts": [{"text": system_prompt}]
        }

    req = Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    for attempt in range(2):
        try:
            with urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts and "text" in parts[0]:
                        return parts[0]["text"].strip()
        except Exception as err:
            logger.warning(f"Gemini API attempt {attempt + 1} failed: {err}")
            if attempt == 0:
                time.sleep(0.5)
            continue

    return None


def generate_llm_completion(
    system_prompt: str,
    user_query: str,
    context: Optional[str] = None,
    document_context: Optional[str] = None,
    conversation_history: Optional[List[Dict[str, Any]]] = None,
    temperature: float = 0.3
) -> Optional[Dict[str, Any]]:
    """
    Format prompt and history, then invoke configured LLM provider.
    Returns: {"text": str, "provider": str, "model": str} or None on failure.
    """
    provider = LLMConfig.get_provider()
    if not provider:
        return None

    # Construct conversation history turns (limit to last 6 turns to keep context tight)
    messages: List[Dict[str, str]] = []
    messages.append({"role": "system", "content": system_prompt})

    if conversation_history:
        recent_turns = conversation_history[-6:]
        for turn in recent_turns:
            role = "user" if turn.get("role") == "user" else "assistant"
            content = turn.get("content", "").strip()
            if content:
                # Truncate overly long individual historical messages to protect token budget
                clean_content = content[:800] if len(content) > 800 else content
                messages.append({"role": role, "content": clean_content})

    # Build the final user prompt with optional FAQ and document contexts
    user_parts = []
    if context and context.strip():
        user_parts.append(f"### Verified FAQ Context:\n{context.strip()}")
    if document_context and document_context.strip():
        user_parts.append(f"### Attached Customer Document (Untrusted Reference Data):\n{document_context.strip()}")
    user_parts.append(f"Customer Question: {user_query}")

    final_user_content = "\n\n".join(user_parts)
    messages.append({"role": "user", "content": final_user_content})

    # Dispatch to appropriate provider
    if provider == "gemini":
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY", "")
        model = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
        # Filter system prompt from messages array for gemini helper
        chat_msgs = [m for m in messages if m["role"] != "system"]
        answer = call_gemini_api(api_key, model, system_prompt, chat_msgs, temperature=temperature)
        if answer:
            return {"text": answer, "provider": "gemini", "model": model}

    elif provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY", "")
        base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
        model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        answer = call_openai_compatible_api(base_url, api_key, model, messages, temperature=temperature)
        if answer:
            return {"text": answer, "provider": "openai", "model": model}

    elif provider == "groq":
        api_key = os.getenv("GROQ_API_KEY", "")
        base_url = "https://api.groq.com/openai/v1"
        model = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
        answer = call_openai_compatible_api(base_url, api_key, model, messages, temperature=temperature)
        if answer:
            return {"text": answer, "provider": "groq", "model": model}

    elif provider == "generic":
        api_key = os.getenv("LLM_API_KEY", "")
        base_url = os.getenv("LLM_BASE_URL", "http://127.0.0.1:11434/v1")
        model = os.getenv("LLM_MODEL", "default")
        answer = call_openai_compatible_api(base_url, api_key, model, messages, temperature=temperature)
        if answer:
            return {"text": answer, "provider": "generic", "model": model}

    return None

