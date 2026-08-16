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

    QUERY_SYNONYMS = {
        "informed": "information",
        "remedies": "remedy relief",
        "remedy": "remedies relief",
    }

    def __init__(self, vector_store, k: int = 5):
        self.vector_store = vector_store
        self.k = k
        self._bm25: BM25Okapi | None = None
        self._corpus: List[str] = []
        self._corpus_ids: List[str] = []

    def retrieve(self, query: str, k: int | None = None) -> List[Document]:
        """
        Retrieve the top-k most relevant legal documents using
        hybrid search: dense embeddings fused with BM25 keyword
        scores via Reciprocal Rank Fusion.
        """

        normalized = self._normalize_query(query)

        return self._hybrid_retrieve(normalized, k or self.k)

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

    def _hybrid_retrieve(self, query: str, k: int) -> List[Document]:
        dense = self.vector_store.similarity_search(
            query=query,
            k=self.DENSE_CANDIDATES,
            filter={"source": "v2"},
        )

        bm25_docs = self._bm25_retrieve(query, self.BM25_CANDIDATES)

        rank_map: dict[str, int] = {}

        for index, doc in enumerate(dense):
            doc_id = doc.metadata.get("concept_id") or doc.metadata.get(
                "v1_id"
            ) or doc.page_content[:64]

            rank_map[doc_id] = rank_map.get(doc_id, 0) + 1.0 / (
                self.DENSE_RANK_CONST + index + 1
            )

        for index, doc in enumerate(bm25_docs):
            doc_id = doc.metadata.get("concept_id") or doc.metadata.get(
                "v1_id"
            ) or doc.page_content[:64]

            rank_map[doc_id] = rank_map.get(doc_id, 0) + 1.0 / (
                self.BM25_RANK_CONST + index + 1
            )

        ranked = sorted(
            rank_map.items(),
            key=lambda item: item[1],
            reverse=True,
        )

        selected_ids = [doc_id for doc_id, _ in ranked[:k]]

        dense_ids = [
            d.metadata.get("concept_id")
            or d.metadata.get("v1_id")
            or d.page_content[:64]
            for d in dense
        ]

        bm25_ids = [
            d.metadata.get("concept_id")
            or d.metadata.get("v1_id")
            or d.page_content[:64]
            for d in bm25_docs
        ]

        all_docs = dense + bm25_docs
        all_ids = dense_ids + bm25_ids

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

        self._corpus_ids = kept_ids
        self._corpus = kept_docs
        self._metadata_cache = kept_metas

        self._bm25 = BM25Okapi(
            [self._tokenize(doc) for doc in self._corpus]
        )

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