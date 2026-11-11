"""
Response Service for Nexus AI Support.

Integrates the Intelligent Message Orchestrator, multi-provider LLM Client,
and verified RAG retrieval into a cohesive generation pipeline.
"""

from typing import Optional, Dict, Any, List
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
except ImportError:
    pass

from src.llm.orchestrator import orchestrate_chat_response


def generate_response(
    query: str,
    rag_context: Optional[Dict[str, Any]] = None,
    document_context: Optional[str] = None,
    conversation_history: Optional[List[Dict[str, Any]]] = None,
    target_lang: str = "en",
    intent_data: Optional[Dict[str, Any]] = None,
    canonical_query: Optional[str] = None
) -> Dict[str, Any]:
    """
    Generate a customer support response using intelligent message routing:
    - Path A: Normal Conversation
    - Path B: Banking Support (RAG + LLM)
    - Path C: Human Support Escalation
    """
    clean_rag = rag_context or {}
    clean_canonical = canonical_query or query

    return orchestrate_chat_response(
        query=query,
        canonical_query=clean_canonical,
        target_lang=target_lang,
        rag_context=clean_rag,
        document_context=document_context,
        conversation_history=conversation_history,
        intent_data=intent_data
    )
