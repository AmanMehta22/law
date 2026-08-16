import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.vectorStore import VectorStoreManager
from src.retriever import RAGRetriever

EVAL_SET = Path(__file__).parent / "consumer-eval-set.jsonl"
K = 5

CONFIGS = [
    {"DENSE_CANDIDATES": 20, "DENSE_RANK_CONST": 60, "BM25_RANK_CONST": 60},
    {"DENSE_CANDIDATES": 30, "DENSE_RANK_CONST": 60, "BM25_RANK_CONST": 60},
    {"DENSE_CANDIDATES": 30, "DENSE_RANK_CONST": 40, "BM25_RANK_CONST": 60},
    {"DENSE_CANDIDATES": 30, "DENSE_RANK_CONST": 50, "BM25_RANK_CONST": 70},
]


def load_eval_set():
    entries = []
    with EVAL_SET.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                entries.append(json.loads(line))
    return entries


def main():
    entries = load_eval_set()
    manager = VectorStoreManager()
    vector_store = manager.load()

    for cfg in CONFIGS:
        RAGRetriever.DENSE_CANDIDATES = cfg["DENSE_CANDIDATES"]
        RAGRetriever.DENSE_RANK_CONST = cfg["DENSE_RANK_CONST"]
        RAGRetriever.BM25_RANK_CONST = cfg["BM25_RANK_CONST"]
        retriever = RAGRetriever(vector_store=vector_store, k=K)

        strict = 0
        content = 0
        for entry in entries:
            expected = set(entry["expected"])
            alternatives = set(entry.get("alternatives", []))
            docs = retriever.retrieve(entry["question"], k=K)
            retrieved = set(
                d.metadata.get("concept_id")
                for d in docs
                if d.metadata.get("concept_id")
            )
            if expected & retrieved:
                strict += 1
            if expected & retrieved or alternatives & retrieved:
                content += 1

        n = len(entries)
        print(
            f"DENSE={cfg['DENSE_CANDIDATES']:>2} "
            f"dconst={cfg['DENSE_RANK_CONST']:>2} "
            f"bconst={cfg['BM25_RANK_CONST']:>2} "
            f"| strict {strict}/{n} ({strict / n:.1%}) "
            f"| content {content}/{n} ({content / n:.1%})"
        )


if __name__ == "__main__":
    main()