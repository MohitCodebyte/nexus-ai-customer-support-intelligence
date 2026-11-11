from pathlib import Path
import json
import time

import joblib
import pandas as pd

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.svm import LinearSVC
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    precision_score,
    recall_score,
    classification_report,
    confusion_matrix,
)
from sklearn.pipeline import Pipeline


ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data" / "tickets"
OUTPUT_DIR = ROOT / "models" / "intent_classification"
REPORT_DIR = ROOT / "reports" / "intent_classification"

TRAIN_FILE = DATA_DIR / "banking77_train.csv"
TEST_FILE = DATA_DIR / "banking77_test.csv"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
REPORT_DIR.mkdir(parents=True, exist_ok=True)


def load_data(path):
    if not path.exists():
        raise FileNotFoundError(f"Dataset not found: {path}")

    df = pd.read_csv(path)

    required = {"text", "label"}
    if not required.issubset(df.columns):
        raise ValueError(
            f"{path.name}: expected columns {required}; "
            f"found {df.columns.tolist()}"
        )

    df = df.dropna(subset=["text", "label"]).copy()
    df["text"] = df["text"].astype(str).str.strip()
    df = df[df["text"] != ""]
    df["label"] = df["label"].astype(str)

    return df


def main():
    train_df = load_data(TRAIN_FILE)
    test_df = load_data(TEST_FILE)

    train_labels = set(train_df["label"].unique())
    test_labels = set(test_df["label"].unique())

    if not test_labels.issubset(train_labels):
        raise ValueError("Test set contains labels absent from training set.")

    print("BANKING77 DATA AUDIT")
    print("-" * 50)
    print("Training rows:", len(train_df))
    print("Testing rows:", len(test_df))
    print("Training intents:", train_df["label"].nunique())
    print("Testing intents:", test_df["label"].nunique())
    print("Train columns:", train_df.columns.tolist())
    print()

    vectorizer = TfidfVectorizer(
        lowercase=True,
        strip_accents="unicode",
        ngram_range=(1, 2),
        min_df=2,
        max_features=50000,
        sublinear_tf=True,
        dtype="float32",
    )

    X_train = vectorizer.fit_transform(train_df["text"])
    X_test = vectorizer.transform(test_df["text"])

    y_train = train_df["label"]
    y_test = test_df["label"]

    print("TF-IDF vocabulary size:", len(vectorizer.vocabulary_))
    print("Training feature matrix:", X_train.shape)
    print()

    models = {
        "logistic_regression": LogisticRegression(
            max_iter=1500,
            C=4.0,
            solver="lbfgs",
            random_state=42,
        ),
        "linear_svm": LinearSVC(
            C=1.0,
            random_state=42,
        ),
        "random_forest": RandomForestClassifier(
            n_estimators=100,
            max_depth=40,
            min_samples_leaf=2,
            max_features="sqrt",
            class_weight="balanced_subsample",
            n_jobs=-1,
            random_state=42,
        ),
    }

    results = []

    for name, model in models.items():
        print("=" * 60)
        print("Training:", name)

        start = time.perf_counter()
        model.fit(X_train, y_train)
        training_seconds = time.perf_counter() - start

        predictions = model.predict(X_test)

        metrics = {
            "model": name,
            "accuracy": float(accuracy_score(y_test, predictions)),
            "macro_precision": float(
                precision_score(y_test, predictions, average="macro", zero_division=0)
            ),
            "macro_recall": float(
                recall_score(y_test, predictions, average="macro", zero_division=0)
            ),
            "macro_f1": float(
                f1_score(y_test, predictions, average="macro", zero_division=0)
            ),
            "weighted_f1": float(
                f1_score(y_test, predictions, average="weighted", zero_division=0)
            ),
            "training_seconds": round(training_seconds, 2),
        }

        results.append(metrics)

        print(json.dumps(metrics, indent=2))

        report = classification_report(
            y_test,
            predictions,
            output_dict=True,
            zero_division=0,
        )

        pd.DataFrame(report).transpose().to_csv(
            REPORT_DIR / f"{name}_classification_report.csv"
        )

        labels = sorted(set(y_train) | set(y_test))
        cm = confusion_matrix(y_test, predictions, labels=labels)

        pd.DataFrame(
            cm,
            index=labels,
            columns=labels,
        ).to_csv(REPORT_DIR / f"{name}_confusion_matrix.csv")

        joblib.dump(
            {
                "vectorizer": vectorizer,
                "model": model,
                "model_name": name,
                "labels": labels,
            },
            OUTPUT_DIR / f"{name}.joblib",
            compress=3,
        )

        print("Saved model:", OUTPUT_DIR / f"{name}.joblib")

    results_df = pd.DataFrame(results).sort_values(
        "macro_f1", ascending=False
    )

    results_df.to_csv(REPORT_DIR / "model_comparison.csv", index=False)

    print()
    print("=" * 60)
    print("FINAL MODEL COMPARISON")
    print(results_df.to_string(index=False))
    print()
    print("Best model by macro-F1:", results_df.iloc[0]["model"])
    print("Models directory:", OUTPUT_DIR)
    print("Reports directory:", REPORT_DIR)
    print()
    print("IMPORTANT: This is an intent classifier, not a complete chatbot.")


if __name__ == "__main__":
    main()
