import pytest
from src.llm.suggestions import generate_follow_up_suggestions, resolve_category, CATEGORY_FALLBACK_SUGGESTIONS
from src.services.speech_service import transcribe_audio_blob, MAX_AUDIO_BYTES


def test_resolve_category_mappings():
    assert resolve_category(category="card-account") == "card-account"
    assert resolve_category(intent="lost_or_stolen_card") == "card-account"
    assert resolve_category(intent="exchange_rate") == "international"
    assert resolve_category(intent="compromised_card") == "security"
    assert resolve_category(intent="pending_transfer") == "transactions"
    assert resolve_category(category="human-support") == "human-support"
    assert resolve_category(category="other-queries") == "other-queries"


def test_generate_suggestions_all_categories():
    categories = [
        "card-account",
        "transactions",
        "security",
        "international",
        "human-support",
        "other-queries",
    ]
    for cat in categories:
        sugs = generate_follow_up_suggestions(
            query="Sample customer inquiry",
            response="Here is the relevant banking advice.",
            category=cat,
            language="en"
        )
        assert isinstance(sugs, list)
        assert 2 <= len(sugs) <= 4
        assert all(isinstance(s, str) and len(s) > 0 for s in sugs)


def test_generate_suggestions_multilingual():
    # Hindi
    hi_sugs = generate_follow_up_suggestions(
        query="Mera card kho gaya hai",
        response="Kripya apna card block karein.",
        category="card-account",
        language="hi"
    )
    assert len(hi_sugs) >= 2

    # Hinglish
    hing_sugs = generate_follow_up_suggestions(
        query="Card block kaise karein",
        response="Aap app se card block kar sakte hain.",
        category="card-account",
        language="hinglish"
    )
    assert len(hing_sugs) >= 2


def test_speech_service_audio_size_limit():
    large_audio = b"0" * (MAX_AUDIO_BYTES + 1024)
    res = transcribe_audio_blob(large_audio, "audio/webm", "en")
    assert res["success"] is False
    assert res["error"] == "file_too_large"
    assert "exceeds maximum allowed limit" in res["message"]


def test_speech_service_empty_audio():
    res = transcribe_audio_blob(b"", "audio/webm", "en")
    assert res["success"] is False
    assert res["error"] == "empty_audio"
    assert "empty" in res["message"].lower()
