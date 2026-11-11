"""
Intent Router for AI Customer Support Intelligence.

Routes incoming customer inquiries to the appropriate specialized intent engine:
- Banking77 Linear SVM (77 banking-specific intents)
- Bitext Customer Support Classifier (retail & general e-commerce)

Implements domain detection and ensures Banking77 decision scores are preserved
as uncalibrated decision margins rather than fabricated probabilities.
"""

from typing import Dict, Any, List
import re

from src.nlp.banking77_intent_service import predict_banking77_intent
from src.nlp.bitext_intent_service import predict_intent as predict_bitext_intent

# High-level domain category mapping for Banking77 intents
BANKING77_CATEGORY_MAP: Dict[str, str] = {
    # Card Services
    "card_arrival": "card_services",
    "card_linking": "card_services",
    "card_not_working": "card_services",
    "lost_or_stolen_card": "card_services",
    "pin_blocked": "card_services",
    "contactless_not_working": "card_services",
    "getting_virtual_card": "card_services",
    "card_acceptance": "card_services",
    "card_payment_not_recognised": "card_services",
    "get_physical_card": "card_services",
    "visa_or_mastercard": "card_services",
    "topping_up_by_card": "card_services",
    "compromised_card": "card_services",
    "pending_card_payment": "card_services",
    "declined_card_payment": "card_services",
    "card_swallowed": "card_services",
    "reverted_card_payment?": "card_services",
    "change_pin": "card_services",
    "getting_spare_card": "card_services",
    "order_physical_card": "card_services",
    "virtual_card_not_working": "card_services",
    "get_disposable_virtual_card": "card_services",
    "activate_my_card": "card_services",
    "card_about_to_expire": "card_services",
    "disposable_card_limits": "card_services",
    "apple_pay_or_google_pay": "card_services",
    "card_payment_wrong_exchange_rate": "card_services",
    "card_payment_fee_charged": "card_services",

    # Transfers & Payments
    "transfer_fee_charged": "transfers_payments",
    "cancel_transfer": "transfers_payments",
    "transfer_not_received_by_recipient": "transfers_payments",
    "declined_transfer": "transfers_payments",
    "pending_transfer": "transfers_payments",
    "transfer_timing": "transfers_payments",
    "failed_transfer": "transfers_payments",
    "transfer_into_account": "transfers_payments",
    "balance_not_updated_after_bank_transfer": "transfers_payments",
    "direct_debit_payment_not_recognised": "transfers_payments",
    "beneficiary_not_allowed": "transfers_payments",
    "receiving_money": "transfers_payments",
    "extra_charge_on_statement": "transfers_payments",
    "transaction_charged_twice": "transfers_payments",

    # ATM & Cash
    "pending_cash_withdrawal": "atm_cash",
    "wrong_amount_of_cash_received": "atm_cash",
    "atm_support": "atm_cash",
    "declined_cash_withdrawal": "atm_cash",
    "cash_withdrawal_not_recognised": "atm_cash",
    "cash_withdrawal_charge": "atm_cash",
    "wrong_exchange_rate_for_cash_withdrawal": "atm_cash",

    # Top-up & Deposit Balance
    "automatic_top_up": "top_up_balance",
    "pending_top_up": "top_up_balance",
    "top_up_limits": "top_up_balance",
    "top_up_reverted": "top_up_balance",
    "balance_not_updated_after_cheque_or_cash_deposit": "top_up_balance",
    "verify_source_of_funds": "top_up_balance",
    "verify_top_up": "top_up_balance",
    "top_up_by_cash_or_cheque": "top_up_balance",
    "top_up_failed": "top_up_balance",
    "top_up_by_bank_transfer_charge": "top_up_balance",
    "top_up_by_card_charge": "top_up_balance",

    # FX & International
    "exchange_rate": "fx_exchange",
    "fiat_currency_support": "fx_exchange",
    "exchange_via_app": "fx_exchange",
    "exchange_charge": "fx_exchange",
    "supported_cards_and_currencies": "fx_exchange",
    "country_support": "fx_exchange",

    # Account, Verification & Security
    "age_limit": "account_security",
    "edit_personal_details": "account_security",
    "why_verify_identity": "account_security",
    "unable_to_verify_identity": "account_security",
    "passcode_forgotten": "account_security",
    "lost_or_stolen_phone": "account_security",
    "request_refund": "account_security",
    "Refund_not_showing_up": "account_security",
    "terminate_account": "account_security",
    "verify_my_identity": "account_security",
}

