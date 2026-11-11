import pytest

from src.nlp.banking77_intent_service import (
    get_model_info,
    predict_banking77_intent,
)


def test_model_loads_with_77_classes():
    info = get_model_info()

    assert info["model_loaded"] is True
    assert info["classes"] == 77
    assert info["algorithm"] == "LinearSVC"


def test_prediction_returns_valid_structure():
    result = predict_banking77_intent(
        "My card has been stolen"
    )

    assert isinstance(result, dict)
    assert result["intent"] in [
        "lost_or_stolen_card"
        # The following assertion is checked against the model below.
    ] or isinstance(result["intent"], str)

    assert result["model"] == "banking77_linear_svm"
    assert result["score_type"] == "uncalibrated_decision_score"
    assert len(result["top_candidates"]) == 3


@pytest.mark.parametrize(
    "message, expected_intent",
    [
        (
            "My card has been stolen",
            "lost_or_stolen_card",
        ),
        (
            "I am waiting for my bank transfer",
            "balance_not_updated_after_bank_transfer",
        ),
        (
            "Why was I charged an extra fee?",
            "extra_charge_on_statement",
        ),
    ],
)
def test_known_intent_predictions(message, expected_intent):
    result = predict_banking77_intent(message)

    assert result["intent"] == expected_intent
    assert result["top_candidates"][0]["intent"] == expected_intent


def test_top_candidates_are_sorted_by_score():
    result = predict_banking77_intent(
        "I cannot verify my identity",
        top_k=3,
    )

    scores = [
        candidate["decision_score"]
        for candidate in result["top_candidates"]
    ]

    assert scores == sorted(scores, reverse=True)


def test_custom_top_k():
    result = predict_banking77_intent(
        "My card is not working",
        top_k=2,
    )

    assert len(result["top_candidates"]) == 2


def test_empty_message_is_rejected():
    with pytest.raises(ValueError):
        predict_banking77_intent("   ")


def test_non_string_message_is_rejected():
    with pytest.raises(TypeError):
        predict_banking77_intent(None)


@pytest.mark.parametrize("invalid_top_k", [0, 11, -1])
def test_invalid_top_k_is_rejected(invalid_top_k):
    with pytest.raises(ValueError):
        predict_banking77_intent(
            "My card is not working",
            top_k=invalid_top_k,
        )


def test_non_integer_top_k_is_rejected():
    with pytest.raises(TypeError):
        predict_banking77_intent(
            "My card is not working",
            top_k=2.5,
        )
