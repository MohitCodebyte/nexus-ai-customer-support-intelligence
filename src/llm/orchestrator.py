"""
Nexus Intelligent Message Orchestrator.

Implements the three response paths:
- PATH A: NORMAL CONVERSATION (Greetings, introductions, jokes, small-talk, gratitude, follow-ups)
- PATH B: BANKING SUPPORT (Banking77 Intent classification + Verified FAQ RAG + LLM synthesis)
- PATH C: HUMAN SUPPORT (Explicit human assistance requests or critical security escalations)
"""

from enum import Enum
from typing import Dict, Any, List, Optional
import logging

from src.llm.prompts import (
    NEXUS_SYSTEM_PROMPT_CONVERSATIONAL,
    NEXUS_SYSTEM_PROMPT_BANKING,
    NEXUS_SYSTEM_PROMPT_HUMAN_HANDOFF,
)
from src.llm.client import generate_llm_completion, LLMConfig
from src.llm.conversational_engine import (
    is_explicit_human_request,
    is_normal_conversation,
    generate_conversational_response,
    generate_human_handoff_response,
    generate_clarification_response,
)
from src.nlp.multilingual_service import (
    translate_response,
)

logger = logging.getLogger(__name__)


class ResponsePath(str, Enum):
    NORMAL_CONVERSATION = "normal_conversation"
    BANKING_SUPPORT = "banking_support"
    HUMAN_SUPPORT = "human_support"


def classify_response_path(
    query: str,
    history: Optional[List[Dict[str, Any]]] = None
) -> ResponsePath:
    """
    Determine which of the three response paths should handle this inquiry:
    - Path C: Explicit Human Support
    - Path A: Normal Conversation
    - Path B: Banking Support
    """
    # 1. Path C: Explicit Human Support Request
    if is_explicit_human_request(query):
        return ResponsePath.HUMAN_SUPPORT

    # 2. Path A: Normal Conversation (greetings, general chat, jokes, identity, thanks)
    if is_normal_conversation(query, history=history):
        lower_q = query.lower()
        banking_action_terms = [
            "lost card", "stolen card", "card stolen", "card lost", "block card",
            "freeze card", "dispute transaction", "dispute charge", "unauthorized charge",
            "unauthorized transaction", "wire transfer fee", "wire transfer time",
            "cash withdrawal failed", "money deducted", "paise kat gaye", "kat gaye"
        ]
        if not any(t in lower_q for t in banking_action_terms):
            return ResponsePath.NORMAL_CONVERSATION

    # 3. Path B: Banking Support (Default for customer inquiries)
    return ResponsePath.BANKING_SUPPORT


