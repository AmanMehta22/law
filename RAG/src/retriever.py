from typing import List, Tuple

from langchain_core.documents import Document


class RAGRetriever:

    def __init__(self, vector_store, k: int = 5):
        self.vector_store = vector_store
        self.k = k

    def retrieve(self, query: str) -> List[Document]:
        """
        Retrieve the top-k most relevant legal knowledge cards.
        """

        return self.vector_store.similarity_search(
            query=query,
            k=self.k
        )

    def retrieve_with_scores(
        self,
        query: str
    ) -> List[Tuple[Document, float]]:
        """
        Retrieve documents along with their similarity scores.
        """

        return self.vector_store.similarity_search_with_score(
            query=query,
            k=self.k
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