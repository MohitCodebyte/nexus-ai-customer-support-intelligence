"""
Natural Conversational Engine for Nexus AI Support.

Provides ChatGPT-level natural conversational responses, greetings, identity,
humor, general knowledge, empathy, clarification, and multi-turn follow-up handling.
Supports English, Hindi (Devanagari), and Hinglish (Roman Hindi).
"""

import re
import random
from typing import Dict, Any, List, Optional, Tuple

# =============================================================================
# 1. EXPLICIT HUMAN SUPPORT HANDOFF DETECTION
# =============================================================================
HUMAN_AGENT_PATTERNS = [
    r"\b(talk|speak|connect|transfer|escalate|switch|assign)\b.*\b(human|agent|person|representative|specialist|executive|support tier|insaan)\b",
    r"\b(human|agent|representative|specialist)\b.*\b(please|needed|help|request|chahiye|mangta)\b",
    r"\b(i want|i need|can i get|give me)\b.*\b(human|agent|person|representative)\b",
    r"\b(agent se baat|insaan se baat|human agent|asli insaan)\b",
    r"\b(talk to human|speak to human|real person|customer care executive|operator)\b",
    r"\b(escalate this|escalate to human|human support)\b",
]

# =============================================================================
# 2. NORMAL CONVERSATIONAL INTENTS & LEXICON
# =============================================================================
# Devanagari Hindi conversational keywords
HINDI_GREETINGS = ["नमस्ते", "नमस्कार", "प्रणाम", "सलाम", "शुभ प्रभात", "शुभ संध्या"]
HINDI_IDENTITY = ["आप कौन हैं", "तुम कौन हो", "आपका नाम क्या है", "तुम्हारा नाम क्या है", "आप क्या कर सकते हैं"]
HINDI_CASUAL = ["आप कैसे हैं", "कैसे हो", "क्या हाल है", "सब ठीक"]
HINDI_JOKES = ["चुटकुला सुनाओ", "जोक सुनाओ", "हंसाओ"]
HINDI_GRATITUDE = ["धन्यवाद", "शुक्रिया", "बहुत धन्यवाद"]

GREETING_PATTERNS = [
    r"\b(hi|hello|hey|heyy|heya|hiya|howdy|hola)\b",
    r"\b(good\s+(morning|afternoon|evening|day))\b",
    r"\b(namaste|namaskar|pranam|ram\s+ram|sasriyakal|salaam)\b",
    r"\b(kese\s+ho|kaise\s+ho|kaisa\s+hai|kya\s+haal|kya\s+chal\s+raha)\b",
]

IDENTITY_PATTERNS = [
    r"\b(who are you|what is your name|what're you|tell me about yourself|what is nexus|what's your name)\b",
    r"\b(aap kaun ho|tum kaun ho|tumhara naam kya hai|aapka naam kya hai|apna naam batao)\b",
    r"\b(are you (a )?bot|are you (an )?ai|are you human|are you real)\b",
    r"\b(what can you do|how can you help( me)?|your capabilities)\b",
    r"\b(who made you|who created you|what are you)\b",
]

CASUAL_PATTERNS = [
    r"\b(how are you|how're you|how are you doing|how is it going|how's your day)\b",
    r"\b(what('s| is) up|sup|wassup|kya chal raha hai|sab theek)\b",
    r"\b(nice to meet you|pleasure meeting you|good to see you)\b",
]

JOKE_PATTERNS = [
    r"\b(tell me a joke|tell a joke|crack a joke|say something funny|make me laugh)\b",
    r"\b(joke sunao|chutkula sunao|koi joke|hasao)\b",
]

GRATITUDE_PATTERNS = [
    r"\b(thank you|thanks|thank you so much|thanks a lot|thx|ty)\b",
    r"\b(dhanyawad|shukriya|bahut dhanyawad|thanks bhai|thanks yaar)\b",
]

FAREWELL_PATTERNS = [
    r"^(bye|goodbye|cya|see you|see ya|take care|have a good day)[\s!.,?]*$",
    r"^(alvida|phir milenge|chalta hu|chalti hu)[\s!.,?]*$",
]

