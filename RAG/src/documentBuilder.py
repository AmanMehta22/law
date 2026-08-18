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
            "source": "v2",
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


class StatuteDocumentBuilder:

    CHUNK_SIZE = 450
    CHUNK_OVERLAP = 60

    def __init__(self, statute_nodes: List[Dict[str, Any]]):
        self.statute_nodes = statute_nodes

    def build_documents(self) -> List[Document]:
        """
        Convert V1 statute nodes into LangChain Documents.

        Long official texts are split into overlapping chunks so that
        each embedding stays focused (the embedding model caps input
        length and long single-sentence definitions dilute retrieval).
        """

        documents = []

        for node in self.statute_nodes:
            base_metadata = self._build_metadata(node)
            chunks = self._chunk_text(self._build_text(node))

            for index, chunk in enumerate(chunks):
                metadata = dict(base_metadata)
                metadata["chunk_index"] = index
                metadata["chunk_total"] = len(chunks)

                documents.append(
                    Document(
                        page_content=chunk,
                        metadata=metadata
                    )
                )

        return documents

    def _chunk_text(self, text: str) -> List[str]:

        if len(text) <= self.CHUNK_SIZE:
            return [text]

        chunks = []
        start = 0

        while start < len(text):
            end = start + self.CHUNK_SIZE

            if end < len(text):
                cut = text.rfind(" ", start, end)

                if cut > start + self.CHUNK_SIZE // 2:
                    end = cut

            chunks.append(text[start:end].strip())
            start = end - self.CHUNK_OVERLAP

        return chunks

    def _clean_text(self, text: str) -> str:
        return text.replace("\ufffd", "'")

    def _section_ref(self, node: Dict[str, Any]) -> str:
        section = node.get("section_number")
        subsection = node.get("subsection_number")

        if isinstance(subsection, str) and subsection:
            return f"{section}{subsection}"

        return str(section)

    def _build_text(self, node: Dict[str, Any]) -> str:

        official_text = self._clean_text(node.get("official_text", ""))

        prefix = (
            f"Consumer Protection Act 2019; Section {self._section_ref(node)};"
        )

        if node.get("term"):
            prefix += f" term: {node['term']};"

        if node.get("content_type"):
            prefix += f" type: {node['content_type']};"

        return (
            f"{prefix}\n"
            f"Section {self._section_ref(node)} "
            f"of the Consumer Protection Act, 2019:\n"
            f"{official_text}"
        )

    def _build_metadata(self, node: Dict[str, Any]) -> Dict[str, Any]:

        metadata = node.get("metadata", {})

        content_type = node.get("content_type", "general")

        title = (
            f"Section {self._section_ref(node)} - CPA 2019"
            + (f" ({content_type}: {node.get('term')})"
               if node.get("term") else "")
        )

        return {
            "source": "v1",
            "v1_id": node.get("id"),
            "title": title,
            "node_type": node.get("node_type"),
            "content_type": content_type,
            "term": node.get("term"),
            "act_id": node.get("act_id"),
            "chapter_number": node.get("chapter_number"),
            "section_number": node.get("section_number"),
            "subsection_number": node.get("subsection_number"),
            "official_text": node.get("official_text"),
            "citations": str(node.get("citations", [])),
            "jurisdiction": metadata.get("jurisdiction"),
            "language": metadata.get("language"),
            "status": metadata.get("status")
        }