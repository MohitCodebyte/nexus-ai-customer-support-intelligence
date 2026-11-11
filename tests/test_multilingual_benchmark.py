"""
Manually verified Multilingual & Hinglish Benchmark Evaluation Suite.
Tests:
1. Language detection accuracy (English, Hindi, Hinglish, Mixed)
2. Intent classification accuracy using Banking77 SVM
3. Semantic FAQ retrieval quality
4. Response-language consistency
"""

import pytest
from src.nlp.multilingual_service import (
    detect_language,
    canonicalize_to_english,
    translate_response,
)
from src.nlp.intent_router import route_intent_prediction
import src.rag.service as rag_service

# Manually verified test dataset across English, Hindi, Hinglish, and Mixed
MULTILINGUAL_BENCHMARK_DATASET = [
    # Category 1: Lost or Stolen Card
    {
        "query": "I lost my credit card, how can I freeze or block it immediately?",
        "expected_lang": "en",
        "expected_intent": "lost_or_stolen_card",
        "expected_response_lang": "en",
    },
    {
        "query": "मेरा कार्ड खो गया है, मैं इसे कैसे ब्लॉक करूँ?",
        "expected_lang": "hi",
        "expected_intent": "lost_or_stolen_card",
        "expected_response_lang": "hi",
    },
    {
        "query": "Mera card kho gya hai, kese block karu?",
        "expected_lang": "hinglish",
        "expected_intent": "lost_or_stolen_card",
        "expected_response_lang": "hinglish",
    },
    {
        "query": "Card chori ho gaya hai please turant band kar do",
        "expected_lang": "hinglish",
        "expected_intent": "lost_or_stolen_card",
        "expected_response_lang": "hinglish",
    },

    # Category 2: Disputed / Unauthorized Charges
    {
        "query": "How do I dispute an unrecognized transaction on my card?",
        "expected_lang": "en",
        "expected_intent": "direct_debit_payment_not_recognised",
        "expected_response_lang": "en",
    },
    {
        "query": "खाते से गलत पैसे कट गए हैं, शिकायत कैसे करें?",
        "expected_lang": "hi",
        "expected_intent": "direct_debit_payment_not_recognised",
        "expected_response_lang": "hi",
    },
    {
        "query": "Paise cut gaye account se unrecognized charge dispute karna hai",
        "expected_lang": "hinglish",
        "expected_intent": "direct_debit_payment_not_recognised",
        "expected_response_lang": "hinglish",
    },

    # Category 3: Password / PIN Recovery
    {
        "query": "I forgot my online banking password, how do I reset it?",
        "expected_lang": "en",
        "expected_intent": "passcode_forgotten",
        "expected_response_lang": "en",
    },
    {
        "query": "ऑनलाइन बैंकिंग का पासवर्ड कैसे रीसेट करें?",
        "expected_lang": "hi",
        "expected_intent": "passcode_forgotten",
        "expected_response_lang": "hi",
    },
    {
        "query": "Online banking password bhul gaya hu reset kaise hoga?",
        "expected_lang": "hinglish",
        "expected_intent": "passcode_forgotten",
        "expected_response_lang": "hinglish",
    },

    # Category 4: International Wire Transfers & Fees
    {
        "query": "What is the fee and timing for international wire transfers?",
        "expected_lang": "en",
        "expected_intent": "transfer_fee_charged",
        "expected_response_lang": "en",
    },
    {
        "query": "विदेश पैसे भेजने पर कितना शुल्क और समय लगता है?",
        "expected_lang": "hi",
        "expected_intent": "transfer_fee_charged",
        "expected_response_lang": "hi",
    },
    {
        "query": "International wire transfer charges kitne lagte hain?",
        "expected_lang": "hinglish",
        "expected_intent": "transfer_fee_charged",
        "expected_response_lang": "hinglish",
    },
]


def test_language_detection_benchmark():
    """Verify 100% accuracy on language detection across all benchmark queries."""
    correct = 0
    for item in MULTILINGUAL_BENCHMARK_DATASET:
        detected = detect_language(item["query"])
        if detected == item["expected_lang"]:
            correct += 1
        else:
            print(f"FAILED Detection for '{item['query']}': got {detected}, expected {item['expected_lang']}")
            
    accuracy = correct / len(MULTILINGUAL_BENCHMARK_DATASET)
    assert accuracy == 1.0, f"Language detection accuracy was {accuracy * 100}% (expected 100%)"


def test_intent_accuracy_and_retrieval_benchmark():
    """Verify that canonicalized queries correctly map to English banking intents and retrieve FAQ knowledge."""
    for item in MULTILINGUAL_BENCHMARK_DATASET:
        query = item["query"]
        lang = detect_language(query)
        canonical = canonicalize_to_english(query, lang)
        
        # Test Intent Classification
        prediction = route_intent_prediction(canonical)
        assert prediction["intent"] == item["expected_intent"], (
            f"Intent mismatch for '{query}' (canonical: '{canonical}'): "
            f"got {prediction['intent']}, expected {item['expected_intent']}"
        )
        
        # Test RAG retrieval quality
        rag = rag_service.build_context(canonical, top_k=2)
        sources = rag.get("sources", [])
        assert len(sources) > 0, f"RAG failed to retrieve any sources for '{canonical}'"
        assert sources[0].get("similarity_score", 0) > 0.35, (
            f"Retrieval similarity score too low ({sources[0].get('similarity_score')} for '{canonical}')"
        )


def test_response_language_consistency_benchmark():
    """Verify that generated responses strictly match the expected customer target language."""
    base_response = (
        "To lock your card immediately, open Mobile Banking > Security > Lock Card "
        "or call our 24/7 hotline at 1-800-555-CARD."
    )
    
    # 1. English
    resp_en = translate_response(base_response, "en")
    assert detect_language(resp_en) == "en"
    assert "1-800-555-CARD" in resp_en

    # 2. Hindi
    resp_hi = translate_response(base_response, "hi")
    assert detect_language(resp_hi) == "hi"
    assert "1-800-555-CARD" in resp_hi
    assert "कार्ड" in resp_hi

    # 3. Hinglish
    resp_hinglish = translate_response(base_response, "hinglish")
    assert detect_language(resp_hinglish) == "hinglish"
    assert "1-800-555-CARD" in resp_hinglish
    assert "card" in resp_hinglish.lower()

