import re
import json
from pathlib import Path
import pandas as pd

PLACEHOLDER_PATTERN = re.compile(
    r"\{\{.*?\}\}"
    r"|\{[A-Za-z][^{}]*\}"
    r"|<[^<>]+>"
    r"|\[[^\[\]]{1,80}\]"
    r"|\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b"
    r"|\bX{3,}\b"
)

def has_unresolved_placeholder(text):
    return bool(PLACEHOLDER_PATTERN.search(str(text)))


def load_bitext_documents(csv_path, report_path=None):
    df = pd.read_csv(
        csv_path,
        dtype=str,
        keep_default_na=False
    )

    required = {"instruction", "response", "intent", "category"}
    missing = required - set(df.columns)

    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    documents = []
    skipped_empty = 0
    skipped_placeholder = 0
    seen = set()

    for row_number, row in df.iterrows():
        question = row["instruction"].strip()
        answer = row["response"].strip()
        intent = row["intent"].strip()
        category = row["category"].strip()

        if not question or not answer or not intent:
            skipped_empty += 1
            continue

        if (
            has_unresolved_placeholder(question)
            or has_unresolved_placeholder(answer)
        ):
            skipped_placeholder += 1
            continue

        key = (question.lower(), intent.lower())
        if key in seen:
            continue
        seen.add(key)

        documents.append({
            "doc_id": f"bitext_{row_number}",
            "instruction": question,
            "retrieval_text": question,
            "response": answer,
            "intent": intent,
            "category": category,
            "source": "bitext_customer_support"
        })

    report = {
        "source": str(csv_path),
        "source_rows": int(len(df)),
        "eligible_documents": len(documents),
        "skipped_empty": skipped_empty,
        "skipped_placeholder": skipped_placeholder,
        "unique_question_intent_pairs": len(documents),
        "placeholder_filter": "conservative regex heuristic"
    }

    if report_path:
        report_path = Path(report_path)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(
            json.dumps(report, indent=4),
            encoding="utf-8"
        )

    return documents, report
