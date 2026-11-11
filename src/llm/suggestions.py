"""
Intelligent Category-Aware Follow-Up Suggestions for Nexus AI Support.

Generates 2-4 contextual, category-aligned next-question suggestion chips
below assistant responses based on:
1. Banking Category (Card & Account, Transactions, Security, International, Human Support, Other Queries)
2. ML Intent Classification (Banking77 / Bitext)
3. Latest customer question and AI response
4. Configured LLM synthesis with robust categorical fallback
5. Support for English, Hindi, and Hinglish
"""

import re
import logging
from typing import List, Optional, Dict, Any

from src.llm.client import generate_llm_completion, LLMConfig

logger = logging.getLogger(__name__)

# Standard 6 Banking Categories
CATEGORIES = [
    "card-account",
    "transactions",
    "security",
    "international",
    "human-support",
    "other-queries",
]

# Intent to Category Mapping for Banking77 & Bitext
INTENT_CATEGORY_MAP: Dict[str, str] = {
    # Card & Account
    "lost_or_stolen_card": "card-account",
    "card_arrival": "card-account",
    "card_linking": "card-account",
    "card_not_working": "card-account",
    "card_delivery_estimate": "card-account",
    "card_payment_fee_charged": "card-account",
    "card_payment_not_recognised": "card-account",
    "card_about_to_expire": "card-account",
    "card_acceptance": "card-account",
    "card_swallowed": "card-account",
    "getting_spare_card": "card-account",
    "getting_virtual_card": "card-account",
    "order_physical_card": "card-account",
    "activate_my_card": "card-account",
    "automatic_top_up": "card-account",
    "card_payment_wrong_exchange_rate": "card-account",
    "contactless_not_working": "card-account",
    "disposable_card_limits": "card-account",
    "extra_charge_on_statement": "card-account",
    "card_account": "card-account",

    # Transactions
    "pending_transfer": "transactions",
    "pending_card_payment": "transactions",
    "pending_cash_withdrawal": "transactions",
    "failed_transfer": "transactions",
    "transaction_charged_twice": "transactions",
    "transfer_fee_charged": "transactions",
    "transfer_not_received_by_recipient": "transactions",
    "cancel_transfer": "transactions",
    "beneficiary_not_allowed": "transactions",
    "transfer_timing": "transactions",
    "wrong_amount_of_cash_received": "transactions",
    "declined_cash_withdrawal": "transactions",
    "declined_transfer": "transactions",
    "reverted_card_payment?": "transactions",
    "supported_cards_and_currencies": "transactions",
    "top_up_failed": "transactions",
    "top_up_reverted": "transactions",
    "transactions": "transactions",

    # Security
    "compromised_card": "security",
    "pin_blocked": "security",
    "change_pin": "security",
    "passcode_forgotten": "security",
    "verify_source_of_funds": "security",
    "verify_my_identity": "security",
    "unable_to_verify_identity": "security",
    "edit_personal_details": "security",
    "security": "security",

    # International
    "country_support": "international",
    "exchange_rate": "international",
    "exchange_charge": "international",
    "exchange_via_app": "international",
    "foreign_exchange": "international",
    "transfer_into_account": "international",
    "receiving_money": "international",
    "international": "international",

    # Human Support
    "human_agent": "human-support",
    "contact_support": "human-support",
    "complaint": "human-support",
    "human_support": "human-support",
    "speak_agent": "human-support",
}

