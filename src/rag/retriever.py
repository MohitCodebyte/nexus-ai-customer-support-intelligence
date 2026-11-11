import json
from pathlib import Path

import numpy as np

from .embeddings import encode_texts


class SemanticRetriever:

    def __init__(self, documents, embeddings):
        embeddings = np.asarray(embeddings, dtype=np.float32)

        if len(documents) != len(embeddings):
            raise ValueError("Documents and embeddings count mismatch.")

        if len(embeddings) == 0:
            raise ValueError("Cannot create an empty retrieval index.")

        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        self.embeddings = embeddings / np.maximum(norms, 1e-12)
        self.documents = documents

    @classmethod
    def from_documents(cls, documents, batch_size=32):
        texts = [
            document["retrieval_text"]
            for document in documents
        ]

        vectors = encode_texts(texts, batch_size=batch_size)
        return cls(documents, vectors)

    def search(self, query, top_k=5, min_score=None):
        if not isinstance(query, str) or not query.strip():
            raise ValueError("Query must be a non-empty string.")

        if not isinstance(top_k, int) or not 1 <= top_k <= 20:
            raise ValueError("top_k must be between 1 and 20.")

        query_vector = encode_texts([query])
        scores = (self.embeddings @ query_vector[0]).flatten()

        indices = np.argsort(scores)[::-1][:top_k]

        results = []

        for index in indices:
            score = float(scores[index])

            if min_score is not None and score < min_score:
                continue

            results.append({
                **self.documents[index],
                "similarity_score": score
            })

        return results

    def save(self, directory):
        directory = Path(directory)
        directory.mkdir(parents=True, exist_ok=True)

        np.savez_compressed(
            directory / "embeddings.npz",
            embeddings=self.embeddings
        )

        with (directory / "documents.json").open(
            "w", encoding="utf-8"
        ) as file:
            json.dump(
                self.documents,
                file,
                ensure_ascii=False,
                indent=2
            )

    @classmethod
    def load(cls, directory):
        directory = Path(directory)

        with np.load(directory / "embeddings.npz") as data:
            embeddings = data["embeddings"].copy()

        with (directory / "documents.json").open(
            "r", encoding="utf-8"
        ) as file:
            documents = json.load(file)

        return cls(documents, embeddings)
