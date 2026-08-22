"""
Offline tests for the retrieval pipeline.

WHY THIS EXISTS
---------------
The retriever is the component where a wrong answer is cheapest to cause and
hardest to notice: it fails silently, by returning plausible-looking cards about
the wrong provision. Four defects in it were found only by reading it line by
line, and all four were invisible from the API surface. This file pins them down.

WHAT IS REAL AND WHAT IS NOT
----------------------------
Real: the dataset (`v1-statute.jsonl`, `v2-knowledge-cards.jsonl`), the document
and metadata construction (imported from `src.documentBuilder`, so page content
and metadata keys are exactly what production indexes), the Chroma `where`
semantics that the retriever depends on, BM25, concept routing, and the whole of
`retriever.py`.

Not real: the dense leg. Sentence-transformers embeddings cannot be computed
here, so `FakeVectorStore` scores by weighted token overlap. That is a stand-in,
and it means this file CANNOT measure recall - only behaviour that does not
depend on embedding quality: filter correctness, ordering rules, caps, routing
reachability, and failure containment. Recall must be measured with
`RAG/eval/run_eval.py` against the real index.

Run:
    python3 RAG/tests/test_retrieval_pipeline.py
No pytest, no network, no chromadb, no torch required.
"""

import json
import math
import os
import re
import sys
import types
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

REPO_ROOT = Path(__file__).resolve().parents[2]
RAG_ROOT = REPO_ROOT / "RAG"
DATASET = (
    REPO_ROOT
    / "legal-dataset"
    / "acts"
    / "consumer-protection-act-2019"
    / "final"
)

sys.path.insert(0, str(RAG_ROOT))


# ---------------------------------------------------------------------------
# Stubs for libraries that are not installable in this environment.
# Kept minimal and honest: BM25Okapi is a real Okapi BM25, not a placeholder,
# because the ranking it produces is part of what we are testing.
# ---------------------------------------------------------------------------


def _install_stubs() -> None:
    try:
        import langchain_core.documents  # noqa: F401
    except ImportError:
        core = types.ModuleType("langchain_core")
        documents = types.ModuleType("langchain_core.documents")

        @dataclass
        class Document:
            page_content: str = ""
            metadata: dict = field(default_factory=dict)

        documents.Document = Document
        core.documents = documents
        sys.modules["langchain_core"] = core
        sys.modules["langchain_core.documents"] = documents

    try:
        import rank_bm25  # noqa: F401
    except ImportError:
        module = types.ModuleType("rank_bm25")

        class BM25Okapi:
            def __init__(self, corpus, k1=1.5, b=0.75):
                self.k1 = k1
                self.b = b
                self.corpus_size = len(corpus)
                self.doc_len = [len(doc) for doc in corpus]
                self.avgdl = (
                    sum(self.doc_len) / self.corpus_size
                    if self.corpus_size
                    else 0.0
                )
                self.doc_freqs = [Counter(doc) for doc in corpus]

                df: Counter = Counter()
                for doc in corpus:
                    df.update(set(doc))

                self.idf = {
                    term: math.log(
                        1
                        + (self.corpus_size - freq + 0.5) / (freq + 0.5)
                    )
                    for term, freq in df.items()
                }

            def get_scores(self, query):
                import numpy as np

                scores = np.zeros(self.corpus_size)

                for term in query:
                    idf = self.idf.get(term)
                    if idf is None:
                        continue

                    for index, freqs in enumerate(self.doc_freqs):
                        tf = freqs.get(term, 0)
                        if not tf:
                            continue

                        denominator = tf + self.k1 * (
                            1
                            - self.b
                            + self.b * self.doc_len[index] / (self.avgdl or 1)
                        )
                        scores[index] += idf * tf * (self.k1 + 1) / denominator

                return scores

        module.BM25Okapi = BM25Okapi
        sys.modules["rank_bm25"] = module


_install_stubs()

from src.documentBuilder import DocumentBuilder, StatuteDocumentBuilder  # noqa: E402
from src.concept_routing import route_query  # noqa: E402
from src.retriever import RAGRetriever  # noqa: E402