# Rich Multilingual Categorical Suggestions Library
CATEGORY_FALLBACK_SUGGESTIONS: Dict[str, Dict[str, List[str]]] = {
    "card-account": {
        "en": [
            "How can I block my card immediately?",
            "How do I request a replacement card?",
            "What should I do if my card is lost or stolen?",
            "How can I set or change my daily card limits?",
        ],
        "hi": [
            "मैं अपना कार्ड तुरंत कैसे ब्लॉक कर सकता हूँ?",
            "नया रिप्लेसमेंट कार्ड कैसे मंगवाएं?",
            "कार्ड खो जाने पर क्या प्रक्रिया अपनाएं?",
            "डेबिट कार्ड की दैनिक सीमा कैसे बदलें?",
        ],
        "hinglish": [
            "Mera card turant block kaise karein?",
            "Replacement card kaise request karein?",
            "Card kho gaya hai, kya karna hoga?",
            "Daily card spending limit kaise change karein?",
        ],
    },
    "transactions": {
        "en": [
            "How can I dispute this transaction?",
            "Why is my transfer still showing as pending?",
            "What happens after raising a transaction dispute?",
            "How long do refunds take to reflect in my account?",
        ],
        "hi": [
            "अनधिकृत लेनदेन पर विवाद (dispute) कैसे दर्ज करें?",
            "मेरा ट्रांसफर अभी भी पेंडिंग क्यों दिख रहा है?",
            "विवाद दर्ज करने के बाद क्या प्रक्रिया होगी?",
            "खाते में रिफंड आने में कितना समय लगता है?",
        ],
        "hinglish": [
            "Is transaction ko dispute kaise karein?",
            "Mera transfer pending kyun dikha raha hai?",
            "Dispute raise karne ke baad kitna time lagta hai?",
            "Refund mere bank account mein kab tak aayega?",
        ],
    },
    "security": {
        "en": [
            "How can I reset my password?",
            "How do I enable two-factor OTP security?",
            "What should I do about suspicious account activity?",
            "How do I update my registered mobile number?",
        ],
        "hi": [
            "नेट बैंकिंग पासवर्ड कैसे रीसेट करें?",
            "दो-चरणीय OTP सुरक्षा कैसे चालू करें?",
            "संदिग्ध गतिविधि होने पर तुरंत क्या करें?",
            "पंजीकृत मोबाइल नंबर कैसे अपडेट करें?",
        ],
        "hinglish": [
            "Password reset kaise karein?",
            "Two-factor OTP security kaise enable karein?",
            "Suspicious login activity par kya karna chahiye?",
            "Registered mobile number kaise update karein?",
        ],
    },
    "international": {
        "en": [
            "What are international transfer fees?",
            "How long do overseas wire transfers take?",
            "Which foreign exchange rates apply to my card?",
            "How do I enable international usage on my card?",
        ],
        "hi": [
            "अंतरराष्ट्रीय ट्रांसफर शुल्क क्या हैं?",
            "विदेश में पैसे ट्रांसफर होने में कितना समय लगता है?",
            "मेरे कार्ड पर कौन सी विनिमय दर लागू होती है?",
            "कार्ड पर अंतरराष्ट्रीय लेनदेन कैसे चालू करें?",
        ],
        "hinglish": [
            "International transfer ke charges kya hain?",
            "Overseas transfer settle hone mein kitna time lagta hai?",
            "Foreign exchange rates kaise calculate hote hain?",
            "Card par international transactions kaise enable karein?",
        ],
    },
    "human-support": {
        "en": [
            "Can I speak with a support agent?",
            "What is my support ticket status?",
            "Can I attach additional documents to my inquiry?",
            "What are customer service working hours?",
        ],
        "hi": [
            "क्या मैं किसी लाइव सपोर्ट एजेंट से बात कर सकता हूँ?",
            "मेरे सपोर्ट टिकट की वर्तमान स्थिति क्या है?",
            "क्या मैं अपनी शिकायत में दस्तावेज़ जोड़ सकता हूँ?",
            "ग्राहक सेवा सहायता के काम करने के घंटे क्या हैं?",
        ],
        "hinglish": [
            "Kya main live support agent se baat kar sakta hoon?",
            "Mere support ticket ka status kya hai?",
            "Ticket mein aur documents kaise attach karein?",
            "Customer care support ke working hours kya hain?",
        ],
    },
    "other-queries": {
        "en": [
            "Can you explain that in more detail?",
            "What savings interest rates are currently offered?",
            "How can I download my official account statement?",
            "What should I do next to proceed?",
        ],
        "hi": [
            "क्या आप इसे और विस्तार से समझा सकते हैं?",
            "बचत खाते पर क्या ब्याज दरें उपलब्ध हैं?",
            "आधिकारिक बैंक स्टेटमेंट कैसे डाउनलोड करें?",
            "इस प्रक्रिया को पूरा करने के लिए आगे क्या करें?",
        ],
        "hinglish": [
            "Kya aap isse thoda detail mein samjha sakte hain?",
            "Savings account ke interest rates kya hain?",
            "Bank account statement kaise download karein?",
            "Aage proceed karne ke liye kya steps hain?",
        ],
    },
}