FOLLOW_UP_PATTERNS = [
    r"^(what is it|what is that|what's that)\??$",
    r"^(explain( that)? again|explain more|tell me more|elaborate)\??$",
    r"^(what should i do( next)?|what next|next steps?)\??$",
    r"^(why|why is that|can you explain why)\??$",
    r"^(how so|in what way)\??$",
]

GENERAL_KNOWLEDGE_BANKING_TERMS = {
    "atm": {
        "en": "An Automated Teller Machine (ATM) allows you to withdraw cash, check account balances, deposit checks or cash, and transfer funds without visiting a branch in person.",
        "hi": "एटीएम (ऑटोमेटेड टेलर मशीन) एक इलेक्ट्रॉनिक बैंकिंग आउटलेट है जो आपको बिना बैंक शाखा जाए नकदी निकालने, बैलेंस चेक करने और फंड ट्रांसफर करने की सुविधा देता है।",
        "hinglish": "ATM (Automated Teller Machine) ek electronic banking device hai jisse aap bina bank branch jaaye cash withdraw kar sakte hain, balance check kar sakte hain aur PIN change kar sakte hain."
    },
    "debit card": {
        "en": "A debit card is a payment card linked directly to your checking or savings account. Funds are deducted immediately upon purchase or ATM withdrawal.",
        "hi": "डेबिट कार्ड आपके बचत या चालू बैंक खाते से सीधे जुड़ा एक पेमेंट कार्ड है। खरीदारी या एटीएम से निकासी पर पैसे तुरंत आपके खाते से कटते हैं।",
        "hinglish": "Debit card aapke bank account se linked payment card hota hai. Jab bhi aap shopping karte hain ya ATM se cash nikaalte hain, paise turant aapke account se deduct ho jaate hain."
    },
    "credit card": {
        "en": "A credit card allows you to borrow funds up to a pre-approved credit limit to make purchases or pay bills, which you can pay back later on a monthly billing cycle.",
        "hi": "क्रेडिट कार्ड आपको बैंक द्वारा स्वीकृत क्रेडिट सीमा तक पैसे उधार लेकर खरीदारी करने की सुविधा देता है, जिसे आप मासिक बिलिंग चक्र में चुकाते हैं।",
        "hinglish": "Credit card ek loan-based card hai jisme bank aapko ek credit limit deta hai. Aap abhi khareedari kar sakte hain aur agle mahine bill generate hone par payment kar sakte hain."
    },
    "interest": {
        "en": "In banking, interest is either money you earn on deposits (like savings or fixed deposits) or the cost you pay for borrowing funds (like personal or home loans).",
        "hi": "बैंकिंग में ब्याज (Interest) या तो आपके जमा पैसों पर मिलने वाली कमाई है (बचत खाता या एफडी) या कर्ज लेने पर बैंक को दिया जाने वाला अतिरिक्त शुल्क है।",
        "hinglish": "Interest (byaaj) wo rakam hai jo ya toh aapko bank deposits par milti hai (savings/FD), ya fir loan lene par bank ko deni hoti hai."
    },
    "compound interest": {
        "en": "Compound interest is interest calculated on both the initial principal and the accumulated interest from previous periods, allowing your savings to grow exponentially.",
        "hi": "चक्रवृद्धि ब्याज (Compound Interest) मूलधन और पिछले अवधियों के संचित ब्याज दोनों पर मिलने वाला ब्याज है, जिससे आपकी बचत तेजी से बढ़ती है।",
        "hinglish": "Compound interest (chakravridhi byaaj) me aapko mool-dhan ke saath-saath pichhle byaaj par bhi byaaj milta hai, jisse aapki savings tezi se grow karti hai."
    },
    "apr": {
        "en": "APR (Annual Percentage Rate) represents the annual cost of borrowing money, including both the interest rate and additional processing fees charged by the lender.",
        "hi": "एपीआर (वार्षिक प्रतिशत दर) ऋण लेने की वार्षिक कुल लागत को दर्शाता है, जिसमें ब्याज दर और अन्य प्रोसेसिंग शुल्क शामिल होते हैं।",
        "hinglish": "APR (Annual Percentage Rate) saalana borrowing cost ko darshata hai, jisme interest rate aur bank processing fees dono shamil hoti hain."
    }
}