# ---------------------------------------------------------------------------
# A Chroma-shaped collection, implementing only the operators the retriever
# uses. Mirrors two real behaviours that matter:
#   * metadata values of None are dropped (real Chroma rejects them), so a
#     filter on a key that a document lacks simply does not match;
#   * `$contains` on a metadata string is a plain substring test.
# ---------------------------------------------------------------------------


class FakeCollection:
    def __init__(self, documents: Iterable[Any]):
        self.ids: list[str] = []
        self.documents: list[str] = []
        self.metadatas: list[dict] = []

        for index, doc in enumerate(documents):
            meta = {
                key: value
                for key, value in doc.metadata.items()
                if value is not None
            }
            self.ids.append(f"doc-{index}")
            self.documents.append(doc.page_content)
            self.metadatas.append(meta)

        self.contains_supported = True
        self.calls = 0

    def _matches(self, meta: dict, clause: dict) -> bool:
        if "$and" in clause:
            return all(self._matches(meta, part) for part in clause["$and"])

        if "$or" in clause:
            return any(self._matches(meta, part) for part in clause["$or"])

        for key, condition in clause.items():
            if isinstance(condition, dict):
                if "$contains" in condition:
                    if not self.contains_supported:
                        raise ValueError(
                            "Expected where operand to be $eq, got $contains"
                        )
                    value = meta.get(key)
                    if not isinstance(value, str):
                        return False
                    if condition["$contains"] not in value:
                        return False
                elif "$in" in condition:
                    if meta.get(key) not in condition["$in"]:
                        return False
                else:
                    raise AssertionError(f"unsupported operator {condition!r}")
            else:
                if meta.get(key) != condition:
                    return False

        return True

    def get(self, ids=None, where=None, include=None):
        self.calls += 1

        indices = range(len(self.ids))

        if ids is not None:
            position = {doc_id: i for i, doc_id in enumerate(self.ids)}
            indices = [position[i] for i in ids if i in position]

        if where is not None:
            indices = [i for i in indices if self._matches(self.metadatas[i], where)]

        return {
            "ids": [self.ids[i] for i in indices],
            "documents": [self.documents[i] for i in indices],
            "metadatas": [self.metadatas[i] for i in indices],
        }


class FakeVectorStore:
    """
    Stand-in for Chroma's LangChain wrapper. `similarity_search` ranks by
    IDF-weighted token overlap: not embeddings, but it reproduces the property
    that matters for these tests - long verbose cards win on lexical overlap,
    which is exactly how `example.*` cards came to dominate the top-5.
    """

    def __init__(self, collection: FakeCollection):
        self._collection = collection

        from langchain_core.documents import Document

        self._Document = Document

        self._tokens: list[set[str]] = []
        df: Counter = Counter()

        for text in collection.documents:
            tokens = set(re.findall(r"[a-z0-9]+", (text or "").lower()))
            self._tokens.append(tokens)
            df.update(tokens)

        total = max(len(collection.documents), 1)
        self._idf = {
            term: math.log(1 + total / (1 + freq)) for term, freq in df.items()
        }

    def similarity_search(self, query: str, k: int = 5, filter: dict | None = None):
        query_tokens = set(re.findall(r"[a-z0-9]+", query.lower()))

        scored: list[tuple[float, int]] = []

        for index, tokens in enumerate(self._tokens):
            meta = self._collection.metadatas[index]

            if filter:
                if not all(meta.get(key) == value for key, value in filter.items()):
                    continue

            overlap = query_tokens & tokens
            if not overlap:
                continue

            score = sum(self._idf.get(term, 0.0) for term in overlap)
            scored.append((score, index))

        scored.sort(key=lambda item: (-item[0], item[1]))

        return [
            self._Document(
                page_content=self._collection.documents[index],
                metadata=self._collection.metadatas[index],
            )
            for _, index in scored[:k]
        ]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _read_jsonl(path: Path) -> list[dict]:
    rows = []
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


_STORE: FakeVectorStore | None = None


def build_store() -> FakeVectorStore:
    global _STORE

    if _STORE is None:
        cards = _read_jsonl(DATASET / "v2-knowledge-cards.jsonl")
        statute = _read_jsonl(DATASET / "v1-statute.jsonl")

        documents = DocumentBuilder(cards).build_documents()
        documents += StatuteDocumentBuilder(statute).build_documents()

        _STORE = FakeVectorStore(FakeCollection(documents))

    return _STORE


