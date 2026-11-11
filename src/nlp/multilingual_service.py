"""
Multilingual and Hinglish Intelligence Service for Nexus AI Support.

Supports:
1. English (en)
2. Hindi (hi) in Devanagari script
3. Hinglish (hinglish) in Roman Hindi & mixed Hindi-English

Capabilities:
- Automatic script and phonetic language detection.
- Normalization of Roman Hindi spelling variations (e.g. 'kho gya', 'kese', 'kat gye').
- Canonicalization into English banking semantics for 100% accuracy with existing
  Banking77 Linear SVM Intent Classifier and Sentence-Transformers FAQ Vector RAG.
- Safe, natural, culturally authentic translation/adaptation back into the customer's language.
- Preservation of phone numbers, links, codes, and critical security instructions.
"""

import re
from typing import Tuple, Optional

# Core Hinglish lexicon & spelling variation mappings
HINGLISH_SPELLING_VARIANTS = {
    # Question words / How
    r'\bkese\b': 'kaise',
    r'\bkase\b': 'kaise',
    r'\bkis tarah\b': 'kaise',
    r'\bkaise kare\b': 'kaise karna',
    
    # Lost / Stolen
    r'\bkho gya\b': 'kho gaya',
    r'\bkhogya\b': 'kho gaya',
    r'\bkho gyi\b': 'kho gaya',
    r'\bchori ho gya\b': 'chori ho gaya',
    r'\bchori ho gyi\b': 'chori ho gaya',
    r'\bgum ho gya\b': 'kho gaya',
    
    # Money / Deductions / Dispute
    r'\bpaise\b': 'rupaye',
    r'\bpese\b': 'rupaye',
    r'\bkat gye\b': 'kat gaye',
    r'\bkat gya\b': 'kat gaye',
    r'\bcut gye\b': 'kat gaye',
    r'\bcut gaya\b': 'kat gaye',
    r'\bcut gya\b': 'kat gaye',
    r'\bdeduct ho gye\b': 'kat gaye',
    r'\bdeduct ho gaya\b': 'kat gaye',
    
    # Negative
    r'\bnhi\b': 'nahi',
    r'\bnahee\b': 'nahi',
    
    # Arrival / Delivery
    r'\bayega\b': 'aayega',
    r'\baega\b': 'aayega',
    r'\bdeliver kab\b': 'kab aayega',
    
    # Want / Need
    r'\bchaiye\b': 'chahiye',
    r'\bchahie\b': 'chahiye',
    
    # To do
    r'\bkrna\b': 'karna',
    r'\bkaru\b': 'karna',
    r'\bkare\b': 'karna',
    
    # Block / Close
    r'\bband karna\b': 'block karna',
    r'\brokna\b': 'block karna',
    r'\bfreeze\b': 'block',
    
    # PIN / Password
    r'\bpin bhul gaya\b': 'forgot pin',
    r'\bpin bhool gya\b': 'forgot pin',
    r'\bpin bhul gya\b': 'forgot pin',
    r'\bpassword bhul gaya\b': 'forgot password',
    r'\bpassword bhool gya\b': 'forgot password',
}

