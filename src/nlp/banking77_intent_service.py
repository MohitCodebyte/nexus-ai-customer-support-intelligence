from pathlib import Path
from functools import lru_cache

import joblib
import numpy as np
from scipy.sparse import hstack


PROJECT_ROOT = Path(__file__).resolve().parents[2]

MODEL_PATH = (
    PROJECT_ROOT
    / "models"
    / "intent_classification"
    / "banking77_intent_model_final.joblib"
)


@lru_cache(maxsize=1)
def _load_artifact():
    """Load the saved BANKING77 model and vectorizers once."""

    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"BANKING77 model artifact not found: {MODEL_PATH}"
        )

    artifact = joblib.load(MODEL_PATH)

    required_keys = {
        "model",
        "word_vectorizer",
        "char_vectorizer",
        "char_weight",
    }

    missing_keys = required_keys - set(artifact.keys())

    if missing_keys:
        raise ValueError(
            f"Invalid model artifact. Missing keys: {missing_keys}"
        )

    return artifact


def get_model_info():
    """Return model metadata without exposing internal model objects."""

    artifact = _load_artifact()
    model = artifact["model"]

    return {
        "model_name": "BANKING77 Linear SVM",
        "algorithm": "LinearSVC",
        "classes": int(len(model.classes_)),
        "character_weight": float(artifact["char_weight"]),
        "model_loaded": True,
    }


def predict_banking77_intent(message: str, top_k: int = 3):
    """
    Predict one of the 77 BANKING77 intent categories.

    Note:
        Linear SVM decision scores are not probabilities.
        They must not be interpreted as calibrated confidence.
    """

    if not isinstance(message, str):
        raise TypeError("Message must be a string.")

    message = message.strip()

    if not message:
        raise ValueError("Message cannot be empty.")

    if not isinstance(top_k, int) or isinstance(top_k, bool):
        raise TypeError("top_k must be an integer.")

    if not 1 <= top_k <= 10:
        raise ValueError("top_k must be between 1 and 10.")

    artifact = _load_artifact()

    model = artifact["model"]
    word_vectorizer = artifact["word_vectorizer"]
    char_vectorizer = artifact["char_vectorizer"]
    char_weight = artifact["char_weight"]

    word_features = word_vectorizer.transform([message])

    char_features = char_vectorizer.transform([message])

    combined_features = hstack([
        word_features,
        char_features.multiply(char_weight),
    ]).tocsr()

    predicted_intent = model.predict(combined_features)[0]

    decision_scores = model.decision_function(combined_features)[0]

    top_indices = np.argsort(decision_scores)[::-1][:top_k]

    top_candidates = [
        {
            "intent": str(model.classes_[index]),
            "decision_score": float(decision_scores[index]),
        }
        for index in top_indices
    ]

    return {
        "intent": str(predicted_intent),
        "top_candidates": top_candidates,
        "model": "banking77_linear_svm",
        "score_type": "uncalibrated_decision_score",
    }