def make_retriever(k: int = 5) -> RAGRetriever:
    return RAGRetriever(build_store(), k=k)


# ---------------------------------------------------------------------------
# Assertions
# ---------------------------------------------------------------------------

FAILURES: list[str] = []
PASSES: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        PASSES.append(name)
        print(f"  PASS  {name}")
    else:
        FAILURES.append(f"{name}: {detail}")
        print(f"  FAIL  {name}  {detail}")


def ids_of(documents) -> list[str]:
    return [
        doc.metadata.get("concept_id") or doc.metadata.get("v1_id") or "?"
        for doc in documents
    ]


def types_of(documents) -> list[str]:
    return [doc.metadata.get("concept_type") or "statute" for doc in documents]


# --- 1. derived_from filter construction -----------------------------------


def test_derived_from_filters() -> None:
    print("\n[1] derived_from filters are quote-anchored and cover bare sections")

    retriever = make_retriever()

    with_sub = retriever._derived_from_filters("2", "4")
    check(
        "subsection filter is closed by a quote",
        with_sub == [{"derived_from": {"$contains": "-S2-4'"}}],
        f"got {with_sub}",
    )

    # The bug this prevents: '-S2-4' as a bare substring also matches
    # CPA2019-CH1-S2-41 ... S2-47.
    sample = "['CPA2019-CH1-S2-41', 'definition.restrictive_trade_practice']"
    check(
        "bare '-S2-4' would have matched 2(41) but the anchored form does not",
        "-S2-4" in sample and "-S2-4'" not in sample,
        "dataset id shape changed - re-derive this assertion",
    )

    without_sub = retriever._derived_from_filters("5", None)
    check(
        "section without a subsection tries both '-S5-' and \"-S5'\"",
        without_sub
        == [
            {"derived_from": {"$contains": "-S5-"}},
            {"derived_from": {"$contains": "-S5'"}},
        ],
        f"got {without_sub}",
    )


# --- 2. the section lift is subsection-aware -------------------------------


def test_section_lift_is_subsection_aware() -> None:
    print("\n[2] a named subsection lifts only that subsection's material")

    retriever = make_retriever()

    lifted = retriever._lift_section_docs(
        [("2", "4")], retriever.SECTION_LIFT_RANK_CONST
    )
    lifted_ids = [
        doc.metadata.get("concept_id") or doc.metadata.get("v1_id")
        for doc, _ in lifted
    ]

    statute_ids = [i for i in lifted_ids if i and i.startswith("CPA2019")]
    check(
        "only the 2(4) statute node is lifted",
        statute_ids and all(i.endswith("-S2-4") for i in statute_ids),
        f"got {statute_ids}",
    )

    derived = retriever._lift_v2_section("2", "4")
    bad = []
    for doc, _ in derived:
        refs = doc.metadata.get("derived_from") or ""
        if "-S2-4'" not in refs:
            bad.append(doc.metadata.get("concept_id"))

    check(
        "no card from 2(41)-2(47) leaks into a 2(4) lift",
        not bad,
        f"leaked {bad[:6]}",
    )


def test_section_lift_reaches_subsectionless_nodes() -> None:
    print("\n[3] sections stored without a subsection segment still lift cards")

    retriever = make_retriever()

    # 51 statute nodes have no subsection segment (CPA2019-CH2-S5,
    # CPA2019-CH4-S40/41/43 ...). The old '-S{n}-' test missed all of them.
    reachable = []
    for section in ("5", "40", "41", "43"):
        derived = retriever._lift_v2_section(section, None)
        if derived:
            reachable.append(section)

    check(
        "cards derived from subsection-less sections are now reachable",
        len(reachable) >= 3,
        f"only reached {reachable}",
    )

    old_style = retriever.vector_store._collection.get(
        where={
            "$and": [
                {"source": "v2"},
                {"derived_from": {"$contains": "-S5-"}},
            ]
        }
    )
    new_style = retriever._lift_v2_section("5", None)
    check(
        "the old filter alone returned nothing for section 5",
        not old_style["ids"] and new_style,
        f"old={len(old_style['ids'])} new={len(new_style)}",
    )


# --- 4. lifted cards are chosen by type, not storage order -----------------