# Bank Jokes in 3 Languages
JOKES_DB = {
    "en": [
        "Why did the dollar bill go to therapy? Because it had too much tension and wanted to unwind!",
        "Why do banks keep the vaults so cold? So the interest doesn't spoil!",
        "Why did the coin jump into the fountain? It wanted to make some cents in life!",
        "Why did the banker switch careers? He simply lost interest!",
        "What kind of music do bank tellers listen to? Direct notes!"
    ],
    "hi": [
        "एक बार सिक्के ने नोट से कहा: 'तुम इतने उड़ते क्यों हो?' नोट बोला: 'क्योंकि मेरी कद्र तुमसे ज्यादा है!'",
        "बैंक मैनेजर ने ग्राहक से कहा: 'आपका खाता खाली है।' ग्राहक बोला: 'शुक्र है, कोई चोरी का डर तो नहीं!'",
        "बैंक हमेशा इतने ठंडे क्यों होते हैं? ताकि उनका ब्याज खराब न हो जाए!",
    ],
    "hinglish": [
        "Banker ne customer se pucha: 'Aapka account khali kyu hai?' Customer bola: 'Sir zero balance me hi toh sukoon hai, chori ka koi darr nahi!'",
        "Banks me hamesha AC itna chilled kyu rehta hai? Taaki customer ka interest spoil na ho sake!",
        "Coin ne ATM se pucha: 'Bhai tu itne paise kyu baant raha hai?' ATM bola: 'Mera dil bada hai, par account dusro ka hai!'"
    ]
}


def is_explicit_human_request(query: str) -> bool:
    """Check if customer is explicitly asking to talk to a human agent."""
    cleaned = query.strip().lower()
    for pat in HUMAN_AGENT_PATTERNS:
        if re.search(pat, cleaned):
            return True
    return False


