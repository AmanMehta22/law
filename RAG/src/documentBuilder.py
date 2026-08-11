from typing import List, Dict, Any

from langchain_core.documents import Document


class DocumentBuilder:

    def __init__(self, knowledge_cards: List[Dict[str, Any]]):
        self.knowledge_cards = knowledge_cards

    def build_documents(self) -> List[Document]:
        """
        Convert knowledge cards into LangChain Documents.
        """

        documents = []

        for card in self.knowledge_cards:

            page_content = self._build_text(card)
            metadata = self._build_metadata(card)

            document = Document(
                page_content=page_content,
                metadata=metadata
            )

            documents.append(document)

        return documents

    def _build_text(self, card: Dict[str, Any]) -> str:

        parts = []

        # Title
        if card.get("title"):
            parts.append(
                f"Title: {card['title']}"
            )

        # Description
        if card.get("description"):
            parts.append(
                f"Description: {card['description']}"
            )

        # Main content
        if card.get("content"):
            parts.append(
                "Content:\n"
                + self._format_value(card["content"])
            )

        # Search information
        search = card.get("search", {})

        if search.get("keywords"):
            parts.append(
                "Keywords: "
                + ", ".join(search["keywords"])
            )

        if search.get("aliases"):
            parts.append(
                "Aliases: "
                + ", ".join(search["aliases"])
            )

        if search.get("user_queries"):
            parts.append(
                "User Queries:\n"
                + "\n".join(
                    f"- {query}"
                    for query in search["user_queries"]
                )
            )

        return "\n\n".join(parts)

    def _format_value(self, value: Any) -> str:

        if isinstance(value, dict):

            parts = []

            for key, val in value.items():

                formatted_key = (
                    key.replace("_", " ").title()
                )

                parts.append(
                    f"{formatted_key}: "
                    f"{self._format_value(val)}"
                )

            return "\n".join(parts)

        if isinstance(value, list):

            return "\n".join(
                f"- {self._format_value(item)}"
                for item in value
            )

        return str(value)

    def _build_metadata(
        self,
        card: Dict[str, Any]
    ) -> Dict[str, Any]:

        metadata = card.get("metadata", {})

        return {
            "concept_id": card.get("concept_id"),
            "concept_type": card.get("concept_type"),
            "title": card.get("title"),

            "derived_from": str(
                card.get("derived_from", [])
            ),

            "related_concepts": str(
                card.get("related_concepts", [])
            ),

            "act": metadata.get("act"),
            "jurisdiction": metadata.get("jurisdiction"),
            "language": metadata.get("language"),
            "review_status": metadata.get("review_status"),
            "version": metadata.get("version")
        }