def resolve_category(category: Optional[str] = None, intent: Optional[str] = None) -> str:
    """Resolve category name to one of the 6 canonical categories."""
    if category and isinstance(category, str):
        clean_cat = category.strip().lower().replace("_", "-").replace(" ", "-")
        if clean_cat in CATEGORIES:
            return clean_cat
        for c in CATEGORIES:
            if c in clean_cat or clean_cat in c:
                return c

    if intent and isinstance(intent, str):
        clean_intent = intent.strip().lower()
        if clean_intent in INTENT_CATEGORY_MAP:
            return INTENT_CATEGORY_MAP[clean_intent]

    return "other-queries"


def generate_follow_up_suggestions(
    query: str,
    response: str,
    category: Optional[str] = None,
    intent: Optional[str] = None,
    language: str = "en"
) -> List[str]:
    """
    Generate 2-4 category-aware follow-up question suggestions.
    Uses LLM synthesis when configured, falling back gracefully to
    categorically verified suggestions.
    """
    norm_lang = language.lower()
    if norm_lang not in ("en", "hi", "hinglish"):
        norm_lang = "en"

    canonical_cat = resolve_category(category, intent)

    # 1. Attempt LLM generation if an external provider is configured
    if LLMConfig.is_configured():
        try:
            lang_prompt_map = {
                "en": "in clear English",
                "hi": "in pure Hindi script",
                "hinglish": "in natural Hinglish (conversational Hindi written in English letters)",
            }
            lang_instruction = lang_prompt_map.get(norm_lang, "in English")

            system_prompt = (
                f"You are the Nexus Banking AI follow-up assistant. The customer is discussing banking category: '{canonical_cat}'.\n"
                f"Based on the customer's query and the assistant's response, generate EXACTLY 3 helpful, natural follow-up questions {lang_instruction}.\n"
                f"Rules:\n"
                f"- Return ONLY the 3 questions, each on a new line, numbered 1. 2. 3.\n"
                f"- Each question must be concise (4 to 9 words).\n"
                f"- Strictly keep suggestions within the banking category '{canonical_cat}'.\n"
                f"- Never invent specific account numbers, balances, fees, or policy promises.\n"
                f"- Do not repeat the customer's exact question."
            )

            prompt = f"Customer Query: {query}\n\nAssistant Response: {response[:300]}"
            llm_res = generate_llm_completion(
                system_prompt=system_prompt,
                user_query=prompt,
                temperature=0.4
            )

            if llm_res and isinstance(llm_res.get("text"), str):
                lines = [
                    re.sub(r"^\d+[\.\)]\s*", "", line).strip()
                    for line in llm_res["text"].splitlines()
                    if line.strip() and not line.strip().startswith("#")
                ]
                clean_suggestions = [l for l in lines if len(l) > 6 and len(l) < 90][:4]
                if len(clean_suggestions) >= 2:
                    return clean_suggestions
        except Exception as e:
            logger.debug(f"LLM suggestion generation skipped or failed: {e}")

    # 2. Categorically Verified Fallback Library
    cat_pack = CATEGORY_FALLBACK_SUGGESTIONS.get(canonical_cat, CATEGORY_FALLBACK_SUGGESTIONS["other-queries"])
    lang_pack = cat_pack.get(norm_lang, cat_pack["en"])

    lower_query = query.lower().strip()
    filtered = [
        s for s in lang_pack
        if s.lower().strip() != lower_query and s.lower() not in lower_query
    ]

    if len(filtered) < 3:
        filtered = lang_pack

    return filtered[:3]

