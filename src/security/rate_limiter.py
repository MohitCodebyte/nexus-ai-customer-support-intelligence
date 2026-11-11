import time
import threading
from typing import Dict, Tuple, Optional
import html


class InMemoryRateLimiter:
    """
    Thread-safe in-memory sliding window rate limiter.
    Supports request throttling per IP / session key.
    """
    def __init__(self):
        self._lock = threading.Lock()
        # key -> list of timestamp floats
        self._requests: Dict[str, list] = {}
        # key -> (failure_count, lockout_expiry_timestamp)
        self._lockouts: Dict[str, Tuple[int, float]] = {}

    def is_allowed(self, key: str, max_requests: int = 30, window_seconds: float = 60.0) -> Tuple[bool, int]:
        """
        Check if request is allowed under sliding window limit.
        Returns (is_allowed, remaining_seconds_to_wait).
        """
        now = time.time()
        with self._lock:
            timestamps = self._requests.get(key, [])
            cutoff = now - window_seconds
            # Filter timestamps within active window
            valid_timestamps = [t for t in timestamps if t > cutoff]

            if len(valid_timestamps) >= max_requests:
                earliest = valid_timestamps[0]
                wait_time = max(1, int(earliest + window_seconds - now))
                self._requests[key] = valid_timestamps
                return False, wait_time

            valid_timestamps.append(now)
            self._requests[key] = valid_timestamps
            return True, 0

    def record_login_attempt(self, key: str, success: bool, max_failures: int = 5, lockout_seconds: float = 900.0) -> Tuple[bool, int]:
        """
        Track login attempts for brute-force protection.
        Returns (is_locked_out, remaining_lockout_seconds).
        """
        now = time.time()
        with self._lock:
            # Check existing lockout
            if key in self._lockouts:
                failures, expiry = self._lockouts[key]
                if now < expiry:
                    return True, int(expiry - now)
                else:
                    # Expired lockout
                    del self._lockouts[key]

            if success:
                self._lockouts.pop(key, None)
                return False, 0

            # Record failure
            current_failures, _ = self._lockouts.get(key, (0, 0.0))
            new_failures = current_failures + 1

            if new_failures >= max_failures:
                expiry = now + lockout_seconds
                self._lockouts[key] = (new_failures, expiry)
                return True, int(lockout_seconds)

            self._lockouts[key] = (new_failures, 0.0)
            return False, 0

    def clear(self):
        """Reset limiter state (useful for test suites)."""
        with self._lock:
            self._requests.clear()
            self._lockouts.clear()


# Global singleton instances
chat_limiter = InMemoryRateLimiter()
upload_limiter = InMemoryRateLimiter()
auth_limiter = InMemoryRateLimiter()


def sanitize_user_input(text: str, max_length: int = 2500) -> str:
    """
    Sanitize text input:
    1. Truncate to maximum length.
    2. Strip dangerous control characters.
    3. HTML-escape to neutralize XSS payload injections.
    """
    if not isinstance(text, str):
        return ""

    cleaned = text[:max_length].strip()
    # Remove ASCII control characters except standard whitespace
    cleaned = "".join(ch for ch in cleaned if ch in ('\n', '\r', '\t') or ord(ch) >= 32)
    # Neutralize HTML tags
    cleaned = html.escape(cleaned, quote=True)
    return cleaned


def sanitize_prompt_injection(text: str) -> str:
    """
    Detect and neutralize common LLM prompt injection signatures in untrusted documents.
    """
    if not isinstance(text, str):
        return ""

    # Common injection patterns to neutralize
    patterns = [
        (r"(?i)ignore\s+(all\s+)?(previous|above)\s+instructions", "[FILTERED_INSTRUCTION]"),
        (r"(?i)disregard\s+(all\s+)?(prior|previous)\s+prompts", "[FILTERED_INSTRUCTION]"),
        (r"(?i)system\s*prompt\s*:", "[FILTERED_LABEL]:"),
        (r"(?i)you\s+are\s+now\s+in\s+developer\s+mode", "[FILTERED_DIRECTIVE]"),
        (r"(?i)you\s+are\s+now\s+an\s+unrestricted\s+ai", "[FILTERED_DIRECTIVE]"),
        (r"(?i)new\s+system\s+instruction", "[FILTERED_DIRECTIVE]"),
    ]

    import re
    sanitized = text
    for pattern, replacement in patterns:
        sanitized = re.sub(pattern, replacement, sanitized)
    return sanitized