def is_normal_conversation(query: str, history: Optional[List[Dict[str, Any]]] = None) -> bool:
    """
    Check if message belongs to normal conversation (Path A):
    greetings, casual chat, identity, jokes, gratitude, general knowledge, or conversational follow-ups.
    """
    cleaned = query.strip().lower()

    # 0. Check Devanagari Hindi conversational sets
    if any(w in cleaned for w in HINDI_GREETINGS):
        return True
    if any(w in cleaned for w in HINDI_IDENTITY):
        return True
    if any(w in cleaned for w in HINDI_CASUAL):
        return True
    if any(w in cleaned for w in HINDI_JOKES):
        return True
    if any(w in cleaned for w in HINDI_GRATITUDE):
        return True

    # 0. Check Devanagari Hindi greetings
    if any(w in cleaned for w in HINDI_GREETINGS):
        options = [
            "नमस्ते! मैं नेक्सस (Nexus) हूँ, आपका एआई बैंकिंग सहायक। आज मैं आपकी क्या सहायता कर सकता हूँ?",
            "नमस्ते! नेक्सस एआई सपोर्ट में आपका स्वागत है। बताइए, आपके खाते, कार्ड या किसी बैंकिंग सेवा में क्या मदद चाहिए?",
            "नमस्कार! आशा है आपका दिन अच्छा बीत रहा होगा। कार्ड, ट्रांसफर या किसी भी प्रश्न के लिए मैं यहाँ मौजूद हूँ।"
        ]
        return random.choice(options)

    if any(w in cleaned for w in HINDI_IDENTITY):
        return (
            "मैं **Nexus** हूँ — आपका समर्पित एआई बैंकिंग सहायक।\n\n"
            "मैं आपके कार्ड को ब्लॉक करने, गलत लेनदेन की शिकायत दर्ज कराने, पासवर्ड रीसेट करने, "
            "और बैंकिंग नीतियों को समझने में आपकी सहायता कर सकता हूँ। मैं एक एआई सहायक हूँ और "
            "24/7 आपकी सेवा के लिए उपलब्ध हूँ!"
        )

    if any(w in cleaned for w in HINDI_CASUAL):
        return (
            "मैं बिल्कुल ठीक हूँ, पूछने के लिए धन्यवाद! मैं आपकी बैंकिंग से जुड़ी किसी भी सहायता के लिए तैयार हूँ। "
            "आज मैं आपके लिए क्या कर सकता हूँ?"
        )

    if any(w in cleaned for w in HINDI_JOKES):
        jokes = JOKES_DB.get("hi", JOKES_DB["en"])
        joke = random.choice(jokes)
        return f"हाहा, बिल्कुल! यह सुनिए:\n\n{joke}\n\nउम्मीद है आपको पसंद आया! अब बताइए, बैंकिंग में कोई सहायता चाहिए?"

    if any(w in cleaned for w in HINDI_GRATITUDE):
        return (
            "आपका बहुत-बहुत स्वागत है! यदि आपके पास कोई और प्रश्न है या किसी अन्य सेवा में मदद चाहिए, "
            "तो मुझे कभी भी बताइए।"
        )

    # 1. Greetings
    for pat in GREETING_PATTERNS:
        if re.search(pat, cleaned):
            return True

    # 2. Identity / Nexus awareness
    for pat in IDENTITY_PATTERNS:
        if re.search(pat, cleaned):
            return True

    # 3. Casual small-talk
    for pat in CASUAL_PATTERNS:
        if re.search(pat, cleaned):
            return True

    # 4. Jokes & Humor
    for pat in JOKE_PATTERNS:
        if re.search(pat, cleaned):
            return True

    # 5. Gratitude / Courtesy
    for pat in GRATITUDE_PATTERNS:
        if re.search(pat, cleaned):
            return True

    # 6. Farewell
    for pat in FAREWELL_PATTERNS:
        if re.search(pat, cleaned):
            return True

    # 7. Follow-up phrases when conversation history exists
    if history and len(history) > 0:
        for pat in FOLLOW_UP_PATTERNS:
            if re.search(pat, cleaned):
                return True

    # 8. General knowledge queries (e.g. "what is an atm", "what is compounding")
    if cleaned.startswith(("what is ", "what are ", "explain ", "what does ", "kya hota hai", "kya hai")):
        for term in GENERAL_KNOWLEDGE_BANKING_TERMS:
            if term in cleaned:
                return True

    return False