def test_lifted_cards_are_type_ordered() -> None:
    print("\n[4] lifted cards are chosen by concept type, not Chroma row order")

    retriever = make_retriever()

    derived = retriever._lift_v2_section("2", "7")
    kinds = [doc.metadata.get("concept_type") for doc, _ in derived]

    order = retriever.CANONICAL_TYPE_ORDER
    ranks = [
        order.index(kind) if kind in order else len(order) for kind in kinds
    ]

    check(
        "lifted types are in canonical preference order",
        ranks == sorted(ranks),
        f"got {kinds}",
    )
    check(
        "search scaffolding is never lifted",
        not ({"alias", "intent", "relationship"} & set(kinds)),
        f"got {kinds}",
    )
    check(
        "the lift is capped",
        len(derived) <= retriever.SECTION_LIFT_V2_LIMIT,
        f"got {len(derived)}",
    )


# --- 5. a lift failure must not take the request down ----------------------


def test_lift_degrades_when_contains_unsupported() -> None:
    print("\n[5] an older Chroma without $contains degrades, it does not 500")

    retriever = make_retriever()
    collection = retriever.vector_store._collection

    collection.contains_supported = False
    try:
        derived = retriever._lift_v2_section("2", "7")
        documents = retriever.retrieve("What does section 2(7) say?")
    finally:
        collection.contains_supported = True

    check("card lift returns empty instead of raising", derived == [], f"got {derived}")
    check("the query still answers from statute and dense hits", len(documents) > 0)
    check(
        "verbatim 2(7) still reaches the answer",
        any(i == "CPA2019-CH1-S2-7" for i in ids_of(documents)),
        f"got {ids_of(documents)}",
    )


# --- 6. concept routing bridges lay language to statute --------------------


def test_routing_bridges_lay_language() -> None:
    print("\n[6] colloquial complaints reach the provision that governs them")

    retriever = make_retriever(k=8)

    cases = [
        (
            "A gym made me buy their own protein powder before renewing my "
            "membership. Is that allowed?",
            "definition.restrictive_trade_practice",
        ),
        (
            "The shop charged me 250 rupees for a bottle whose printed MRP is "
            "200. What can I do?",
            "definition.unfair_trade_practice",
        ),
        (
            "My insurance company rejected my claim saying the illness was "
            "pre-existing, which is false.",
            "definition.deficiency",
        ),
        (
            "The builder promised possession in 2022 and the flat still isn't "
            "ready.",
            "definition.deficiency",
        ),
    ]

    for query, expected in cases:
        routed = route_query(query)
        check(
            f"routes: {query[:44]}...",
            expected in routed.concepts,
            f"routes={routed.routes} concepts={routed.concepts}",
        )

        documents = retriever.retrieve(query)
        check(
            f"retrieves {expected}",
            expected in ids_of(documents),
            f"got {ids_of(documents)}",
        )


def test_routing_lifts_penal_provisions_verbatim() -> None:
    print("\n[7] questions about a penalty get the penal section verbatim")

    retriever = make_retriever(k=8)

    query = "What is the punishment for selling spurious goods that cause death?"
    routed = route_query(query)

    check(
        "the penalty route fires",
        "penalty_or_punishment" in routed.routes,
        f"got {routed.routes}",
    )

    documents = retriever.retrieve(query)
    lifted = [i for i in ids_of(documents) if i.startswith("CPA2019")]

    check(
        "at least one penal section arrives as verbatim statute",
        lifted,
        f"got {ids_of(documents)}",
    )
    # s.91(1) is the provision this question is actually about. Verbatim from
    # `v1-statute.jsonl` (CPA2019-CH7-S91-1):
    #
    #   "Whoever, by himself or by any other person on his behalf, manufactures
    #    for sale or stores or sells or distributes or imports any spurious
    #    goods shall be punished, if such act - (a) causing injury not
    #    amounting to grievous hurt ... (b) causing injury resulting in
    #    grievous hurt ... (c) resulting in the death of a consumer ..."
    #
    # This check previously required s.89, s.72 or s.88. All three are the wrong
    # law for a spurious-goods death: s.89 punishes false or misleading
    # advertisement, s.88 non-compliance with a Central Authority direction,
    # s.72 non-compliance with a Commission order. The old expectation was
    # written when no spurious/adulterant route existed, and it was asserting
    # the very miscitation this workstream exists to remove.
    check(
        "the spurious-goods offence s.91 (or the adulterant offence s.90) arrives",
        any(re.search(r"-S(90|91)(-|$)", i) for i in lifted),
        f"got {lifted}",
    )

    # The generic penal question must still reach the generic penal sections,
    # so narrowing the spurious case has not cost the broad case.
    generic = [
        i
        for i in ids_of(
            retriever.retrieve(
                "What is the penalty if a trader does not comply with the "
                "order of the Commission?"
            )
        )
        if i.startswith("CPA2019")
    ]
    check(
        "a non-compliance question still reaches s.72 or s.88",
        any(re.search(r"-S(72|88)(-|$)", i) for i in generic),
        f"got {generic}",
    )


