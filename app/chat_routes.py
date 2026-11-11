from flask import Blueprint, current_app, jsonify, request

from src.nlp.bitext_intent_service import predict_intent

chat_bp = Blueprint("chat", __name__)


@chat_bp.route("/api/chat/intent", methods=["POST"])
def classify_chat_intent():
    """Classify a customer message without performing business actions."""

    if not request.is_json:
        return jsonify({
            "error": "Content-Type must be application/json"
        }), 415

    payload = request.get_json(silent=True)

    if not isinstance(payload, dict):
        return jsonify({
            "error": "Request body must be a valid JSON object"
        }), 400

    message = payload.get("message")

    if not isinstance(message, str) or not message.strip():
        return jsonify({
            "error": "A non-empty 'message' string is required"
        }), 400

    threshold = payload.get("review_threshold", 0.55)

    if isinstance(threshold, bool):
        return jsonify({
            "error": "review_threshold must be a number between 0 and 1"
        }), 400

    try:
        threshold = float(threshold)
    except (TypeError, ValueError):
        return jsonify({
            "error": "review_threshold must be a number between 0 and 1"
        }), 400

    if not 0.0 <= threshold <= 1.0:
        return jsonify({
            "error": "review_threshold must be between 0 and 1"
        }), 400

    try:
        prediction = predict_intent(
            message.strip(),
            review_threshold=threshold,
        )
    except FileNotFoundError:
        current_app.logger.exception("Intent model file is missing")
        return jsonify({
            "error": "Intent model is not available"
        }), 503
    except Exception:
        current_app.logger.exception("Intent prediction failed")
        return jsonify({
            "error": "Unable to classify the message"
        }), 500

    return jsonify({
        "customer_message": message.strip(),
        "intent": prediction["intent"],
        "category": prediction["category"],
        "confidence": prediction["confidence"],
        "review_required": prediction["review_required"],
        "status": prediction["status"],
        "top_candidates": prediction["top_candidates"],
        "response": None,
        "note": (
            "Intent prediction only. No customer reply was generated "
            "and no order, payment, refund, or account action was performed."
        ),
    }), 200