def generate_conversational_response(
    query: str,
    target_lang: str = "en",
    history: Optional[List[Dict[str, Any]]] = None
) -> str:
    """
    Generate natural, context-aware conversational response for Path A.
    """
    cleaned = query.strip().lower()

    # 0. Check Devanagari Hindi greetings
    if any(w in cleaned for w in HINDI_GREETINGS):
        options = [
            "नमस्ते! मैं नेक्सस (Nexus) हूँ, आपका एआई बैंकिंग सहायक। आज मैं आपकी क्या सहायता कर सकता हूँ?",
            "नमस्ते! नेक्सस एआई सपोर्ट में आपका स्वागत है। बताइए, आपके खाते, कार्ड या किसी बैंकिंग सेवा में क्या मदद चाहिए?",
            "नमस्कार! आशा है आपका दिन अच्छा बीत रहा होगा। कार्ड, ट्रांसफर या किसी भी प्रश्न के लिए मैं यहाँ मौजूद हूँ।"
        ]
        return random.choice(options)

    if any(w in cleaned for w in HINDI_IDENTITY):
        return (
            "मैं **Nexus** हूँ — आपका समर्पित एआई बैंकिंग सहायक।\n\n"
            "मैं आपके कार्ड को ब्लॉक करने, गलत लेनदेन की शिकायत दर्ज कराने, पासवर्ड रीसेट करने, "
            "और बैंकिंग नीतियों को समझने में आपकी सहायता कर सकता हूँ। मैं एक एआई सहायक हूँ और "
            "24/7 आपकी सेवा के लिए उपलब्ध हूँ!"
        )

    if any(w in cleaned for w in HINDI_CASUAL):
        return (
            "मैं बिल्कुल ठीक हूँ, पूछने के लिए धन्यवाद! मैं आपकी बैंकिंग से जुड़ी किसी भी सहायता के लिए तैयार हूँ। "
            "आज मैं आपके लिए क्या कर सकता हूँ?"
        )

    if any(w in cleaned for w in HINDI_JOKES):
        jokes = JOKES_DB.get("hi", JOKES_DB["en"])
        joke = random.choice(jokes)
        return f"हाहा, बिल्कुल! यह सुनिए:\n\n{joke}\n\nउम्मीद है आपको पसंद आया! अब बताइए, बैंकिंग में कोई सहायता चाहिए?"

    if any(w in cleaned for w in HINDI_GRATITUDE):
        return (
            "आपका बहुत-बहुत स्वागत है! यदि आपके पास कोई और प्रश्न है या किसी अन्य सेवा में मदद चाहिए, "
            "तो मुझे कभी भी बताइए।"
        )

    # 1. Greetings
    for pat in GREETING_PATTERNS:
        if re.search(pat, cleaned):
            if target_lang == "hi":
                options = [
                    "नमस्ते! मैं नेक्सस (Nexus) हूँ, आपका एआई बैंकिंग सहायक। आज मैं आपकी क्या सहायता कर सकता हूँ?",
                    "नमस्ते! नेक्सस एआई सपोर्ट में आपका स्वागत है। बताइए, आपके खाते, कार्ड या किसी बैंकिंग सेवा में क्या मदद चाहिए?",
                    "नमस्कार! आशा है आपका दिन अच्छा बीत रहा होगा। कार्ड, ट्रांसफर या किसी भी प्रश्न के लिए मैं यहाँ मौजूद हूँ।"
                ]
            elif target_lang == "hinglish":
                options = [
                    "Hello! Main Nexus hoon, aapka AI banking support assistant. Aaj main aapki kya madad kar sakta hoon?",
                    "Hi there! Nexus AI Support me aapka swagat hai. Card services, account security ya transfer related koi sawaal hai toh batayein!",
                    "Namaste! Main Nexus hoon, aapka digital banking assistant. Kaise help kar sakta hoon aapki?"
                ]
            else:
                options = [
                    "Hello! I'm Nexus, your AI banking assistant. How can I help you today?",
                    "Hi there! Welcome to Nexus AI Support. Feel free to ask about your cards, transfers, account security, or statements.",
                    "Good day! I'm here to assist you with any banking questions or account services. What can I do for you?"
                ]
            return random.choice(options)

    # 2. Identity / Self Awareness
    for pat in IDENTITY_PATTERNS:
        if re.search(pat, cleaned):
            if target_lang == "hi":
                return (
                    "मैं **Nexus** हूँ — आपका समर्पित एआई बैंकिंग सहायक।\n\n"
                    "मैं आपके कार्ड को ब्लॉक करने, गलत लेनदेन की शिकायत दर्ज कराने, पासवर्ड रीसेट करने, "
                    "और बैंकिंग नीतियों को समझने में आपकी सहायता कर सकता हूँ। मैं एक एआई सहायक हूँ और "
                    "24/7 आपकी सेवा के लिए उपलब्ध हूँ!"
                )
            elif target_lang == "hinglish":
                return (
                    "Main **Nexus** hoon — aapka dedicated AI banking assistant.\n\n"
                    "Main payment cards lock karne, unrecognized charges dispute karne, wire transfer fees check karne, "
                    "aur banking policies explain karne me help karta hoon. Main ek AI model hoon aur 24/7 yahan available hoon!"
                )
            else:
                return (
                    "I am **Nexus**, your intelligent AI banking assistant.\n\n"
                    "I can help you manage payment cards, report unauthorized charges, check wire fees, "
                    "understand banking policies, and analyze uploaded account statements. "
                    "I am an AI assistant here 24/7 to make banking seamless and secure for you!"
                )

    # 3. Casual "How are you?"
    for pat in CASUAL_PATTERNS:
        if re.search(pat, cleaned):
            if target_lang == "hi":
                return (
                    "मैं बिल्कुल ठीक हूँ, पूछने के लिए धन्यवाद! मैं आपकी बैंकिंग से जुड़ी किसी भी सहायता के लिए तैयार हूँ। "
                    "आज मैं आपके लिए क्या कर सकता हूँ?"
                )
            elif target_lang == "hinglish":
                return (
                    "Main ekdum badiya hoon, thank you for asking! Main ready hoon aapki banking queries me help karne ke liye. "
                    "Bataiye, aaj kis cheez me help chahiye?"
                )
            else:
                return (
                    "I'm doing great, thank you for asking! Everything is running smoothly, and I'm ready to assist you. "
                    "What can I help you with today?"
                )

    # 4. Jokes & Humor
    for pat in JOKE_PATTERNS:
        if re.search(pat, cleaned):
            jokes = JOKES_DB.get(target_lang, JOKES_DB["en"])
            joke = random.choice(jokes)
            if target_lang == "hi":
                return f"हाहा, बिल्कुल! यह सुनिए:\n\n{joke}\n\nउम्मीद है आपको पसंद आया! अब बताइए, बैंकिंग में कोई सहायता चाहिए?"
            elif target_lang == "hinglish":
                return f"Haha bilkul! Ye lijiye ek light joke:\n\n{joke}\n\nUmeed hai aapko hasi aayi! Ab batayein, banking me kya help karu?"
            else:
                return f"Haha, here is a banking joke for you:\n\n{joke}\n\nHope that brought a smile to your face! How else can I assist you today?"

    # 5. Gratitude
    for pat in GRATITUDE_PATTERNS:
        if re.search(pat, cleaned):
            if target_lang == "hi":
                return (
                    "आपका बहुत-बहुत स्वागत है! यदि आपके पास कोई और प्रश्न है या किसी अन्य सेवा में मदद चाहिए, "
                    "तो मुझे कभी भी बताइए।"
                )
            elif target_lang == "hinglish":
                return (
                    "You're most welcome! Agar kisi aur cheez me help chahiye ho ya koi sawaal ho, toh be-jhijhak batayein!"
                )
            else:
                return (
                    "You're very welcome! If you have any other questions or need further assistance, I'm right here to help."
                )

    # 6. Farewell
    for pat in FAREWELL_PATTERNS:
        if re.search(pat, cleaned):
            if target_lang == "hi":
                return "अलविदा! आपका दिन शुभ हो। जब भी आपको बैंकिंग सहायता की आवश्यकता हो, नेक्सस आपकी सेवा में रहेगा।"
            elif target_lang == "hinglish":
                return "Goodbye! Apna khayal rakhein. Kabhi bhi banking help chahiye ho toh Nexus hamesha yahan hai!"
            else:
                return "Goodbye! Have a wonderful day ahead. Whenever you need banking assistance, Nexus will be right here!"

    # 7. Follow-Up Queries (Conversational Memory)
    if history and len(history) > 0:
        for pat in FOLLOW_UP_PATTERNS:
            if re.search(pat, cleaned):
                # Locate the latest assistant response in history
                last_assistant_turn = None
                for turn in reversed(history):
                    if turn.get("role") == "assistant" and turn.get("content"):
                        last_assistant_turn = turn["content"]
                        break

                if last_assistant_turn:
                    # Provide an empathetic contextual expansion
                    if target_lang == "hi":
                        return (
                            f"जैसा कि हमने अभी चर्चा की:\n\n> {last_assistant_turn[:220]}...\n\n"
                            "इसे और स्पष्ट करने के लिए: यदि आप इस प्रक्रिया को पूरा करना चाहते हैं, "
                            "तो आप मोबाइल ऐप खोलकर संबंधित विकल्प चुन सकते हैं, या मुझे सटीक विवरण बता सकते हैं "
                            "ताकि मैं चरण-दर-चरण मार्गदर्शन दे सकूँ।"
                        )
                    elif target_lang == "hinglish":
                        return (
                            f"Jaise humne abhi baat ki:\n\n> {last_assistant_turn[:220]}...\n\n"
                            "Iske aage ka process ye hai ki aap mobile app me Card Services ya Support section me jaakar action le sakte hain. "
                            "Aapko specific kis step me help chahiye batayein?"
                        )
                    else:
                        return (
                            f"To build on what we just discussed:\n\n> {last_assistant_turn[:220]}...\n\n"
                            "In practical terms: you can execute this directly via your mobile banking app or online portal. "
                            "Would you like me to walk you through the exact step-by-step instructions or help you with something specific?"
                        )

    # 8. General Banking Knowledge Concepts
    for term, answers in GENERAL_KNOWLEDGE_BANKING_TERMS.items():
        if term in cleaned:
            return answers.get(target_lang, answers["en"])

    # Fallback normal conversation response
    if target_lang == "hi":
        return (
            "मैं समझ गया। मैं नेक्सस एआई सपोर्ट हूँ। आप मुझसे कार्ड सेवाओं, अनधिकृत लेन-देन, खाते की सुरक्षा, "
            "या सामान्य बैंकिंग नीतियों के बारे में कोई भी प्रश्न पूछ सकते हैं। बताइए मैं किस विषय में सहायता करूँ?"
        )
    elif target_lang == "hinglish":
        return (
            "Main samajh gaya. Main Nexus AI Support assistant hoon. Aap mujhse card block karne, dispute raise karne, "
            "ya kisi bhi banking policy ke baare me pooch sakte hain. Bataiye kis cheez me help chahiye?"
        )
    return (
        "I understand! As Nexus AI Support, I'm here to assist you with card services, unauthorized charges, "
        "wire transfers, statements, or general banking questions. What specific topic can I help you explore today?"
    )