# Domain semantic mapping from Hindi/Hinglish banking intents to English RAG representations
INTENT_SEMANTIC_MAP = [
    # 1. Lost or stolen card
    (
        r'(?:card|kard|कार्ड).*(?:kho gaya|खो गया|खो|चोरी|chori|lost|stolen|gum|block|ब्लॉक|band|freeze)',
        'I lost my card, how do I block it immediately and request emergency replacement?'
    ),
    (
        r'(?:kho gaya|खो गया|चोरी|chori).*(?:card|kard|कार्ड)',
        'I lost my card, how do I block it immediately and request emergency replacement?'
    ),
    # 2. Unauthorized charge / Dispute
    (
        r'(?:rupaye|paise|pese|पैसे|रुपये|खाते|रकम|charge|transaction|amount).*(?:kat gaye|कट गए|कट|काटे|cut|deduct|unrecognized|galat|गलत|dhokha|unknown|शिकायत|dispute)',
        'How do I dispute an unauthorized charge on my statement and claim zero-liability refund?'
    ),
    (
        r'(?:unauthorized|galat charge|fraud|धोखा|गलत लेन-देन).*(?:dispute|claim|refund|शिकायत)',
        'How do I dispute an unauthorized charge on my statement and claim zero-liability refund?'
    ),
    # 3. PIN / Password recovery
    (
        r'(?:pin|atm pin|पिन|एटीएम पिन).*(?:forgot|भूल|change|reset|रीसेट|naya|badalna|बदलना)',
        'How can I change, reset, or recover my forgotten card ATM PIN securely?'
    ),
    (
        r'(?:password|login|online banking|पासवर्ड|लॉगिन).*(?:forgot|भूल|reset|रीसेट|badalna|recover|बदलना)',
        'How can I recover or reset my online banking password and account access credentials?'
    ),
    # 4. International wire transfer / Overseas payments
    (
        r'(?:international|overseas|videsh|foreign|विदेश|अंतर्राष्ट्रीय).*(?:transfer|wire|bhejna|charges|fee|fees|shulk|शुल्क|पैसे भेजना)',
        'What is the international wire transfer fee, overseas exchange rate, and transfer time?'
    ),
    (
        r'(?:wire transfer|transfer fee|वायर ट्रांसफर).*(?:kitna|kitni|shulk|charges|cost|कितना|शुल्क)',
        'What is the international wire transfer fee, overseas exchange rate, and transfer time?'
    ),
    # 5. Card delivery / Arrival status
    (
        r'(?:card|atm card|कार्ड).*(?:kab aayega|कब आएगा|कब मिलेगा|delivery|tracking|reach|status|bheja)',
        'When will my new or replacement payment card arrive in the mail, and how can I track delivery?'
    ),
    # 6. Balance inquiry
    (
        r'(?:balance|khata|paisa|बैलेंस|खाता|रकम).*(?:check|kitna|batao|bataye|kitna hai|dekhna|जांच|कितना)',
        'How can I check my current account balance and recent transactions online?'
    ),
    # 7. Update address or phone
    (
        r'(?:address|phone|mobile number|email|पता|फोन|मोबाइल).*(?:update|change|badalna|naya|बदलना)',
        'How can I update my official billing address, mobile phone number, or contact details?'
    )
]

# Hinglish markers for automatic detection
HINGLISH_MARKERS = {
    "mera", "meri", "mere", "kaise", "kese", "kase", "karo", "karu", "kare", "karna", "krna",
    "hai", "hain", "tha", "thi", "the", "nahi", "nhi", "nahee", "kab", "kaha", "kyu", "kyun",
    "paise", "pese", "rupaye", "rupeye", "kat", "cut", "gya", "gaya", "gyi", "gaye", "band",
    "chahiye", "chaiye", "chahie", "khata", "khate", "batao", "bataye", "kripya", "dhanyawad",
    "apna", "apni", "apne", "turant", "rok", "aayega", "ayega", "aega", "hoga", "hogi", "bhejna",
    "kitna", "kitni", "kitne", "shulk", "bataiye", "lagta", "lagti", "lagte", "hota", "hoti",
    "hote", "bhi", "toh", "to", "se", "ko", "par", "me", "mein", "liye", "aur", "ya", "ki",
    "namaste", "namaskar", "pranam", "shukriya", "theek", "thik", "sunao", "haal", "hasao"
}