BANKING_KEYWORDS = {
    "card", "debit", "credit", "bank", "banking", "transfer", "wire",
    "deposit", "withdrawal", "withdraw", "atm", "balance", "fee", "charge",
    "cash", "transaction", "pin", "stolen", "lost", "statement", "dispute",
    "declined", "overdraft", "cheque", "check", "currency", "exchange",
    "account", "verify", "identity", "unauthorized", "block", "freeze",
    "refund", "limit", "recipient", "iban", "swift"
}


def is_banking_query(message: str) -> bool:
    """Check if message contains banking domain vocabulary."""
    tokens = set(re.findall(r"\b[a-z]{3,}\b", message.lower()))
    return bool(tokens & BANKING_KEYWORDS)


def route_intent_prediction(message: str, top_k: int = 3) -> Dict[str, Any]:
    """
    Intelligently routes message between Banking77 Linear SVM and Bitext classifier.

    Returns normalized IntentPrediction object compatible with frontend types.
    """
    cleaned = message.strip()
    has_banking_context = is_banking_query(cleaned)

    # 1. Run Banking77 classification
    b77_result = predict_banking77_intent(cleaned, top_k=max(top_k, 3))
    b77_top = b77_result["top_candidates"][0]
    b77_runner_up = b77_result["top_candidates"][1] if len(b77_result["top_candidates"]) > 1 else None

    # Calculate SVM decision margin
    margin = (
        b77_top["decision_score"] - b77_runner_up["decision_score"]
        if b77_runner_up
        else b77_top["decision_score"]
    )

    # 2. Run Bitext classification
    bitext_result = None
    try:
        bitext_result = predict_bitext_intent(cleaned)
    except Exception:
        pass

    # Decision Rule:
    # Use Bitext ONLY if the query is NOT banking-related AND Bitext has high confidence (>= 0.60).
    # In all other cases (and by default for this banking SaaS), use Banking77.
    use_bitext = (
        not has_banking_context
        and bitext_result is not None
        and bitext_result.get("confidence", 0) >= 0.60
    )

    if use_bitext:
        return {
            "intent": bitext_result["intent"],
            "category": bitext_result["category"],
            "confidence": bitext_result["confidence"],
            "score_type": "calibrated_probability",
            "model": "bitext_logistic_regression",
            "review_required": bitext_result.get("review_required", False),
            "status": bitext_result.get("status", "intent_predicted"),
            "top_candidates": [
                {
                    "intent": c["intent"],
                    "score": c["score"]
                }
                for c in bitext_result.get("top_candidates", [])
            ]
        }

    # Banking77 Path:
    top_intent = b77_result["intent"]
    category = BANKING77_CATEGORY_MAP.get(top_intent, "banking_services")
    top_score = b77_top["decision_score"]

    # Gating for human review in Banking77:
    # Review is required if:
    # 1. Top score is deeply negative (< -0.40) AND margin is narrow (< 0.15)
    # 2. Or high-risk security intents like account termination or compromised card
    high_risk_intents = {"terminate_account", "compromised_card"}
    review_required = bool(
        (top_score < -0.40 and margin < 0.15)
        or top_intent in high_risk_intents
    )

    return {
        "intent": top_intent,
        "category": category,
        "confidence": round(top_score, 4),
        "score_type": "uncalibrated_decision_score",
        "model": "banking77_linear_svm",
        "decision_margin": round(margin, 4),
        "review_required": review_required,
        "status": "needs_review" if review_required else "intent_predicted",
        "top_candidates": [
            {
                "intent": c["intent"],
                "score": round(c["decision_score"], 4)
            }
            for c in b77_result["top_candidates"]
        ]
    }