def generate_human_handoff_response(target_lang: str = "en") -> str:
    """Friendly, reassuring response when human support escalation is explicitly requested."""
    if target_lang == "hi":
        return (
            "मैं समझता हूँ। मैंने आपका अनुरोध हमारे ग्राहक सेवा विशेषज्ञ (Human Support Specialist) को भेज दिया है।\n\n"
            "आपका सपोर्ट टिकट दर्ज कर लिया गया है। एक लाइव एजेंट कुछ ही देर में इस चैट में आपसे जुड़ेगा। "
            "आपकी बातचीत का पूरा संदर्भ एजेंट के पास सुरक्षित है, इसलिए आपको विवरण दोहराने की आवश्यकता नहीं होगी।"
        )
    elif target_lang == "hinglish":
        return (
            "Main samajh gaya. Maine aapki request hamare Human Support Specialist ko escalate kar di hai.\n\n"
            "Aapka support ticket generate ho gaya hai. Ek live agent jald hi is chat me join karega. "
            "Aapka conversation context agent ke pass safe hai, toh aapko sab dobara repeat nahi karna padega."
        )
    return (
        "I understand completely. I have routed your request to a live Customer Support Specialist.\n\n"
        "Your support ticket is now active. An agent will review the conversation history and join this session shortly. "
        "You do not need to repeat any details you've already shared."
    )


def generate_clarification_response(query: str, target_lang: str = "en") -> str:
    """Friendly clarification question when a query is ambiguous rather than dropping to error."""
    if target_lang == "hi":
        return (
            "मैं आपकी पूरी सहायता करना चाहता हूँ, लेकिन आपकी पूछताछ को बेहतर समझने के लिए कुछ और जानकारी चाहिए।\n\n"
            "क्या आप बता सकते हैं कि यह प्रश्न आपके **डेबिट/क्रेडिट कार्ड**, **बैंक ट्रांसफर**, **खाता सुरक्षा**, "
            "या किसी अन्य सेवा से संबंधित है?"
        )
    elif target_lang == "hinglish":
        return (
            "Main aapki puri help karna chahta hoon, par request samajhne ke liye thodi aur detail chahiye.\n\n"
            "Kya aap bata sakte hain ki ye issue aapke **Debit/Credit Card**, **Account Transfer**, **Statement**, "
            "ya **Login Security** se related hai?"
        )
    return (
        "I want to make sure I give you the most accurate assistance, but I need a little more context.\n\n"
        "Could you please clarify if this inquiry relates to a **debit/credit card**, a **bank wire/transfer**, "
        "an **unrecognized transaction**, or your **account login credentials**?"
    )
