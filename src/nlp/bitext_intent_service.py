from pathlib import Path

import joblib
import numpy as np


PROJECT_ROOT = Path(__file__).resolve().parents[2]

MODEL_PATH = (
    PROJECT_ROOT
    / "models"
    / "intent_classification"
    / "bitext_intent_model_final.joblib"
)

# Initial heuristic only; tune using validation/business requirements.
DEFAULT_REVIEW_THRESHOLD = 0.55

_artifact = None


def load_model():
    """Load the model once and reuse it for subsequent predictions."""
    global _artifact

    if _artifact is None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError(
                f"Intent model not found: {MODEL_PATH}"
            )

        _artifact = joblib.load(MODEL_PATH)

    return _artifact


def predict_intent(
    message: str,
    review_threshold: float = DEFAULT_REVIEW_THRESHOLD,
) -> dict:
    """
    Classify a customer message and return an intent prediction.

    This function does not generate a customer response or execute
    any order, payment, refund, or account operation.
    """
    if not isinstance(message, str) or not message.strip():
        raise ValueError("message must be a non-empty string")

    if not 0.0 <= review_threshold <= 1.0:
        raise ValueError("review_threshold must be between 0 and 1")

    artifact = load_model()
    model = artifact["model"]
    vectorizer = artifact["vectorizer"]

    features = vectorizer.transform([message.strip()])
    probabilities = model.predict_proba(features)[0]

    # Rank possible intents from highest to lowest model probability.
    ranked_indices = np.argsort(probabilities)[::-1]
    best_index = int(ranked_indices[0])

    intent = str(model.classes_[best_index])
    confidence = float(probabilities[best_index])

    categories = artifact["intent_to_categories"].get(intent, [])
    category = categories[0] if len(categories) == 1 else categories

    review_required = confidence < review_threshold

    return {
        "intent": intent,
        "category": category,
        "confidence": round(confidence, 4),
        "review_required": review_required,
        "status": (
            "needs_review"
            if review_required
            else "intent_predicted"
        ),
        "top_candidates": [
            {
                "intent": str(model.classes_[int(index)]),
                "score": round(float(probabilities[index]), 4),
            }
            for index in ranked_indices[:3]
        ],
    }
