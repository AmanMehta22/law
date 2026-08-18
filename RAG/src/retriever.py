import re
from typing import List, Tuple

import numpy as np
from langchain_core.documents import Document
from rank_bm25 import BM25Okapi


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
    SECTION_LIFT_V2_RANK_CONST = 30

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

    def retrieve(self, query: str, k: int | None = None) -> List[Document]:
        """
        Retrieve the top-k most relevant legal documents using
        hybrid search: dense embeddings fused with BM25 keyword
        scores via Reciprocal Rank Fusion.
        """

        normalized = self._normalize_query(query)

        section_targets = self._section_targets(query)

        return self._hybrid_retrieve(normalized, k or self.k, section_targets)

    def _normalize_query(self, query: str) -> str:
        text = query.lower()
        text = re.sub(r"\bconsumer protection act[,.\s]*2019\b", "", text)
        text = re.sub(r"\bconsumer protection act\b", "", text)

        expanded = []
        for token in re.findall(r"[a-z0-9]+", text):
            expanded.append(token)
            synonyms = self.QUERY_SYNONYMS.get(token)
            if synonyms:
                expanded.extend(synonyms.split())

        text = " ".join(expanded)
        text = re.sub(r"\s+", " ", text)
        return text.strip(" .,?;:!")

    def _hybrid_retrieve(
        self,
        query: str,
        k: int,
        section_targets: list[tuple[str, str | None]] | None = None,
    ) -> List[Document]:
        dense = self.vector_store.similarity_search(
            query=query,
            k=self.DENSE_CANDIDATES,
            filter={"source": "v2"},
        )

        bm25_docs = self._bm25_retrieve(query, self.BM25_CANDIDATES)

        extra_docs = self._lift_definition_docs(query)

        section_docs = self._lift_section_docs(section_targets or [])

        rank_map: dict[str, int] = {}

        for index, doc in enumerate(dense):
            doc_id = self._doc_id(doc)

            rank_map[doc_id] = rank_map.get(doc_id, 0) + 1.0 / (
                self.DENSE_RANK_CONST + index + 1
            )

        for index, doc in enumerate(bm25_docs):
            doc_id = self._doc_id(doc)

            rank_map[doc_id] = rank_map.get(doc_id, 0) + 1.0 / (
                self.BM25_RANK_CONST + index + 1
            )

        for doc, lift_const in section_docs:
            doc_id = self._doc_id(doc)

            rank_map[doc_id] = rank_map.get(doc_id, 0) + 1.0 / (
                lift_const + 1
            )

        for doc in extra_docs:
            doc_id = self._doc_id(doc)

            if doc.metadata.get("source") == "v1":
                bonus = 1.0 / (self.DEFINITION_V1_LIFT_RANK_CONST + 1)
            else:
                bonus = 1.0 / (self.DEFINITION_LIFT_RANK_CONST + 1)

            rank_map[doc_id] = rank_map.get(doc_id, 0) + bonus

        ranked = sorted(
            rank_map.items(),
            key=lambda item: item[1],
            reverse=True,
        )

        selected_ids = [doc_id for doc_id, _ in ranked[:k]]

        all_docs = dense + bm25_docs + extra_docs + [
            doc for doc, _ in section_docs
        ]
        all_ids = [self._doc_id(doc) for doc in all_docs]

        result = []

        for doc_id in selected_ids:
            match = next(
                (
                    doc
                    for doc, did in zip(all_docs, all_ids)
                    if did == doc_id
                ),
                None,
            )

            if match is not None:
                result.append(match)

        return result

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

    def _lift_section_docs(
        self,
        targets: list[tuple[str, str | None]],
    ) -> List[Tuple[Document, int]]:
        """
        When the query explicitly names a section (e.g. "Section 39",
        "s. 39(1)(a)"), boost the V1 statute chunks of that section and
        the V2 cards derived from it so the official text surfaces even
        for generically-worded questions.
        """

        if not targets:
            return []

        section_docs: list[tuple[Document, int]] = []

        for section, subsection in targets:
            where: list = [
                {"source": "v1"},
                {"section_number": section},
            ]

            if subsection:
                where.append({"subsection_number": f"({subsection})"})

            data = self.vector_store._collection.get(
                where={"$and": where},
                include=["documents", "metadatas"],
            )

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

            for node_id, item in per_node.items():
                section_docs.append(
                    (
                        Document(
                            page_content=item["page_content"],
                            metadata=item["metadata"],
                        ),
                        self.SECTION_LIFT_RANK_CONST,
                    )
                )

            v2_data = self.vector_store._collection.get(
                where={
                    "$and": [
                        {"source": "v2"},
                        {"derived_from": {"$contains": f"-S{section}-"}},
                    ]
                },
                include=["documents", "metadatas"],
            )

            count = 0

            for doc_id, meta, content in zip(
                v2_data["ids"],
                v2_data["metadatas"] or [],
                v2_data["documents"] or [],
            ):
                meta = meta or {}

                if meta.get("concept_type") in (
                    "alias",
                    "intent",
                    "relationship",
                ):
                    continue

                if count >= 8:
                    break

                section_docs.append(
                    (
                        Document(
                            page_content=content if isinstance(content, str) else "",
                            metadata=meta,
                        ),
                        self.SECTION_LIFT_V2_RANK_CONST,
                    )
                )

                count += 1

        return section_docs

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

            if meta.get("concept_type") in search_only:
                continue

            kept_ids.append(doc_id)
            kept_docs.append(doc if isinstance(doc, str) else "")
            kept_metas.append(meta)

            if meta.get("concept_type") == "definition":
                concept_id = meta.get("concept_id") or ""
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