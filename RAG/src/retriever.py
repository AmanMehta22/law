import re
from typing import Iterable, List, Sequence, Tuple

import numpy as np
from langchain_core.documents import Document
from rank_bm25 import BM25Okapi

from src.concept_routing import RoutingResult, route_query


class RAGRetriever:

    DENSE_CANDIDATES = 30
    BM25_CANDIDATES = 20
    DENSE_RANK_CONST = 40
    BM25_RANK_CONST = 60

    # Definition-card lift: a matched definition card is scored as if it
    # ranked ~4-5 in the dense list (1/45), so it reliably enters the
    # top-k for definition-style questions without dominating the list.
    DEFINITION_LIFT_RANK_CONST = 44
    # V1 statute definition chunk: weaker lift (like BM25 rank ~14) so the
    # statutory wording surfaces only when it was already a near-miss.
    DEFINITION_V1_LIFT_RANK_CONST = 74

    # Section-number lift: when the query explicitly names a section, the
    # statute chunks (and derived cards) of that section are boosted so the
    # official text surfaces even when the question is phrased generically.
    SECTION_LIFT_RANK_CONST = 10

    # Cards merely *derived from* a named section are weak evidence: the
    # `derived_from` filter is a substring test, so for a busy section it
    # matches dozens of cards about quite different things. At the old value
    # of 30 each such card scored 1/31 = 0.0323 and outranked the best dense
    # hit at 1/41 = 0.0244, letting eight arbitrary cards displace genuine
    # results. At 46 they score 0.0213 and supplement instead.
    SECTION_LIFT_V2_RANK_CONST = 46
    # How many derived cards a single named section may contribute. They are
    # now chosen by concept type rather than by storage order.
    SECTION_LIFT_V2_LIMIT = 6

    # Sections inferred by concept routing rather than named by the user.
    # Verbatim statute deserves to rank high - it is the authoritative part of
    # the answer context - and the slot budget below, not this constant, is what
    # stops a wrong inference from taking over the result.
    ROUTED_SECTION_LIFT_RANK_CONST = 14

    # Concept cards force-included by routing.
    CONCEPT_ROUTE_RANK_CONST = 42

    # ---------------------------------------------------------------------
    # Slot budget.
    #
    # Rank constants alone cannot bound how much injected material reaches the
    # answer, because a routed card usually ALSO scores on the dense and BM25
    # legs, so its bonus adds to an already-good score rather than standing in
    # for one. Measured: routed definition cards reached 0.064 against a
    # best-case retrieved score of 0.041 and swept the top three slots of five,
    # evicting the correct card on seven questions.
    #
    # So the guarantee is structural instead. Material the retriever INJECTED -
    # force-included because a rule said it was relevant, not because either
    # search leg found it - is capped. A doc that dense or BM25 also returned is
    # not injected material and is never capped: the cap limits guessing, not
    # retrieval.
    # ---------------------------------------------------------------------

    # Statute for a section the user did not name.
    MAX_ROUTED_STATUTE_SLOTS = 2
    # Cards force-included by concept routing or by a derived-from lift.
    MAX_ROUTED_CARD_SLOTS = 2

    # The caps above are a ceiling; this is the matching floor. Routing is
    # allowed to guarantee itself this many slots even when its material loses
    # on score, because on the questions routing exists to fix it always loses
    # on score - that is why the route was needed. Two, not four: with k=5 the
    # majority of the result must still be what search actually found, or a
    # wrong route costs most of the answer's context rather than a corner of it.
    MAX_RESERVED_SLOTS = 2

    # Post-fusion type weights. `example.*` cards are verbose, which wins dense
    # similarity, and they are the only card type that reaches the statute just
    # one hop away - the weakest possible grounding. Measured over 150
    # questions they held 51.2% of all top-5 slots and 100% of the top-10 for
    # scenario questions. `alias`/`intent`/`relationship` cards are search
    # scaffolding (all 2,411 are generated boilerplate with confidence 0.0) and
    # carry no legal content worth showing the model.
    TYPE_WEIGHTS = {
        "example": 0.70,
        "relationship": 0.55,
        "alias": 0.40,
        "intent": 0.40,
    }

    # Never let illustrations crowd out the provisions they illustrate.
    MAX_EXAMPLES_IN_RESULT = 2

    # Preference order used wherever this class has to choose cards itself
    # (the section lift). Earlier is better.
    CANONICAL_TYPE_ORDER = (
        "definition",
        "right",
        "remedy",
        "penalty",
        "offence",
        "procedure",
        "timeline",
        "jurisdiction",
        "exception",
        "obligation",
        "duty",
        "condition",
        "limitation",
        "authority",
        "evidence",
        "example",
    )

    SECTION_PATTERNS = [
        re.compile(r"\bsection\s+(\d{1,3})\s*\((\d{1,3})\)", re.I),
        re.compile(r"\bsec\.\s*(\d{1,3})\s*\((\d{1,3})\)", re.I),
        re.compile(r"\bs\.\s*(\d{1,3})\s*\((\d{1,3})\)", re.I),
        re.compile(r"\bsection\s+(\d{1,3})(?![0-9(])", re.I),
        re.compile(r"\bsec\.\s*(\d{1,3})(?![0-9(])", re.I),
        re.compile(r"\bs\.\s*(\d{1,3})(?![0-9(])", re.I),
    ]

    DEFINITION_INTENT_PATTERNS = [
        re.compile(r"\bconsidered\b"),
        re.compile(r"\bwho (?:is|are|can|does|qualifies)\b"),
        re.compile(r"\bwhat (?:is|are|does|counts)\b"),
        re.compile(r"\b(?:definition|defines?|define|meaning|means|interpretation)\b"),
        re.compile(r"\bdoes [a-z0-9 ]{0,60}include\b"),
        re.compile(r"\binclude a (?:person|user|beneficiary)\b"),
        re.compile(r"\buser of (?:such |the |those )?goods\b"),
        re.compile(r"\b(gift|gifted)\b"),
        re.compile(r"\bfalls? (?:within|under)\b"),
    ]

    QUERY_SYNONYMS = {
        "informed": "information",
        "remedies": "remedy relief",
        "remedy": "remedies relief",
        "gift": "gift gifted",
        "gifted": "gifted",
        "defective": "defect deficiency",
        "defect": "defect deficiency",
        "paid": "paid consideration",
        "purchase": "purchase bought consideration",
        "purchased": "purchased bought consideration",
        "buy": "buy buys purchased",
    }

    def __init__(self, vector_store, k: int = 5):
        self.vector_store = vector_store
        self.k = k
        self._bm25: BM25Okapi | None = None
        self._corpus: List[str] = []
        self._corpus_ids: List[str] = []
        self._definition_terms: dict[str, list[str]] | None = None
        self._v1_definition_built = False
        # concept_id -> chroma id, and canonical-suffix -> chroma ids. Both are
        # filled by the BM25 index build, which already scans the collection.
        self._concept_to_chroma: dict[str, str] = {}
        self._canonical_twins: dict[str, list[str]] = {}

    def retrieve(self, query: str, k: int | None = None) -> List[Document]:
        """
        Retrieve the top-k most relevant legal documents using
        hybrid search: dense embeddings fused with BM25 keyword
        scores via Reciprocal Rank Fusion.

        Concept routing runs on the *raw* query, because its patterns depend on
        punctuation and hyphens that normalization strips.
        """

        routing = route_query(query)

        normalized = self._normalize_query(query, routing.terms)

        section_targets = self._section_targets(query)

        return self._hybrid_retrieve(
            normalized,
            k or self.k,
            section_targets,
            routing,
        )

    def explain(self, query: str) -> dict:
        """
        Why did this query retrieve what it did? Returns the routing decision
        and the ranked results, so a wrong answer can be traced to a wrong
        route without re-reading the code.

        Each result carries `origin`:
          "retrieved"      found by dense and/or BM25 - the query really matched
          "named_section"  the user cited this section, so it was lifted
          "routed_statute" the section was INFERRED from the wording
          "routed_card"    the card was INFERRED from the wording

        Anything other than "retrieved" is the pipeline guessing, and is the
        first place to look when an answer cites law the consumer never asked
        about. The two routed origins are what MAX_ROUTED_*_SLOTS bounds.
        """

        routing = route_query(query)

        normalized = self._normalize_query(query, routing.terms)
        section_targets = self._section_targets(query)

        trace: dict = {}
        documents = self._hybrid_retrieve(
            normalized,
            self.k,
            section_targets,
            routing,
            trace=trace,
        )

        def origin(doc_id: str) -> str:
            if doc_id in trace.get("retrieved_ids", ()):
                return "retrieved"
            if doc_id in trace.get("named_section_ids", ()):
                return "named_section"
            if doc_id in trace.get("routed_statute_ids", ()):
                return "routed_statute"
            if doc_id in trace.get("routed_card_ids", ()):
                return "routed_card"
            return "lifted_definition"

        return {
            "query": query,
            "normalized": normalized,
            "named_sections": section_targets,
            "routes": list(routing.routes),
            "routed_sections": list(routing.sections),
            "routed_concepts": list(routing.concepts),
            "lifted_sections": [s for s, _ in routing.lift_targets],
            "results": [
                {
                    "id": self._doc_id(doc),
                    "concept_type": doc.metadata.get("concept_type"),
                    "source": doc.metadata.get("source"),
                    "section": doc.metadata.get("section_number"),
                    "origin": origin(self._doc_id(doc)),
                    "score": round(
                        trace.get("scores", {}).get(self._doc_id(doc), 0.0), 5
                    ),
                }
                for doc in documents
            ],
        }

    def _normalize_query(
        self,
        query: str,
        routed_terms: Sequence[str] = (),
    ) -> str:
        text = query.lower()
        text = re.sub(r"\bconsumer protection act[,.\s]*2019\b", "", text)
        text = re.sub(r"\bconsumer protection act\b", "", text)

        expanded = []
        for token in re.findall(r"[a-z0-9]+", text):
            expanded.append(token)
            synonyms = self.QUERY_SYNONYMS.get(token)
            if synonyms:
                expanded.extend(synonyms.split())

        # Statutory vocabulary from concept routing. Appended rather than
        # substituted, so the consumer's own words still drive the embedding.
        expanded.extend(routed_terms)

        text = " ".join(expanded)
        text = re.sub(r"\s+", " ", text)
        return text.strip(" .,?;:!")

    def _hybrid_retrieve(
        self,
        query: str,
        k: int,
        section_targets: list[tuple[str, str | None]] | None = None,
        routing: RoutingResult | None = None,
        trace: dict | None = None,
    ) -> List[Document]:
        routing = routing or RoutingResult()

        dense = self.vector_store.similarity_search(
            query=query,
            k=self.DENSE_CANDIDATES,
            filter={"source": "v2"},
        )

        bm25_docs = self._bm25_retrieve(query, self.BM25_CANDIDATES)

        extra_docs = self._lift_definition_docs(query)

        section_docs = self._lift_section_docs(
            section_targets or [],
            self.SECTION_LIFT_RANK_CONST,
        )

        # Sections inferred from the wording rather than named outright.
        routed_section_docs = self._lift_section_docs(
            list(routing.lift_targets),
            self.ROUTED_SECTION_LIFT_RANK_CONST,
        )

        routed_docs = self._lift_concept_docs(routing.concepts)

        rank_map: dict[str, float] = {}

        retrieved_ids: set[str] = set()

        for index, doc in enumerate(dense):
            doc_id = self._doc_id(doc)
            retrieved_ids.add(doc_id)

            rank_map[doc_id] = rank_map.get(doc_id, 0) + 1.0 / (
                self.DENSE_RANK_CONST + index + 1
            )

        for index, doc in enumerate(bm25_docs):
            doc_id = self._doc_id(doc)
            retrieved_ids.add(doc_id)

            rank_map[doc_id] = rank_map.get(doc_id, 0) + 1.0 / (
                self.BM25_RANK_CONST + index + 1
            )

        # Sections the user named are honoured without limit; everything else
        # the retriever injected is budgeted.
        for doc, lift_const in section_docs:
            doc_id = self._doc_id(doc)

            rank_map[doc_id] = rank_map.get(doc_id, 0) + 1.0 / (lift_const + 1)

        routed_statute_ids: set[str] = set()
        routed_card_ids: set[str] = set()

        for doc, lift_const in routed_section_docs:
            doc_id = self._doc_id(doc)

            rank_map[doc_id] = rank_map.get(doc_id, 0) + 1.0 / (lift_const + 1)

            if doc_id in retrieved_ids:
                continue

            if doc.metadata.get("source") == "v1":
                routed_statute_ids.add(doc_id)
            else:
                routed_card_ids.add(doc_id)

        for doc in routed_docs:
            doc_id = self._doc_id(doc)

            rank_map[doc_id] = rank_map.get(doc_id, 0) + 1.0 / (
                self.CONCEPT_ROUTE_RANK_CONST + 1
            )

            if doc_id not in retrieved_ids:
                routed_card_ids.add(doc_id)

        for doc in extra_docs:
            doc_id = self._doc_id(doc)

            if doc.metadata.get("source") == "v1":
                bonus = 1.0 / (self.DEFINITION_V1_LIFT_RANK_CONST + 1)
            else:
                bonus = 1.0 / (self.DEFINITION_LIFT_RANK_CONST + 1)

            rank_map[doc_id] = rank_map.get(doc_id, 0) + bonus

        all_docs = (
            dense
            + bm25_docs
            + extra_docs
            + routed_docs
            + [doc for doc, _ in section_docs]
            + [doc for doc, _ in routed_section_docs]
        )

        by_id: dict[str, Document] = {}
        for doc in all_docs:
            by_id.setdefault(self._doc_id(doc), doc)

        # Pull in the canonical sibling of any illustration that scored well,
        # so "example.right_to_refund" cannot appear without giving
        # "right.right_to_refund" the same chance.
        self._promote_canonical_twins(rank_map, by_id)

        weighted = {
            doc_id: score * self._type_weight(by_id.get(doc_id))
            for doc_id, score in rank_map.items()
        }

        ranked = sorted(
            weighted.items(),
            key=lambda item: item[1],
            reverse=True,
        )

        selected_ids = self._select_ids(
            [doc_id for doc_id, _ in ranked],
            by_id,
            k,
            routed_statute_ids=routed_statute_ids,
            routed_card_ids=routed_card_ids,
            reserved_ids=self._reserved_ids(
                routed_section_docs,
                routing.concept_groups,
                routed_statute_ids,
                routed_card_ids,
            ),
        )

        if trace is not None:
            # Filled only when a caller asks for it, so nothing is stored on
            # self. The service handles concurrent requests, and a retriever
            # that remembered its last query would report another user's.
            trace["retrieved_ids"] = set(retrieved_ids)
            trace["routed_statute_ids"] = set(routed_statute_ids)
            trace["routed_card_ids"] = set(routed_card_ids)
            trace["named_section_ids"] = {
                self._doc_id(doc) for doc, _ in section_docs
            }
            trace["scores"] = dict(weighted)

        return [by_id[doc_id] for doc_id in selected_ids if doc_id in by_id]

    def _type_weight(self, doc: Document | None) -> float:
        if doc is None:
            return 1.0

        concept_type = doc.metadata.get("concept_type")

        return self.TYPE_WEIGHTS.get(concept_type, 1.0)

    def _reserved_ids(
        self,
        routed_section_docs: Sequence[tuple[Document, int]],
        concept_groups: Sequence[Sequence[str]],
        routed_statute_ids: set[str],
        routed_card_ids: set[str],
    ) -> List[str]:
        """
        The minimum the routing decision is entitled to: one subsection from
        each inferred section, breadth-first, plus the primary concept of the
        highest-priority route.

        BREADTH FIRST IS THE POINT. `_lift_section_docs` returns subsections in
        section order, so a plain prefix of that list spends the whole
        MAX_ROUTED_STATUTE_SLOTS budget on one section. Measured (b094, "when is
        mediation not permitted under the Act?"): the route lifts s.37, s.79 and
        s.80, and s.37(1) plus s.37(2) took both slots, so the other two
        sections could never appear. Taking the first subsection of each section
        before any section's second gives the model one provision from each
        candidate, which is what a question spanning several sections needs.
        """

        reserved: list[str] = []

        seen_sections: set[str] = set()
        for doc, _ in routed_section_docs:
            doc_id = self._doc_id(doc)

            # Already found by search: it needs no reservation, and reserving it
            # would spend a routed slot on a document that is not a guess.
            if doc_id not in routed_statute_ids:
                continue

            section = str(doc.metadata.get("section_number"))
            if section in seen_sections:
                continue

            seen_sections.add(section)
            reserved.append(doc_id)

        # One card per matched route, in priority order: the first concept that
        # route asked for which search did NOT already find. A route whose
        # material is already in the result on merit needs no reservation, and
        # skipping to its next concept would spend a slot on a weaker card.
        #
        # Per-route rather than one overall, because a question routinely has
        # two frames and needs a provision for each. Measured (b129, "a shop
        # charged me more than the printed price - what remedy do I have?"): the
        # overcharging route correctly routed to
        # `definition.unfair_trade_practice` (s.2(47)), the provision that makes
        # the conduct actionable at all, but the higher-priority
        # `remedies_sought` route supplied the first unretrieved concept, so
        # s.2(47) was pushed out by four remedy cards. Reserving one per route
        # gives the answer both the classification and the relief.
        #
        # Note the key space: `_doc_id` returns the CONCEPT id for a v2 card,
        # not the Chroma row id, so `rank_map`, `by_id` and `routed_card_ids`
        # are all keyed by concept id. Looking the concept up in
        # `_concept_to_chroma` here would produce a Chroma id ('doc-638') that
        # matches nothing, and the reservation would silently never fire.
        for group in concept_groups:
            for concept_id in group:
                if concept_id in routed_card_ids and concept_id not in reserved:
                    reserved.append(concept_id)
                    break

        return reserved[: self.MAX_RESERVED_SLOTS]

    def _select_ids(
        self,
        ordered_ids: Sequence[str],
        by_id: dict[str, Document],
        k: int,
        routed_statute_ids: set[str] | None = None,
        routed_card_ids: set[str] | None = None,
        reserved_ids: Sequence[str] = (),
    ) -> List[str]:
        """
        Fill k slots in score order, subject to the budgets above.

        `reserved_ids` are admitted first, in the order given, and count against
        the routed budgets like anything else. This is a FLOOR to go with the
        caps: the caps stop routing from taking over a result, but without a
        floor routing achieves nothing on the questions that need it most.

        Measured case (b140, "a washing machine stops working repeatedly during
        the warranty period - what consumer-rights issues could arise?"): the
        rights route fired and correctly won priority, but all five slots went
        to warranty-evidence cards scoring 0.0358-0.0381, while the routed
        `definition.consumer_rights` card - which is the s.2(9) provision the
        question is actually about - scored 0.0233 and never appeared. Raising
        the routed bonus to beat 0.0358 would have let routing sweep the result
        on every other question, which is the failure the caps exist to prevent.
        A floor fixes this question without touching the ceiling.

        Anything rejected by a budget is deferred rather than dropped: returning
        fewer than k results would be a worse failure than one extra
        illustration, and a short context makes the model more likely to answer
        from its own memory of the Act instead of from the retrieved text.
        """

        routed_statute_ids = routed_statute_ids or set()
        routed_card_ids = routed_card_ids or set()

        selected: list[str] = []
        deferred: list[str] = []

        used = {"example": 0, "routed_statute": 0, "routed_card": 0}
        budget = {
            "example": self.MAX_EXAMPLES_IN_RESULT,
            "routed_statute": self.MAX_ROUTED_STATUTE_SLOTS,
            "routed_card": self.MAX_ROUTED_CARD_SLOTS,
        }

        def classes_of(doc_id: str) -> list[str]:
            doc = by_id.get(doc_id)
            concept_type = doc.metadata.get("concept_type") if doc else None

            names = []

            if concept_type == "example":
                names.append("example")
            if doc_id in routed_statute_ids:
                names.append("routed_statute")
            if doc_id in routed_card_ids:
                names.append("routed_card")

            return names

        seen: set[str] = set()

        for doc_id in reserved_ids:
            if len(selected) >= k or doc_id in seen or doc_id not in by_id:
                continue

            names = classes_of(doc_id)

            if any(used[name] >= budget[name] for name in names):
                continue

            for name in names:
                used[name] += 1

            selected.append(doc_id)
            seen.add(doc_id)

        for doc_id in ordered_ids:
            if len(selected) >= k:
                break

            if doc_id in seen:
                continue

            names = classes_of(doc_id)

            if any(used[name] >= budget[name] for name in names):
                deferred.append(doc_id)
                continue

            for name in names:
                used[name] += 1

            selected.append(doc_id)
            seen.add(doc_id)

        for doc_id in deferred:
            if len(selected) >= k:
                break
            if doc_id in seen:
                continue
            selected.append(doc_id)
            seen.add(doc_id)

        return selected

    def _promote_canonical_twins(
        self,
        rank_map: dict[str, float],
        by_id: dict[str, Document],
        consider: int = 12,
    ) -> None:
        """
        `example.right_to_refund` and `right.right_to_refund` describe the same
        provision; the illustration is longer and so wins dense similarity. When
        an illustration ranks well, give its canonical sibling the same score.

        Mutates `rank_map` and `by_id` in place.
        """

        if self._bm25 is None:
            self._build_bm25_index()

        if not self._canonical_twins:
            return

        top = sorted(rank_map.items(), key=lambda item: item[1], reverse=True)
        wanted: dict[str, float] = {}

        for doc_id, score in top[:consider]:
            if not doc_id.startswith("example."):
                continue

            # Illustrations are suffixed _1, _2 ... when several share a stem.
            suffix = re.sub(r"_\d+$", "", doc_id.split(".", 1)[1])

            for twin_id in self._canonical_twins.get(suffix, []):
                if twin_id == doc_id:
                    continue
                if rank_map.get(twin_id, 0.0) >= score:
                    continue
                wanted[twin_id] = max(wanted.get(twin_id, 0.0), score)

        missing = [
            concept_id
            for concept_id in wanted
            if concept_id not in by_id
        ]

        for concept_id, doc in self._fetch_by_concept_ids(missing).items():
            by_id[concept_id] = doc

        for concept_id, score in wanted.items():
            if concept_id in by_id:
                rank_map[concept_id] = max(rank_map.get(concept_id, 0.0), score)

    def _fetch_by_concept_ids(
        self,
        concept_ids: Iterable[str],
    ) -> dict[str, Document]:
        """Load cards by concept id, tolerating ids that are not in the index."""

        chroma_ids = [
            self._concept_to_chroma[concept_id]
            for concept_id in concept_ids
            if concept_id in self._concept_to_chroma
        ]

        if not chroma_ids:
            return {}

        try:
            data = self.vector_store._collection.get(
                ids=chroma_ids,
                include=["documents", "metadatas"],
            )
        except Exception:
            return {}

        documents: dict[str, Document] = {}

        for meta, content in zip(
            data["metadatas"] or [],
            data["documents"] or [],
        ):
            meta = meta or {}
            concept_id = meta.get("concept_id")

            if not concept_id:
                continue

            documents[concept_id] = Document(
                page_content=content if isinstance(content, str) else "",
                metadata=meta,
            )

        return documents

    def _lift_concept_docs(self, concept_ids: Sequence[str]) -> List[Document]:
        """
        Force the provisions that concept routing identified into the candidate
        set. Without this, a consumer who writes "a gym forces me to buy their
        protein powder" never reaches s.2(41), because the wording of the
        restrictive-trade-practice definition looks nothing like the complaint.
        """

        if not concept_ids:
            return []

        if self._bm25 is None:
            self._build_bm25_index()

        return list(self._fetch_by_concept_ids(concept_ids).values())

    def _doc_id(self, doc: Document) -> str:
        return (
            doc.metadata.get("concept_id")
            or doc.metadata.get("v1_id")
            or doc.page_content[:64]
        )

    def _is_definition_intent(self, query: str) -> bool:
        return any(
            pattern.search(query)
            for pattern in self.DEFINITION_INTENT_PATTERNS
        )

    def _lift_definition_docs(self, query: str) -> List[Document]:
        """
        For definition-style questions, surface the definition cards (and
        the head chunk of the corresponding V1 statute section) whose
        defined term appears in the query. Without this, narrative
        questions like "I received a laptop as a gift... am I a consumer?"
        rank remedy/liability example cards far above the definition of
        "consumer".
        """

        if not self._is_definition_intent(query):
            return []

        self._build_definition_index()

        matched_ids: list[str] = []

        for term, chroma_ids in self._definition_terms.items():
            if term in query:
                matched_ids.extend(chroma_ids)

        if not matched_ids:
            return []

        data = self.vector_store._collection.get(
            ids=matched_ids,
            include=["documents", "metadatas"],
        )

        documents = []

        for doc_id, meta, content in zip(
            data["ids"],
            data["metadatas"] or [],
            data["documents"] or [],
        ):
            documents.append(
                Document(
                    page_content=content if isinstance(content, str) else "",
                    metadata=meta or {},
                )
            )

        return documents

    def _section_targets(
        self,
        query: str,
    ) -> list[tuple[str, str | None]]:
        """
        Extract (section, subsection) pairs from the raw query so the
        subsection is preserved (normalization strips punctuation).
        """

        targets: list[tuple[str, str | None]] = []

        for pattern in self.SECTION_PATTERNS:
            for match in pattern.finditer(query):
                section = match.group(1)
                subsection = (
                    match.group(2)
                    if match.lastindex is not None and match.lastindex >= 2
                    else None
                )

                target = (section, subsection)

                if target not in targets:
                    targets.append(target)

        return targets

    def _card_sort_key(self, meta: dict) -> tuple[int, str]:
        concept_type = meta.get("concept_type") or ""

        try:
            rank = self.CANONICAL_TYPE_ORDER.index(concept_type)
        except ValueError:
            rank = len(self.CANONICAL_TYPE_ORDER)

        return (rank, meta.get("concept_id") or "")

    def _derived_from_filters(
        self,
        section: str,
        subsection: str | None,
    ) -> list[dict]:
        """
        Build the `derived_from` substring tests for a section.

        `derived_from` is stored as a repr-style string:
            "['CPA2019-CH1-S2-9', 'definition.consumer_rights']"
        so every id is closed by a single quote. That matters twice over:

        * A subsection must be anchored with the closing quote, or "-S2-4"
          also matches CPA2019-CH1-S2-41 through S2-47.
        * 51 statute nodes have no subsection segment at all
          (CPA2019-CH2-S5, CPA2019-CH4-S40/41/43 ...). The old "-S{n}-" test
          missed every card derived from them, silently disabling the lift for
          those sections.
        """

        if subsection:
            return [{"derived_from": {"$contains": f"-S{section}-{subsection}'"}}]

        return [
            {"derived_from": {"$contains": f"-S{section}-"}},
            {"derived_from": {"$contains": f"-S{section}'"}},
        ]

    def _lift_section_docs(
        self,
        targets: list[tuple[str, str | None]],
        lift_const: int,
    ) -> List[Tuple[Document, int]]:
        """
        Boost the V1 statute chunks of a section and the V2 cards derived from
        it, so the official text surfaces for questions about that provision.

        `lift_const` differs by how the section was identified: a section the
        user named outright is trusted far more than one inferred from wording.
        """

        if not targets:
            return []

        section_docs: list[tuple[Document, int]] = []

        for section, subsection in targets:
            section_docs.extend(
                self._lift_v1_section(section, subsection, lift_const)
            )
            section_docs.extend(self._lift_v2_section(section, subsection))

        return section_docs

    def _lift_v1_section(
        self,
        section: str,
        subsection: str | None,
        lift_const: int,
    ) -> List[Tuple[Document, int]]:
        where: list = [
            {"source": "v1"},
            {"section_number": section},
        ]

        if subsection:
            where.append({"subsection_number": f"({subsection})"})

        try:
            data = self.vector_store._collection.get(
                where={"$and": where},
                include=["documents", "metadatas"],
            )
        except Exception:
            return []

        per_node: dict[str, dict] = {}

        for doc_id, meta, content in zip(
            data["ids"],
            data["metadatas"] or [],
            data["documents"] or [],
        ):
            meta = meta or {}
            node_id = meta.get("v1_id") or doc_id
            official = meta.get("official_text") or ""

            if node_id in per_node:
                continue

            section_ref = (
                f"{meta.get('section_number')}"
                f"{meta.get('subsection_number') or ''}"
            )

            if official:
                page_content = (
                    f"Consumer Protection Act 2019; Section {section_ref};"
                    f" type: {meta.get('content_type')};\n"
                    f"Section {section_ref} of the Consumer Protection"
                    f" Act, 2019:\n{official}"
                )
            else:
                page_content = content if isinstance(content, str) else ""

            per_node[node_id] = {
                "page_content": page_content,
                "metadata": meta,
            }

        return [
            (
                Document(
                    page_content=item["page_content"],
                    metadata=item["metadata"],
                ),
                lift_const,
            )
            for item in per_node.values()
        ]

    def _lift_v2_section(
        self,
        section: str,
        subsection: str | None,
    ) -> List[Tuple[Document, int]]:
        """
        Cards derived from a section, chosen by concept type.

        Previously this applied no subsection filter and then took the first
        eight rows in Chroma storage order. For any question naming a
        subsection of section 2 the substring "-S2-" matched 95 cards and the
        same eight `authority.*` cards came back every time - the National
        Commission, the Director General and so on - regardless of what was
        asked.
        """

        collected: dict[str, dict] = {}

        for extra in self._derived_from_filters(section, subsection):
            try:
                data = self.vector_store._collection.get(
                    where={"$and": [{"source": "v2"}, extra]},
                    include=["documents", "metadatas"],
                )
            except Exception:
                # An older Chroma without metadata `$contains` should cost us
                # the card lift, not the whole request.
                continue

            for doc_id, meta, content in zip(
                data["ids"],
                data["metadatas"] or [],
                data["documents"] or [],
            ):
                meta = meta or {}

                if meta.get("concept_type") in ("alias", "intent", "relationship"):
                    continue

                key = meta.get("concept_id") or doc_id

                if key in collected:
                    continue

                collected[key] = {
                    "meta": meta,
                    "content": content if isinstance(content, str) else "",
                }

        ordered = sorted(
            collected.values(),
            key=lambda item: self._card_sort_key(item["meta"]),
        )

        return [
            (
                Document(
                    page_content=item["content"],
                    metadata=item["meta"],
                ),
                self.SECTION_LIFT_V2_RANK_CONST,
            )
            for item in ordered[: self.SECTION_LIFT_V2_LIMIT]
        ]

    def _tokenize(self, text: str) -> List[str]:
        return re.findall(r"[a-z0-9]+", text.lower())

    def _bm25_retrieve(
        self,
        query: str,
        k: int,
    ) -> List[Document]:
        if self._bm25 is None:
            self._build_bm25_index()

        scores = self._bm25.get_scores(self._tokenize(query))

        top_indices = np.argsort(scores)[::-1][:k]

        return [
            Document(
                page_content=self._corpus[i],
                metadata=self._load_collection_metadata(i),
            )
            for i in top_indices
            if scores[i] > 0
        ]

    def _build_bm25_index(self) -> None:
        collection = self.vector_store._collection

        data = collection.get(include=["documents", "metadatas"])

        search_only = {"alias", "intent", "relationship"}

        kept_ids = []
        kept_docs = []
        kept_metas = []

        definition_terms: dict[str, list[str]] = {}
        concept_to_chroma: dict[str, str] = {}
        canonical_twins: dict[str, list[str]] = {}

        raw_metadatas = data["metadatas"] or [
            {} for _ in (data["documents"] or [])
        ]

        for doc_id, doc, meta in zip(
            data["ids"],
            data["documents"] or [],
            raw_metadatas,
        ):
            if meta.get("source") != "v2":
                continue

            concept_id = meta.get("concept_id") or ""

            if concept_id:
                concept_to_chroma.setdefault(concept_id, doc_id)

            concept_type = meta.get("concept_type")

            # Index canonical siblings even though they are excluded from BM25,
            # so twin promotion can reach them.
            if concept_type not in search_only and concept_type != "example":
                if "." in concept_id:
                    suffix = concept_id.split(".", 1)[1]
                    canonical_twins.setdefault(suffix, []).append(concept_id)

            if concept_type in search_only:
                continue

            kept_ids.append(doc_id)
            kept_docs.append(doc if isinstance(doc, str) else "")
            kept_metas.append(meta)

            if concept_type == "definition":
                if concept_id.startswith("definition."):
                    term = concept_id.split(".", 1)[1].replace("_", " ")
                    definition_terms.setdefault(term, []).append(doc_id)

        self._corpus_ids = kept_ids
        self._corpus = kept_docs
        self._metadata_cache = kept_metas

        self._bm25 = BM25Okapi(
            [self._tokenize(doc) for doc in self._corpus]
        )

        self._definition_terms = definition_terms
        self._concept_to_chroma = concept_to_chroma
        self._canonical_twins = canonical_twins

    def _build_definition_index(self) -> None:
        """
        Map defined terms to their definition documents so definition
        questions can surface them alongside the normal hybrid results.
        V2 definition cards come from the BM25 index build; V1 statute
        definition chunks (head chunk only) are merged in here. Cheap:
        reuses the collection scan and only runs when a definition-style
        query arrives.
        """

        collection = self.vector_store._collection

        if self._definition_terms is None:
            data = collection.get(include=["metadatas"])
            definition_terms: dict[str, list[str]] = {}

            for doc_id, meta in zip(
                data["ids"],
                data["metadatas"] or [],
            ):
                if meta.get("source") != "v2":
                    continue

                if meta.get("concept_type") != "definition":
                    continue

                concept_id = meta.get("concept_id") or ""
                if concept_id.startswith("definition."):
                    term = concept_id.split(".", 1)[1].replace("_", " ")
                    definition_terms.setdefault(term, []).append(doc_id)
        else:
            definition_terms = self._definition_terms

        if not self._v1_definition_built:
            v1_data = collection.get(include=["metadatas"])

            for doc_id, meta in zip(
                v1_data["ids"],
                v1_data["metadatas"] or [],
            ):
                if meta.get("source") != "v1":
                    continue

                if meta.get("content_type") != "definition":
                    continue

                if meta.get("chunk_index") not in (0, None):
                    continue

                term = meta.get("term")
                if not isinstance(term, str):
                    continue

                term = term.strip().lower()

                if term:
                    if doc_id not in definition_terms.setdefault(term, []):
                        definition_terms[term].append(doc_id)

            self._v1_definition_built = True

        self._definition_terms = definition_terms

    def _load_collection_metadata(self, index: int) -> dict:
        if not hasattr(self, "_metadata_cache"):
            return {}

        return self._metadata_cache[index]

    def retrieve_with_scores(
        self,
        query: str,
    ) -> List[Tuple[Document, float]]:
        """
        Retrieve documents along with their similarity scores.
        """

        return self.vector_store.similarity_search_with_score(
            query=query,
            k=self.k,
        )

    def get_context(self, query: str) -> str:
        """
        Build a text context from the retrieved documents.
        """

        documents = self.retrieve(query)

        context_parts = []

        for i, doc in enumerate(documents, start=1):

            context_parts.append(
                f"""
--- Knowledge Card {i} ---

Concept ID:
{doc.metadata.get("concept_id")}

Concept Type:
{doc.metadata.get("concept_type")}

Title:
{doc.metadata.get("title")}

Content:
{doc.page_content}
"""
            )

        return "\n".join(context_parts)