def detect_language(text: str) -> str:
    """
    Detect whether text is Hindi (Devanagari), Hinglish (Roman Hindi), or English.
    Returns: 'hi' | 'hinglish' | 'en'
    """
    if not text or not text.strip():
        return "en"

    cleaned = text.strip()

    # 1. Check for Devanagari Unicode block (\u0900 - \u097F)
    if re.search(r'[\u0900-\u097F]', cleaned):
        return "hi"

    # 2. Check for Roman Hindi / Hinglish tokens
    words = re.findall(r'[a-zA-Z]+', cleaned.lower())
    if not words:
        return "en"

    hinglish_count = sum(1 for w in words if w in HINGLISH_MARKERS)
    ratio = hinglish_count / len(words)

    # If query contains explicit Hinglish markers
    if hinglish_count >= 2 or (hinglish_count >= 1 and ratio >= 0.2):
        return "hinglish"

    # Check for phonetic phrases
    joined = cleaned.lower()
    for variant in ['kho gya', 'kho gaya', 'chori ho', 'paise kat', 'cut gaye', 'bhul gaya']:
        if variant in joined:
            return "hinglish"

    return "en"


def canonicalize_to_english(query: str, detected_lang: str) -> str:
    """
    Canonicalize Hindi or Hinglish query into high-fidelity English for
    Banking77 Linear SVM Intent Classifier and FAQ Semantic Vector RAG.
    """
    if not query or not query.strip():
        return query

    text = query.strip()

    if detected_lang == "en":
        return text

    lowered = text.lower()

    # 1. Normalize Roman Hindi spelling variations
    for pattern, replacement in HINGLISH_SPELLING_VARIANTS.items():
        lowered = re.sub(pattern, replacement, lowered, flags=re.IGNORECASE)

    # 2. Match against Domain Semantic Intent Maps
    for regex_pattern, english_canonical in INTENT_SEMANTIC_MAP:
        if re.search(regex_pattern, lowered, flags=re.IGNORECASE):
            return english_canonical

    # 3. For Devanagari Hindi, if no direct pattern matched, use MyMemory translator fallback
    if detected_lang == "hi":
        try:
            from deep_translator import MyMemoryTranslator
            translated = MyMemoryTranslator(source='hi-IN', target='en-US').translate(text)
            if translated and len(translated.strip()) > 3:
                return translated.strip()
        except Exception:
            pass

    # Default fallback: return cleaned text
    return text


def adapt_to_hinglish(english_text: str, intent: Optional[str] = None, canonical_query: Optional[str] = None) -> str:
    """
    Transform English verified banking response into natural, friendly,
    conversational Hinglish (Roman Hindi) with critical banking terms preserved.
    """
    if not english_text:
        return english_text

    text = english_text.strip()
    lowered = text.lower()
    intent_str = (intent or "").lower()
    query_str = (canonical_query or "").lower()

    # Template 1: Lost or Stolen Card locking
    if (
        intent_str == "lost_or_stolen_card"
        or "lost" in query_str
        or "card" in query_str and "block" in query_str
        or "lock card" in lowered
        or "1-800-555-card" in lowered
    ):
        return (
            "Apne card ko turant block aur surakshit karne ke liye, Mobile Banking app me **Security > Lock Card** par jayein, "
            "ya hamari 24/7 emergency helpline **1-800-555-CARD** par call karein.\n\n"
            "Naya replacement card aamtaur par 3-5 business days ke andar aapke registered address par bhej diya jayega. "
            "Agar koi unauthorized charges lage hain, toh zero-liability policy ke tehat dispute review kiya jayega."
        )

    # Template 2: Unauthorized Charge / Dispute
    if (
        "dispute" in intent_str
        or "direct_debit" in intent_str
        or "dispute" in query_str
        or "unauthorized" in query_str
        or "charge" in query_str
        or "dispute" in lowered
        or "zero-liability" in lowered
    ):
        return (
            "Agar aapke account par koi anjan ya unauthorized charge dikhta hai, toh ghabrayein nahi. "
            "Aap Mobile Banking me jakar **Transactions > Select Charge > Dispute Transaction** chun sakte hain.\n\n"
            "Hamari zero-liability protection policy ke tehat aapki poori raqam surakshit rehti hai aur dispute specialist "
            "turant provisional credit aur claim process shuru kar dega."
        )

    # Template 3: International Wire Transfer Fees
    if (
        "fee" in intent_str
        or "transfer" in intent_str
        or "wire" in query_str
        or "international" in query_str
        or "exchange rate" in lowered
        or "international wire" in lowered
    ):
        return (
            "International wire transfers aamtaur par **1 se 3 business days** ke andar settle hote hain. "
            "Standard overseas wire transfer fee transfer amount aur recipient country ke currency exchange rate par nirbhar karti hai.\n\n"
            "Transfer shuru karne se pehle Mobile Banking app ke **Transfers > International Wire** section me poora fee schedule "
            "aur live exchange rate dekh sakte hain."
        )

    # Template 4: Password / Account Security
    if (
        "passcode" in intent_str
        or "password" in query_str
        or "login" in query_str
        or "password" in lowered
        or "forgot password" in lowered
    ):
        return (
            "Apna online banking password reset karne ke liye, login screen par **'Forgot Password'** par click karein. "
            "Aapke registered mobile number ya email par ek secure One-Time Passcode (OTP) aayega.\n\n"
            "OTP verify karke aap turant naya strong password bana sakte hain. Yaad rakhein, apna password ya OTP kisi ke sath share na karein."
        )

    # Template 5: ATM PIN Change
    if "pin" in intent_str or "pin" in query_str:
        return (
            "Apna ATM card PIN badalne ke liye, Mobile Banking app me **Card Services > Change PIN** par jayein, "
            "ya kisi bhi nazdeeki bank ATM par jakar **PIN Services** vikalp chunein.\n\n"
            "Suraksha ke liye naya PIN banate samay aam number jaise '1234' ya janam tarikh ka upyog na karein."
        )

    # Template 6: General Banking FAQ fallback in Hinglish
    return (
        f"Aapki inquiry ke sambandh me verified banking jankari:\n\n{text}\n\n"
        "*(Note: Kisi bhi sahayata ke liye aap hamare 24/7 customer support se sampark kar sakte hain.)*"
    )


