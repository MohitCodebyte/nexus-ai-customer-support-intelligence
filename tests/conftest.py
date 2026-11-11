import pytest
from src.security.rate_limiter import chat_limiter, upload_limiter, auth_limiter


@pytest.fixture(autouse=True)
def reset_rate_limiters():
    """Reset rate limiter state before each test execution."""
    chat_limiter.clear()
    upload_limiter.clear()
    auth_limiter.clear()
    yield
    chat_limiter.clear()
    upload_limiter.clear()
    auth_limiter.clear()

