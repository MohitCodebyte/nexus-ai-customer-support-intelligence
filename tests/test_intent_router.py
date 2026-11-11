import pytest
from src.nlp.intent_router import route_intent_prediction, is_banking_query


def test_is_banking_query_detection():
    assert is_banking_query("I lost my debit card. How can I block it?") is True
    assert is_banking_query("What is the international wire transfer fee?") is True
    assert is_banking_query("My cash withdrawal failed at the ATM") is True
    assert is_banking_query("Track my package shipment #12345") is False


def test_banking_queries_route_to_banking77():
    banking_queries = [
        "I lost my debit card. How can I block it?",
        "How do I dispute an unauthorized card transaction?",
        "My cash withdrawal failed but money was deducted.",
        "How can I check my account balance?",
        "How do I change my registered phone number?",
        "I want to make an international wire transfer.",
        "My card payment keeps getting declined.",
        "How can I cancel a pending bank transfer?",
    ]

    for q in banking_queries:
        result = route_intent_prediction(q)
        assert result["model"] == "banking77_linear_svm"
        assert result["score_type"] == "uncalibrated_decision_score"
        assert isinstance(result["intent"], str)
        assert len(result["intent"]) > 0
        assert isinstance(result["category"], str)
        assert len(result["top_candidates"]) >= 3
        assert isinstance(result["review_required"], bool)