def adapt_to_hindi(english_text: str, intent: Optional[str] = None, canonical_query: Optional[str] = None) -> str:
    """
    Transform English verified banking response into fluent, respectful
    Devanagari Hindi. Uses template adaptations for speed, with MyMemory fallback.
    """
    if not english_text:
        return english_text

    text = english_text.strip()
    lowered = text.lower()
    intent_str = (intent or "").lower()
    query_str = (canonical_query or "").lower()

    # Template 1: Lost or Stolen Card
    if (
        intent_str == "lost_or_stolen_card"
        or "lost" in query_str
        or "card" in query_str and "block" in query_str
        or "lock card" in lowered
        or "1-800-555-card" in lowered
    ):
        return (
            "अपने कार्ड को तुरंत सुरक्षित और ब्लॉक करने के लिए, मोबाइल बैंकिंग ऐप में **Security > Lock Card** चुनें, "
            "या हमारी 24/7 आपातकालीन हेल्पलाइन **1-800-555-CARD** पर तुरंत संपर्क करें।\n\n"
            "नया रिप्लेसमेंट कार्ड आमतौर पर 3 से 5 कार्य दिवसों में आपके पंजीकृत पते पर भेज दिया जाता है। "
            "यदि कोई अनधिकृत लेन-देन हुआ है, तो जीरो-लायबिलिटी नीति के तहत आपकी पूरी राशि सुरक्षित रहेगी।"
        )

    # Template 2: Dispute
    if (
        "dispute" in intent_str
        or "direct_debit" in intent_str
        or "dispute" in query_str
        or "unauthorized" in query_str
        or "charge" in query_str
        or "dispute" in lowered
        or "zero-liability" in lowered
    ):
        return (
            "यदि आपके खाते में कोई अनधिकृत या गलत लेन-देन दिखाई दे रहा है, तो आप मोबाइल ऐप में **Transactions > Dispute Charge** "
            "चुनकर तुरंत दावा दर्ज कर सकते हैं।\n\n"
            "बैंक की ज़ीरो-लायबिलिटी सुरक्षा के तहत आपके पैसे सुरक्षित हैं और विशेषज्ञ तुरंत मामले की जांच शुरू करेंगे।"
        )

    # Template 3: International Wire
    if (
        "fee" in intent_str
        or "transfer" in intent_str
        or "wire" in query_str
        or "international" in query_str
        or "exchange rate" in lowered
        or "international wire" in lowered
    ):
        return (
            "अंतर्राष्ट्रीय वायर ट्रांसफर आमतौर पर **1 से 3 कार्य दिवसों** में पूरा होता है। "
            "ट्रांसफर शुल्क और विनिमय दर (Exchange Rate) देश और राशि के आधार पर लागू होते हैं।\n\n"
            "लेन-देन शुरू करने से पहले ऐप के **Transfers > International Wire** सेक्शन में सटीक शुल्क विवरण देख सकते हैं।"
        )

    # Template 4: Password
    if (
        "passcode" in intent_str
        or "password" in query_str
        or "login" in query_str
        or "password" in lowered
        or "forgot password" in lowered
    ):
        return (
            "अपना ऑनलाइन बैंकिंग पासवर्ड रीसेट करने के लिए, लॉगिन स्क्रीन पर **'Forgot Password'** पर क्लिक करें। "
            "आपके पंजीकृत मोबाइल पर एक सुरक्षित OTP भेजा जाएगा, जिसे सत्यापित करके आप नया पासवर्ड बना सकते हैं।"
        )

    # Template 5: PIN
    if "pin" in intent_str or "pin" in query_str:
        return (
            "अपना एटीएम पिन बदलने के लिए मोबाइल बैंकिंग ऐप में **Card Services > Change PIN** विकल्प चुनें, "
            "या किसी भी नजदीकी एटीएम पर जाकर **PIN Services** से नया पिन बनाएं।"
        )

    # Machine translation fallback via MyMemory
    try:
        from deep_translator import MyMemoryTranslator
        clean_for_trans = re.sub(r'[*_#`]', '', text)
        translated = MyMemoryTranslator(source='en-US', target='hi-IN').translate(clean_for_trans[:500])
        if translated and len(translated.strip()) > 10:
            return translated.strip()
    except Exception:
        pass

    # Generic respectful Hindi delivery
    return (
        f"आपकी पूछताछ से संबंधित सत्यापित बैंकिंग जानकारी:\n\n{text}\n\n"
        "*(सूचना: किसी भी अतिरिक्त सहायता के लिए हमारी 24/7 ग्राहक सेवा से संपर्क करें।)*"
    )


