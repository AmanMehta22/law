import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.vectorStore import VectorStoreManager
from src.retriever import RAGRetriever

EVAL_SET = Path(__file__).parent / "consumer-eval-set.jsonl"
REPORT = Path(__file__).parent / "eval-report.json"
K = 5


def load_eval_set():
    entries = []
    with EVAL_SET.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                entries.append(json.loads(line))
    return entries


def retrieve_ids(retriever, query, k=K):
    docs = retriever.retrieve(query, k=k)
    ids = []
    for doc in docs:
        concept_id = doc.metadata.get("concept_id")
        if concept_id:
            ids.append(concept_id)
        else:
            v1_id = doc.metadata.get("v1_id") or doc.metadata.get("title") or "?"
            ids.append(f"v1:{v1_id}")
    return ids


def main():
    entries = load_eval_set()
    manager = VectorStoreManager()
    vector_store = manager.load()
    retriever = RAGRetriever(vector_store=vector_store, k=K)

    per_entry = []
    category_strict = {}
    category_content = {}
    category_total = {}

    for entry in entries:
        expected = set(entry["expected"])
        alternatives = set(entry.get("alternatives", []))
        retrieved = retrieve_ids(retriever, entry["question"])
        retrieved_set = set(retrieved)

        strict_hit = bool(expected & retrieved_set)
        content_hit = strict_hit or bool(alternatives & retrieved_set)

        cat = entry["category"]
        category_strict[cat] = category_strict.get(cat, 0) + int(strict_hit)
        category_content[cat] = category_content.get(cat, 0) + int(content_hit)
        category_total[cat] = category_total.get(cat, 0) + 1

        per_entry.append(
            {
                "id": entry["id"],
                "category": cat,
                "question": entry["question"],
                "expected": sorted(expected),
                "alternatives": sorted(alternatives),
                "retrieved_top5": retrieved,
                "strict_hit": strict_hit,
                "content_hit": content_hit,
                "recall": len(expected & retrieved_set) / len(expected),
            }
        )

    total = len(entries)
    strict_hits = sum(1 for e in per_entry if e["strict_hit"])
    content_hits = sum(1 for e in per_entry if e["content_hit"])

    categories = {}
    for cat in sorted(category_total):
        categories[cat] = {
            "questions": category_total[cat],
            "strict_hits": category_strict[cat],
            "strict_recall_at_5": round(category_strict[cat] / category_total[cat], 3),
            "content_hits": category_content[cat],
            "content_recall_at_5": round(category_content[cat] / category_total[cat], 3),
        }

    failures = [e for e in per_entry if not e["content_hit"]]
    strict_only_failures = [
        e for e in per_entry if e["strict_hit"] and not e["content_hit"]
    ]

    report = {
        "k": K,
        "questions": total,
        "strict_hits": strict_hits,
        "strict_recall_at_5": round(strict_hits / total, 3),
        "content_hits": content_hits,
        "content_recall_at_5": round(content_hits / total, 3),
        "categories": categories,
        "failures": failures,
        "strict_only_failures": strict_only_failures,
    }

    REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"Eval set: {total} questions (k={K})")
    print(f"Strict recall@5  (expected card in top-5): {strict_hits}/{total} = {strict_hits / total:.1%}")
    print(f"Content recall@5 (expected or verified twin): {content_hits}/{total} = {content_hits / total:.1%}")
    print()
    print(f"{'category':<16}{'q':>4}{'strict':>8}{'content':>9}")
    for cat, stats in categories.items():
        print(
            f"{cat:<16}{stats['questions']:>4}"
            f"{stats['strict_recall_at_5']:>8.1%}"
            f"{stats['content_recall_at_5']:>9.1%}"
        )
    print()
    print(f"Content failures ({len(failures)}):")
    for e in failures:
        print(f"  {e['id']} [{e['category']}] {e['question'][:70]}")
        print(f"      expected: {e['expected']}  alt: {e['alternatives']}")
        print(f"      top5:     {e['retrieved_top5']}")
    print(f"\nReport written to {REPORT}")


if __name__ == "__main__":
    main()