def test_routing_is_inert_on_unrelated_text() -> None:
    print("\n[8] routing stays silent when nothing matches")

    for query in ("", "   ", "hello", "what is the weather in Chennai"):
        routed = route_query(query)
        check(
            f"no route for {query!r}",
            not routed,
            f"got routes={routed.routes} concepts={routed.concepts}",
        )


def test_routed_terms_supplement_the_query() -> None:
    print("\n[9] routed vocabulary is added, never substituted")

    retriever = make_retriever()

    query = "The gym forced me to buy their protein powder"
    routed = route_query(query)
    normalized = retriever._normalize_query(query, routed.terms)

    for word in ("gym", "forced", "protein", "powder"):
        check(
            f"keeps the consumer's word {word!r}",
            word in normalized,
            f"normalized={normalized}",
        )

    check(
        "adds statutory vocabulary",
        any(term in normalized for term in routed.terms),
        f"normalized={normalized}",
    )


# --- 10. illustrations no longer crowd out provisions ---------------------


def test_examples_are_capped() -> None:
    print("\n[10] illustrations cannot occupy the whole result")

    retriever = make_retriever(k=5)

    queries = [
        "I bought a washing machine that broke in a week and the shop refuses "
        "to replace it",
        "A hotel added a service charge I never agreed to pay",
        "The hospital operated on the wrong knee",
        "An online seller shipped a fake branded shoe",
    ]

    for query in queries:
        documents = retriever.retrieve(query)
        kinds = types_of(documents)
        examples = kinds.count("example")

        check(
            f"<= {retriever.MAX_EXAMPLES_IN_RESULT} examples for {query[:36]}...",
            examples <= retriever.MAX_EXAMPLES_IN_RESULT,
            f"got {kinds}",
        )
        check(
            f"result is full for {query[:36]}...",
            len(documents) == 5,
            f"got {len(documents)}",
        )