def orchestrate_chat_response(
    query: str,
    canonical_query: str,
    target_lang: str,
    rag_context: Dict[str, Any],
    document_context: Optional[str] = None,
    conversation_history: Optional[List[Dict[str, Any]]] = None,
    intent_data: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Master orchestration pipeline delivering natural conversational AI responses.
    """
    intent_dict = intent_data or {}
    intent_name = intent_dict.get("intent", "")

    # Classify into Path A, B, or C
    path = classify_response_path(
        query=query,
        history=conversation_history
    )

    # =========================================================================
    # PATH C: HUMAN SUPPORT HANDOFF
    # =========================================================================
    if path == ResponsePath.HUMAN_SUPPORT:
        handoff_msg = generate_human_handoff_response(target_lang)
        return {
            "response": handoff_msg,
            "path": ResponsePath.HUMAN_SUPPORT.value,
            "generation_mode": "human_handoff",
            "review_required": True,
            "llm_used": False
        }

    # =========================================================================
    # PATH A: NORMAL CONVERSATION
    # =========================================================================
    if path == ResponsePath.NORMAL_CONVERSATION:
        # Attempt generation via LLM if configured
        llm_result = None
        try:
            llm_result = generate_llm_completion(
                system_prompt=NEXUS_SYSTEM_PROMPT_CONVERSATIONAL,
                user_query=query,
                conversation_history=conversation_history,
                temperature=0.4
            )
        except Exception as err:
            logger.warning(f"Conversational LLM call failed, falling back: {err}")
            llm_result = None

        if llm_result and llm_result.get("text"):
            return {
                "response": llm_result["text"].strip(),
                "path": ResponsePath.NORMAL_CONVERSATION.value,
                "generation_mode": "conversational_llm",
                "review_required": False,
                "llm_used": True,
                "provider": llm_result.get("provider"),
                "model": llm_result.get("model")
            }

        # Context-aware local conversational engine fallback
        conv_response = generate_conversational_response(
            query=query,
            target_lang=target_lang,
            history=conversation_history
        )
        return {
            "response": conv_response,
            "path": ResponsePath.NORMAL_CONVERSATION.value,
            "generation_mode": "conversational_engine",
            "review_required": False,
            "llm_used": False
        }

    # =========================================================================
    # PATH B: BANKING SUPPORT
    # =========================================================================
    sources = rag_context.get("sources", []) if rag_context else []
    faq_context = rag_context.get("context", "") if rag_context else ""

    # Check for high-risk critical security alert (e.g. compromised card)
    is_critical_security = intent_name in ("compromised_card", "terminate_account")

    # If no FAQ sources and no document context was found
    if not sources and not document_context:
        # Instead of failing or transferring to human immediately, ask a helpful clarification question
        clarification = generate_clarification_response(query, target_lang=target_lang)
        return {
            "response": clarification,
            "path": ResponsePath.BANKING_SUPPORT.value,
            "generation_mode": "clarification_prompt",
            "review_required": False,  # Never confuse low confidence with an automatic handoff!
            "llm_used": False
        }

    # When FAQ sources or documents are present, synthesize via LLM
    llm_result = None
    try:
        llm_result = generate_llm_completion(
            system_prompt=NEXUS_SYSTEM_PROMPT_BANKING,
            user_query=canonical_query,
            context=faq_context,
            document_context=document_context,
            conversation_history=conversation_history,
            temperature=0.2
        )
    except Exception as err:
        logger.warning(f"Banking LLM call failed, falling back: {err}")
        llm_result = None

    if llm_result and llm_result.get("text"):
        raw_response = llm_result["text"].strip()
        # Translate / adapt if target language is Hindi or Hinglish
        adapted_response = translate_response(
            raw_response,
            target_lang,
            intent=intent_name,
            canonical_query=canonical_query
        )
        return {
            "response": adapted_response,
            "path": ResponsePath.BANKING_SUPPORT.value,
            "generation_mode": "llm_rag",
            "review_required": is_critical_security,
            "llm_used": True,
            "provider": llm_result.get("provider"),
            "model": llm_result.get("model")
        }

    # Fallback when LLM is unavailable: synthesize from top verified FAQ and document
    best_source = sources[0] if sources else {}
    best_answer = best_source.get("answer", "").strip()

    if document_context:
        doc_lines = [l.strip() for l in document_context.splitlines() if l.strip() and not l.startswith("===")]
        top_snippet = "\n".join(f"• {line}" for line in doc_lines[:4]) if doc_lines else "Document analyzed."
        if best_answer:
            base_response = (
                f"I have reviewed your attached document:\n\n{top_snippet}\n\n"
                f"**Related Banking Guidance:**\n{best_answer}"
            )
        else:
            base_response = (
                f"I have reviewed your attached document:\n\n{top_snippet}\n\n"
                f"Based on this statement, your request has been recorded. Let me know if you would like me to explain any specific figures, fees, or policy details."
            )
    else:
        base_response = best_answer

    final_response = translate_response(
        base_response,
        target_lang,
        intent=intent_name,
        canonical_query=canonical_query
    )

    return {
        "response": final_response,
        "path": ResponsePath.BANKING_SUPPORT.value,
        "generation_mode": "retrieval_fallback",
        "review_required": is_critical_security,
        "llm_used": False
    }
