import pytest

from src.rag.service import (
    get_retriever,
    retrieve_faq,
    build_context,
)


def test_production_index_loads():
    retriever = get_retriever()
    assert len(retriever.documents) == 13683
    assert retriever.embeddings.shape[1] == 384


@pytest.mark.parametrize("query", [
    "How can I get my money back?",
    "I want to cancel my order",
    "My payment is not working",
])


def test_retrieval_returns_results(query):
    result = retrieve_faq(query, top_k=3)

    assert result["total_results"] == 3
    assert len(result["results"]) == 3
    assert all(item["intent"] for item in result["results"])
    assert all(item["answer"] for item in result["results"])


def test_retrieval_result_schema():
    result = retrieve_faq("Where is my refund?", top_k=1)
    item = result["results"][0]

    required = {
        "intent", "category", "question",
        "answer", "similarity_score", "source", "doc_id"
    }

    assert required.issubset(item.keys())


def test_retrieval_scores_descending():
    result = retrieve_faq("My card is not working", top_k=3)
    scores = [x["similarity_score"] for x in result["results"]]

    assert scores == sorted(scores, reverse=True)


def test_context_generation():
    result = build_context("How do I get a refund?", top_k=3)

    assert result["context"].strip()
    assert len(result["sources"]) == 3
    assert isinstance(result["requires_human_review"], bool)


def test_context_contains_source_information():
    result = build_context("Cancel my order", top_k=2)

    assert "Intent:" in result["context"]
    assert "Question:" in result["context"]
    assert "Support response:" in result["context"]


def test_empty_query_rejected():
    with pytest.raises(ValueError):
        retrieve_faq("", top_k=3)


def test_none_query_rejected():
    with pytest.raises(TypeError):
        retrieve_faq(None, top_k=3)


@pytest.mark.parametrize("top_k", [0, 11])
def test_invalid_top_k_rejected(top_k):
    with pytest.raises(ValueError):
        retrieve_faq("refund", top_k=top_k)


def test_boolean_top_k_rejected():
    with pytest.raises(TypeError):
        retrieve_faq("refund", top_k=True)


def test_non_integer_top_k_rejected():
    with pytest.raises(TypeError):
        retrieve_faq("refund", top_k=2.5)
