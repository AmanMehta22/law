from pathlib import Path

# pyrefly: ignore [missing-import]
from src.config import DATA_PATH, V1_DATA_PATH
# pyrefly: ignore [missing-import]
from src.jsonLoader import JSONKnowledgeLoader
# pyrefly: ignore [missing-import]
from src.statuteLoader import JSONStatuteLoader
# pyrefly: ignore [missing-import]
from src.documentBuilder import DocumentBuilder, StatuteDocumentBuilder
# pyrefly: ignore [missing-import]
from src.vectorStore import VectorStoreManager


def main() -> None:
    print(f"Loading knowledge cards from: {DATA_PATH}")

    loader = JSONKnowledgeLoader(DATA_PATH)
    cards = loader.load()

    print(f"Loaded {len(cards)} knowledge cards")

    builder = DocumentBuilder(cards)
    documents = builder.build_documents()

    print(f"Built {len(documents)} card documents")

    print(f"Loading V1 statute nodes from: {V1_DATA_PATH}")

    statute_loader = JSONStatuteLoader(V1_DATA_PATH)
    nodes = statute_loader.load()

    print(f"Loaded {len(nodes)} statute nodes")

    statute_builder = StatuteDocumentBuilder(nodes)
    statute_documents = statute_builder.build_documents()

    print(f"Built {len(statute_documents)} statute documents")

    documents.extend(statute_documents)

    manager = VectorStoreManager()
    manager.reset()
    store = manager.create(documents)

    indexed = store._collection.count()

    print(f"Indexed {indexed} documents into collection '{store._collection.name}'")

    counts: dict[str, int] = {}

    for doc in documents:
        concept_type = doc.metadata.get("concept_type") or "none"
        counts[concept_type] = counts.get(concept_type, 0) + 1

    print("Per concept type:")
    for concept_type, count in sorted(counts.items()):
        print(f"  {concept_type}: {count}")

    source_counts: dict[str, int] = {}

    for doc in documents:
        source = doc.metadata.get("source", "unknown")
        source_counts[source] = source_counts.get(source, 0) + 1

    print("Per source:")
    for source, count in sorted(source_counts.items()):
        print(f"  {source}: {count}")


if __name__ == "__main__":
    main()