def test_scaffolding_cards_are_deprioritised() -> None:
    print("\n[11] generated alias/intent scaffolding is weighted down")

    retriever = make_retriever(k=5)

    scaffolding = 0
    total = 0

    for query in (
        "Who counts as a consumer under the Act?",
        "What are my rights if a product is defective?",
        "How long do I have to file a complaint?",
        "Which forum do I approach for a claim of thirty lakh rupees?",
    ):
        kinds = types_of(retriever.retrieve(query))
        total += len(kinds)
        scaffolding += sum(
            1 for kind in kinds if kind in ("alias", "intent", "relationship")
        )

    check(
        "scaffolding holds at most 10% of slots",
        scaffolding <= max(1, total // 10),
        f"{scaffolding}/{total} slots",
    )


def test_canonical_twin_promotion() -> None:
    print("\n[12] a canonical card is reachable whenever its illustration ranks")

    retriever = make_retriever(k=6)
    retriever._build_bm25_index()

    check(
        "the twin index was built",
        len(retriever._canonical_twins) > 100,
        f"got {len(retriever._canonical_twins)}",
    )
    check(
        "twin index holds no scaffolding",
        all(
            not concept_id.startswith(("alias.", "intent.", "relationship."))
            for twins in retriever._canonical_twins.values()
            for concept_id in twins
        ),
    )

    promoted = 0
    checked = 0

    for query in (
        "The trader refused to refund my money for a defective product",
        "I want compensation for the injury caused by an unsafe appliance",
        "The service centre kept my phone for three months",
    ):
        documents = retriever.retrieve(query)
        found = ids_of(documents)

        for doc_id in found:
            if not doc_id.startswith("example."):
                continue
            checked += 1
            suffix = re.sub(r"_\d+$", "", doc_id.split(".", 1)[1])
            twins = retriever._canonical_twins.get(suffix, [])
            if not twins:
                continue
            if any(twin in found for twin in twins):
                promoted += 1

    check(
        "illustrations arrive with their canonical sibling",
        checked == 0 or promoted > 0,
        f"{promoted}/{checked} illustrations had a sibling present",
    )


# --- 13. explicit section citation still dominates ------------------------


def test_named_section_outranks_inference() -> None:
    print("\n[13] a section the user names outranks one merely inferred")

    retriever = make_retriever(k=5)

    documents = retriever.retrieve(
        "What orders can the District Commission pass under section 39?"
    )
    found = ids_of(documents)

    check(
        "the named section is present",
        any(re.search(r"-S39(-|$)", i) for i in found),
        f"got {found}",
    )
    check(
        "and it ranks first",
        bool(re.search(r"-S39(-|$)", found[0])),
        f"got {found}",
    )

    check(
        "an explicitly named section is lifted harder than an inferred one",
        retriever.SECTION_LIFT_RANK_CONST
        < retriever.ROUTED_SECTION_LIFT_RANK_CONST,
    )

    # This group used to also assert
    #
    #   1/(ROUTED_SECTION_LIFT_RANK_CONST+1) < 1/(DENSE+1) + 1/(BM25+1)
    #
    # i.e. that an inferred section's score sits below a hit both legs agreed
    # on. That invariant was abandoned deliberately, because it is not
    # achievable and never was: a lifted or routed document is usually ALSO
    # found by dense and BM25, so its bonus ADDS to an already-good score
    # instead of replacing a bad one. Measured: routed definition cards reached
    # ~0.064 while the best possible purely-retrieved score is 1/41 + 1/61 =
    # 0.041, and they swept three of five slots. No choice of rank constant
    # fixes that. The bound is now structural - see [16].
    check(
        "a routed card cannot displace the top dense hit",
        1 / (retriever.CONCEPT_ROUTE_RANK_CONST + 1)
        < 1 / (retriever.DENSE_RANK_CONST + 1),
    )
    check(
        "a merely-derived card cannot beat the top dense hit",
        1 / (retriever.SECTION_LIFT_V2_RANK_CONST + 1)
        < 1 / (retriever.DENSE_RANK_CONST + 1),
    )


# --- 14. every routed concept id exists in the corpus ---------------------


def test_every_routed_concept_exists() -> None:
    print("\n[14] the lexicon references no concept that is missing from the corpus")

    from src.concept_routing import ROUTES

    retriever = make_retriever()
    retriever._build_bm25_index()

    missing = sorted(
        {
            concept
            for route in ROUTES
            for concept in route.concepts
            if concept not in retriever._concept_to_chroma
        }
    )

    check("no dangling concept ids", not missing, f"missing {missing}")

    known_sections = set()
    known_subsections = set()
    for meta in retriever.vector_store._collection.metadatas:
        if meta.get("source") == "v1":
            section = str(meta.get("section_number"))
            known_sections.add(section)
            known_subsections.add((section, meta.get("subsection_number") or ""))

    # `lift_sections` entries may name a clause ("2(7)"), so validate through
    # the same parser the router uses rather than string-matching the section.
    from src.concept_routing import _parse_lift

    bad_lifts = []
    for route in ROUTES:
        for entry in route.lift_sections:
            section, subsection = _parse_lift(entry)

            if section not in known_sections:
                bad_lifts.append(f"{route.name}:{entry} (no such section)")
            elif subsection is not None and (
                section,
                f"({subsection})",
            ) not in known_subsections:
                bad_lifts.append(f"{route.name}:{entry} (no such subsection)")

    check("no dangling lifted sections", not bad_lifts, f"bad {sorted(bad_lifts)}")

    check(
        "a clause-level lift parses to a subsection",
        _parse_lift("2(7)") == ("2", "7") and _parse_lift("39") == ("39", None),
        f'got {_parse_lift("2(7)")} and {_parse_lift("39")}',
    )


# --- 15. explain() is usable for triage ----------------------------------


def test_explain_surfaces_the_decision() -> None:
    print("\n[15] explain() shows why a query retrieved what it did")

    retriever = make_retriever()

    report = retriever.explain(
        "A builder delayed my flat possession by three years"
    )

    for key in (
        "routes",
        "routed_concepts",
        "lifted_sections",
        "named_sections",
        "results",
    ):
        check(f"explain() reports {key}", key in report, f"got {sorted(report)}")

    check(
        "explain() names the route that fired",
        bool(report["routes"]),
        f"got {report}",
    )


# --- 16. the slot budget bounds guessing, structurally -------------------


def test_injected_material_is_slot_bounded() -> None:
    print("\n[16] inferred material cannot crowd out what search actually found")

    retriever = make_retriever(k=5)

    # Questions chosen because each fires several routes, which is the case
    # where score-tuning failed: every routed concept also scores on the dense
    # and BM25 legs, so its bonus stacks on top of a real score.
    queries = (
        "A gym forced me to buy their protein powder to keep my membership",
        "The shop charged me more than the printed price on the packet",
        "What are my rights if a washing machine fails in the warranty period",
        "A builder delayed my flat possession by three years, what can I do",
        "The hospital gave me the wrong medicine and I was hospitalised",
    )

    for query in queries:
        report = retriever.explain(query)
        results = report["results"]

        origins = [row["origin"] for row in results]

        check(
            f"routed statute stays within its budget: {query[:38]!r}",
            origins.count("routed_statute") <= retriever.MAX_ROUTED_STATUTE_SLOTS,
            f"{origins.count('routed_statute')} of {len(results)}: {origins}",
        )
        check(
            f"routed cards stay within their budget: {query[:38]!r}",
            origins.count("routed_card") <= retriever.MAX_ROUTED_CARD_SLOTS,
            f"{origins.count('routed_card')} of {len(results)}: {origins}",
        )
        check(
            f"search still holds a slot: {query[:38]!r}",
            "retrieved" in origins,
            f"origins {origins}",
        )
        check(
            f"the result is still full: {query[:38]!r}",
            len(results) == 5,
            f"got {len(results)}",
        )

    check(
        "at least one slot is always reserved for retrieval",
        retriever.MAX_ROUTED_STATUTE_SLOTS + retriever.MAX_ROUTED_CARD_SLOTS < 5,
        f"{retriever.MAX_ROUTED_STATUTE_SLOTS} + "
        f"{retriever.MAX_ROUTED_CARD_SLOTS} >= 5",
    )


# --- 17. route priority reflects what the question asks ------------------


def test_route_priority_prefers_the_question_over_the_facts() -> None:
    print("\n[17] the question's own frame outranks an incidental noun")

    from src.concept_routing import ROUTES, route_query

    by_name = {route.name: route for route in ROUTES}

    # "warranty" and "laboratory testing" are usually background detail in a
    # narrative, not the thing being asked. They must not take the routed-card
    # slots from the route that matches the actual question.
    for incidental in ("warranty_or_guarantee", "laboratory_testing_of_goods"):
        for framing in ("consumer_rights_overview", "remedies_sought"):
            check(
                f"{framing} outranks {incidental}",
                by_name[framing].priority < by_name[incidental].priority,
                f"{by_name[framing].priority} vs {by_name[incidental].priority}",
            )

    # A question naming a specific right beats everything else.
    for named in ("right_to_redressal", "right_to_be_heard"):
        check(
            f"{named} outranks the generic rights overview",
            by_name[named].priority < by_name["consumer_rights_overview"].priority,
        )

    # And the ordering is actually applied, not merely declared.
    routed = route_query(
        "A washing machine stops working during the warranty period - what "
        "consumer rights issues arise?"
    )
    check(
        "both routes fire on the mixed question",
        {"warranty_or_guarantee", "consumer_rights_overview"} <= set(routed.routes),
        f"got {routed.routes}",
    )
    check(
        "the rights route is ordered ahead of the warranty route",
        routed.routes.index("consumer_rights_overview")
        < routed.routes.index("warranty_or_guarantee"),
        f"got {routed.routes}",
    )


# --- 18. the routing floor actually fires --------------------------------


def test_routing_floor_reserves_slots() -> None:
    print("\n[18] routing is guaranteed a voice even when its material loses")

    from src.concept_routing import route_query

    retriever = make_retriever(k=5)
    retriever._build_bm25_index()

    # b140. The rights route wins priority, but every top-5 slot goes to
    # warranty-evidence cards scoring 0.0358-0.0381 while the routed s.2(9)
    # card scores 0.0233. Only a reserved slot can put it in the answer.
    report = retriever.explain(
        "A washing machine stops working repeatedly during the warranty "
        "period. What consumer-rights issues could arise?"
    )
    ids = [row["id"] for row in report["results"]]

    check(
        "the routed rights card is present despite losing on score",
        "definition.consumer_rights" in ids,
        f"got {ids}",
    )
    check(
        "and it is marked as routed, not as a search hit",
        any(
            row["id"] == "definition.consumer_rights"
            and row["origin"] == "routed_card"
            for row in report["results"]
        ),
        f"got {report['results']}",
    )

    # b129. Two frames - the conduct and the relief - so both routes must get a
    # provision. Reserving one card overall gave both slots to the relief route
    # and dropped s.2(47), the provision that makes the conduct actionable.
    report = retriever.explain(
        "A shop charged me more than the printed price on the package. "
        "What remedy do I have?"
    )
    ids = [row["id"] for row in report["results"]]

    check(
        "both routes fire on the two-frame question",
        {"remedies_sought", "overcharging_above_printed_price"}
        <= set(report["routes"]),
        f"got {report['routes']}",
    )
    check(
        "the conduct route's provision survives the relief route",
        "definition.unfair_trade_practice" in ids,
        f"got {ids}",
    )

    # The key-space trap. `_doc_id` returns the concept id for a v2 card, so a
    # reservation looked up through `_concept_to_chroma` matches nothing and the
    # floor fails SILENTLY - the result still has k documents, just the wrong
    # ones. Assert the two id spaces really are different, so a future change
    # back to Chroma ids is caught here rather than in a legal answer.
    chroma_id = retriever._concept_to_chroma.get("definition.consumer_rights")
    check(
        "concept ids and chroma ids are different id spaces",
        chroma_id is not None and chroma_id != "definition.consumer_rights",
        f"concept_to_chroma gave {chroma_id!r}",
    )

    # And the floor never outgrows the ceiling.
    check(
        "the floor cannot exceed either cap",
        retriever.MAX_RESERVED_SLOTS
        <= retriever.MAX_ROUTED_STATUTE_SLOTS + retriever.MAX_ROUTED_CARD_SLOTS,
        f"{retriever.MAX_RESERVED_SLOTS}",
    )

    routing = route_query(
        "A shop charged me more than the printed price on the package. "
        "What remedy do I have?"
    )
    check(
        "concept groups are one per matched route",
        len(routing.concept_groups) == len(routing.routes),
        f"{len(routing.concept_groups)} groups for {routing.routes}",
    )
    check(
        "grouped concepts never include one the cap discarded",
        all(c in routing.concepts for group in routing.concept_groups for c in group),
        f"groups {routing.concept_groups} vs concepts {routing.concepts}",
    )


def main() -> int:
    if not DATASET.exists():
        print(f"dataset not found at {DATASET}", file=sys.stderr)
        return 2

    print("Loading corpus (real dataset, stand-in dense scorer)...")
    store = build_store()
    print(f"  {len(store._collection.ids)} documents indexed")

    test_derived_from_filters()
    test_section_lift_is_subsection_aware()
    test_section_lift_reaches_subsectionless_nodes()
    test_lifted_cards_are_type_ordered()
    test_lift_degrades_when_contains_unsupported()
    test_routing_bridges_lay_language()
    test_routing_lifts_penal_provisions_verbatim()
    test_routing_is_inert_on_unrelated_text()
    test_routed_terms_supplement_the_query()
    test_examples_are_capped()
    test_scaffolding_cards_are_deprioritised()
    test_canonical_twin_promotion()
    test_named_section_outranks_inference()
    test_every_routed_concept_exists()
    test_explain_surfaces_the_decision()
    test_injected_material_is_slot_bounded()
    test_route_priority_prefers_the_question_over_the_facts()
    test_routing_floor_reserves_slots()

    print(f"\n{len(PASSES)} passed, {len(FAILURES)} failed")

    for failure in FAILURES:
        print(f"  - {failure}")

    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
