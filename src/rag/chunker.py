def chunk_documents(documents):
    """
    Keep each customer FAQ question-answer pair as one logical chunk.
    This avoids splitting an answer away from its question.
    """
    chunks = []

    for document in documents:
        chunks.append({
            **document,
            "chunk_id": document["doc_id"],
            "content": (
                f"Customer question: {document['instruction']}\n"
                f"Support answer: {document['response']}"
            )
        })

    return chunks