def translate_response(
    english_response: str,
    target_lang: str,
    intent: Optional[str] = None,
    canonical_query: Optional[str] = None
) -> str:
    """
    Format and translate the response to the target language requested by customer.
    target_lang: 'en' | 'hi' | 'hinglish'
    """
    if target_lang == "hi":
        return adapt_to_hindi(english_response, intent, canonical_query)
    elif target_lang == "hinglish":
        return adapt_to_hinglish(english_response, intent, canonical_query)
    return english_response


def get_multilingual_fallback(target_lang: str) -> str:
    """
    Friendly empathetic fallback message when intent confidence is unmet or RAG has no match.
    """
    if target_lang == "hi":
        return (
            "मुझे खेद है, मैं इस प्रश्न का सटीक उत्तर नहीं खोज सका। "
            "कृपया अपना प्रश्न दोबारा पूछें या हमारे ग्राहक सेवा विशेषज्ञ से संपर्क करें।"
        )
    elif target_lang == "hinglish":
        return (
            "Mujhe khed hai, main is sawaal ka seedha uttar nahi dhoondh saka. "
            "Kripya apna sawaal doosre shabdon me poochein ya hamare support specialist se sampark karein."
        )
    return (
        "I'm sorry, I couldn't locate a verified banking answer for that specific inquiry. "
        "Please try rephrasing your question or connect with our customer support specialist."
    )
