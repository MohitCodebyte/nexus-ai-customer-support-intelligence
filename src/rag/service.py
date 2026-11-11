from pathlib import Path
from functools import lru_cache
import json

import numpy as np

from .retriever import SemanticRetriever
from .embeddings import encode_texts


PROJECT_ROOT = Path(__file__).resolve().parents[2]

INDEX_DIR = (
    PROJECT_ROOT
    / "models"
    / "embeddings"
    / "bitext_faq"
)

GATE_CONFIG_PATH = (
    PROJECT_ROOT
    / "reports"
    / "rag"
    / "intent_retrieval_gate.json"
)


@lru_cache(maxsize=1)
def get_retriever():
    if not INDEX_DIR.exists():
        raise FileNotFoundError(
            f"RAG index not found: {INDEX_DIR}"
        )

    return SemanticRetriever.load(INDEX_DIR)


@lru_cache(maxsize=1)
def get_gate_config():
    if not GATE_CONFIG_PATH.exists():
        return {
            "score_threshold": 0.60,
            "margin_threshold": 0.02,
            "calibration_status": "provisional"
        }

    with GATE_CONFIG_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def get_intent_groups():
    retriever = get_retriever()
    groups = {}

    for index, document in enumerate(retriever.documents):
        groups.setdefault(document["intent"], []).append(index)

    return {
        intent: np.asarray(indices, dtype=np.int32)
        for intent, indices in groups.items()
    }


def retrieve_faq(
    query: str,
    top_k: int = 3,
    score_threshold: float = None,
    margin_threshold: float = None
):
    """Retrieve relevant FAQs and evaluate distinct-intent confidence."""

    if not isinstance(query, str):
        raise TypeError("Query must be a string.")

    query = query.strip()

    if not query:
        raise ValueError("Query cannot be empty.")

    if not isinstance(top_k, int) or isinstance(top_k, bool):
        raise TypeError("top_k must be an integer.")

    if not 1 <= top_k <= 10:
        raise ValueError("top_k must be between 1 and 10.")

    retriever = get_retriever()
    config = get_gate_config()

    score_threshold = (
        config["score_threshold"]
        if score_threshold is None else score_threshold
    )

    margin_threshold = (
        config["margin_threshold"]
        if margin_threshold is None else margin_threshold
    )

    # Retrieve FAQ documents
    results = retriever.search(query, top_k=top_k)

    # Compute similarity scores across all indexed FAQs
    query_vector = encode_texts([query])[0]
    document_scores = retriever.embeddings @ query_vector

    # Aggregate the maximum score for every distinct intent
    intent_groups = get_intent_groups()

    intent_rankings = []

    for intent, indices in intent_groups.items():
        intent_score = float(document_scores[indices].max())

        intent_rankings.append({
            "intent": intent,
            "similarity_score": intent_score
        })

    intent_rankings.sort(
        key=lambda item: item["similarity_score"],
        reverse=True
    )

    best_intent = intent_rankings[0]
    second_intent = intent_rankings[1]

    margin = (
        best_intent["similarity_score"]
        - second_intent["similarity_score"]
    )

    score_passed = (
        best_intent["similarity_score"] >= score_threshold
    )

    margin_passed = margin >= margin_threshold

    auto_answer_allowed = score_passed and margin_passed

    review_reasons = []

    if not score_passed:
        review_reasons.append("low_similarity")

    if not margin_passed:
        review_reasons.append("ambiguous_intent")

    return {
        "query": query,
        "total_results": len(results),
        "results": [
            {
                "intent": item["intent"],
                "category": item["category"],
                "question": item["instruction"],
                "answer": item["response"],
                "similarity_score": float(item["similarity_score"]),
                "source": item["source"],
                "doc_id": item["doc_id"]
            }
            for item in results
        ],
        "top_intent": best_intent["intent"],
        "top_intents": intent_rankings[:3],
        "intent_margin": float(margin),
        "score_threshold": float(score_threshold),
        "margin_threshold": float(margin_threshold),
        "auto_answer_allowed": bool(auto_answer_allowed),
        "requires_human_review": not auto_answer_allowed,
        "review_reasons": review_reasons,
        "score_type": "cosine_similarity_not_probability",
        "calibration_status": config.get(
            "calibration_status",
            "provisional"
        )
    }


def build_context(query: str, top_k: int = 3):
    """Build source-grounded context for future LLM generation."""

    retrieval = retrieve_faq(query, top_k=top_k)

    context_parts = []

    for index, item in enumerate(retrieval["results"], 1):
        context_parts.append(
            f"Source {index}\n"
            f"Intent: {item['intent']}\n"
            f"Question: {item['question']}\n"
            f"Support response: {item['answer']}"
        )

    return {
        "query": query,
        "context": "\n\n".join(context_parts),
        "sources": retrieval["results"],
        "top_intent": retrieval["top_intent"],
        "auto_answer_allowed": retrieval["auto_answer_allowed"],
        "requires_human_review": retrieval["requires_human_review"],
        "review_reasons": retrieval["review_reasons"],
        "intent_margin": retrieval["intent_margin"]
    }
