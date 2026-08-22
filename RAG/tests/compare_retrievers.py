"""
Controlled A/B of the retrieval pipeline over the 150-question eval set.

The dense leg is a lexical stand-in (see test_retrieval_pipeline.py), so the
ABSOLUTE numbers here are not the production hit rate. What is valid is the
COMPARISON: corpus, dense scorer, BM25 and questions are identical between arms,
and only `retriever.py` differs, so the delta isolates the change.

Arm A: `git show HEAD:RAG/src/retriever.py` - the code as it stood before this
       change (subsection-blind card lift, storage-ordered, no routing, no caps).
Arm B: the current `src/retriever.py`.

Usage:
    python3 RAG/tests/compare_retrievers.py [--k 5] [--verbose]
"""

import argparse
import importlib.util
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from test_retrieval_pipeline import (  # noqa: E402
    DATASET,
    RAG_ROOT,
    build_store,
)

LEGACY_PATH = Path("/tmp/legacy_retriever.py")


def load_legacy(path: Path):
    """Load the pre-change retriever under its own module name."""

    spec = importlib.util.spec_from_file_location("legacy_retriever", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules["legacy_retriever"] = module
    spec.loader.exec_module(module)
    return module.RAGRetriever


def parse_anchor(anchor: str) -> tuple[str, str | None]:
    """
    'S2-9' -> ('2', '9'); 'S2-9-3' -> ('2', '9') because the corpus has no
    clause nodes; 'S39' -> ('39', None).
    """

    body = anchor[1:] if anchor.startswith("S") else anchor
    parts = body.split("-")

    section = parts[0]
    subsection = parts[1] if len(parts) > 1 else None

    return section, subsection


_REF = re.compile(r"'([^']+)'")


class StatuteIndex:
    """
    One-hop expansion of `derived_from`, matching what the backend already does
    in `statuteIndex.ts`.

    `derived_from` mixes statute ids ('CPA2019-CH1-S2-9') with other cards'
    concept ids ('definition.defect'). 726 cards - including all 621 `example`
    cards - reach the statute only through another card. A scorer that reads
    `derived_from` literally therefore cannot see that `right.right_to_refund`
    is about s.2(9), and marks a correct retrieval as a miss. That would score
    this change against a metric biased against the very cards it promotes.
    """

    def __init__(self, collection):
        self.direct: dict[str, set[str]] = {}
        self.concept_refs: dict[str, set[str]] = {}

        for meta in collection.metadatas:
            if meta.get("source") != "v2":
                continue

            concept_id = meta.get("concept_id")
            if not concept_id:
                continue

            statute: set[str] = set()
            concepts: set[str] = set()

            for ref in _REF.findall(meta.get("derived_from") or ""):
                if ref.startswith("CPA2019"):
                    statute.add(ref)
                else:
                    concepts.add(ref)

            self.direct[concept_id] = statute
            self.concept_refs[concept_id] = concepts

        self._cache: dict[str, set[str]] = {}

    def statute_for(self, concept_id: str) -> set[str]:
        if concept_id in self._cache:
            return self._cache[concept_id]

        reachable = set(self.direct.get(concept_id, ()))

        for ref in self.concept_refs.get(concept_id, ()):
            reachable |= self.direct.get(ref, set())

        self._cache[concept_id] = reachable
        return reachable


def satisfies(doc, section: str, subsection: str | None, index=None) -> bool:
    meta = doc.metadata

    if meta.get("source") == "v1":
        if str(meta.get("section_number")) != section:
            return False
        if subsection is None:
            return True
        return meta.get("subsection_number") == f"({subsection})"

    if index is not None:
        concept_id = meta.get("concept_id")
        if not concept_id:
            return False

        for ref in index.statute_for(concept_id):
            if subsection is not None:
                if ref.endswith(f"-S{section}-{subsection}"):
                    return True
            elif re.search(rf"-S{section}(?:-|$)", ref):
                return True

        return False

    refs = meta.get("derived_from") or ""

    if subsection is not None:
        return f"-S{section}-{subsection}'" in refs

    return f"-S{section}-" in refs or f"-S{section}'" in refs


def evaluate(retriever_cls, store, questions, k, verbose=False, index=None):
    retriever = retriever_cls(store, k=k)

    hits = 0
    misses = []
    example_slots = 0
    scaffold_slots = 0
    statute_slots = 0
    total_slots = 0

    for row in questions:
        section, subsection = parse_anchor(row["anchor"])

        documents = retriever.retrieve(row["question"])

        total_slots += len(documents)
        for doc in documents:
            kind = doc.metadata.get("concept_type")
            if doc.metadata.get("source") == "v1":
                statute_slots += 1
            elif kind == "example":
                example_slots += 1
            elif kind in ("alias", "intent", "relationship"):
                scaffold_slots += 1

        if any(satisfies(doc, section, subsection, index) for doc in documents):
            hits += 1
        else:
            misses.append(row["id"])

    return {
        "hits": hits,
        "total": len(questions),
        "misses": misses,
        "example_share": example_slots / max(total_slots, 1),
        "scaffold_share": scaffold_slots / max(total_slots, 1),
        "statute_share": statute_slots / max(total_slots, 1),
        "slots": total_slots,
    }


def routing_audit(questions):
    from src.concept_routing import route_query

    fired = 0
    route_counts = []
    concept_counts = []
    noisy = []

    for row in questions:
        routed = route_query(row["question"])
        if routed:
            fired += 1
        route_counts.append(len(routed.routes))
        concept_counts.append(len(routed.concepts))
        if len(routed.routes) >= 5:
            noisy.append((row["id"], routed.routes))

    return {
        "fired": fired,
        "total": len(questions),
        "mean_routes": sum(route_counts) / max(len(route_counts), 1),
        "max_routes": max(route_counts, default=0),
        "mean_concepts": sum(concept_counts) / max(len(concept_counts), 1),
        "noisy": noisy,
    }


def precision_probe():
    """
    Text that must NOT route. Loose patterns are the main risk of a lexicon:
    a route that fires on everything injects the same cards into every answer.
    """

    from src.concept_routing import route_query

    negatives = [
        "hello",
        "thanks for your help",
        "what is the weather in Chennai tomorrow",
        "who is the prime minister of India",
        "can you write me a poem about the monsoon",
        "my laptop battery drains fast, any tips to make it last longer",
        "I want to continue our earlier conversation",
        "please make a summary of this in simple English",
        "how do I renew my passport",
        "the train was late by two hours",
    ]

    fired = [
        (text, route_query(text).routes)
        for text in negatives
        if route_query(text)
    ]

    return negatives, fired


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--k", type=int, default=5)
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    questions = json.loads(
        (RAG_ROOT / "eval" / "qa-full.json").read_text(encoding="utf-8")
    )

    if not DATASET.exists():
        print(f"dataset not found at {DATASET}", file=sys.stderr)
        return 2

    print(f"corpus: {DATASET}")
    store = build_store()
    print(f"documents: {len(store._collection.ids)}  questions: {len(questions)}")
    print(f"k = {args.k}\n")

    print("=== concept routing audit ===")
    audit = routing_audit(questions)
    print(
        f"routes fire on {audit['fired']}/{audit['total']} questions; "
        f"mean {audit['mean_routes']:.2f} routes, "
        f"{audit['mean_concepts']:.2f} concepts; max {audit['max_routes']} routes"
    )
    if audit["noisy"]:
        print("  questions matching 5+ routes (check for loose patterns):")
        for qid, routes in audit["noisy"]:
            print(f"    {qid}: {routes}")

    print("\n=== precision probe (must not route) ===")
    negatives, fired = precision_probe()
    if fired:
        for text, routes in fired:
            print(f"  ROUTED  {text!r} -> {routes}")
    print(f"  {len(negatives) - len(fired)}/{len(negatives)} correctly inert")

    results = {}

    index = StatuteIndex(store._collection)
    print(
        f"\none-hop statute index: {len(index.direct)} cards, "
        f"{sum(1 for c in index.direct if not index.direct[c] and index.statute_for(c))}"
        " reachable only via another card"
    )

    if LEGACY_PATH.exists():
        print("\n=== arm A: retriever at git HEAD (before this change) ===")
        results["A"] = evaluate(
            load_legacy(LEGACY_PATH), store, questions, args.k, index=index
        )
    else:
        print(f"\n(no legacy copy at {LEGACY_PATH}; skipping arm A)")

    print("=== arm B: current retriever ===")
    from src.retriever import RAGRetriever

    results["B"] = evaluate(RAGRetriever, store, questions, args.k, index=index)

    print(f"\n{'':<10}{'anchor@k':>10}{'statute':>10}{'example':>10}{'scaffold':>10}")
    for arm, result in results.items():
        rate = result["hits"] / result["total"]
        print(
            f"{arm:<10}"
            f"{result['hits']:>4}/{result['total']:<5}"
            f"{result['statute_share']:>9.1%}"
            f"{result['example_share']:>10.1%}"
            f"{result['scaffold_share']:>10.1%}"
        )

    if "A" in results:
        before = set(results["A"]["misses"])
        after = set(results["B"]["misses"])

        print(f"\nfixed   ({len(before - after):>2}): {sorted(before - after)}")
        print(f"broken  ({len(after - before):>2}): {sorted(after - before)}")
        print(f"still failing ({len(after & before):>2}): {sorted(after & before)}")

        delta = results["B"]["hits"] - results["A"]["hits"]
        print(
            f"\nnet {delta:+d} questions "
            f"({results['A']['hits'] / 150:.1%} -> {results['B']['hits'] / 150:.1%})"
        )

        return 1 if (after - before) else 0

    return 0


if __name__ == "__main__":
    sys.exit(main())
