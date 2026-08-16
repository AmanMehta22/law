from pathlib import Path

from langchain_chroma import Chroma

# pyrefly: ignore [missing-import]
from src.config import CHROMA_PATH, COLLECTION_NAME
# pyrefly: ignore [missing-import]
from src.embeddings import EmbeddingManager


class VectorStoreManager:

    def __init__(self):
        self.embedding_manager = EmbeddingManager()
        self.embedding_model = self.embedding_manager.get_model()

    def create(self, documents):
        """
        Create a Chroma vector store from the supplied documents.

        Use this when indexing the knowledge base for the first time
        or when the knowledge cards have changed.
        """

        vector_store = Chroma.from_documents(
            documents=documents,
            embedding=self.embedding_model,
            collection_name=COLLECTION_NAME,
            persist_directory=str(CHROMA_PATH)
        )

        return vector_store

    def reset(self) -> None:
        """
        Delete the existing collection so it can be rebuilt from scratch.
        """

        store = Chroma(
            collection_name=COLLECTION_NAME,
            embedding_function=self.embedding_model,
            persist_directory=str(CHROMA_PATH)
        )

        try:
            store.delete_collection()
        except Exception:
            pass

    def load(self):
        """
        Load the existing persistent Chroma vector store.

        This should be used by the production API so that embeddings
        are not regenerated for every request.
        """

        if not Path(CHROMA_PATH).exists():
            raise FileNotFoundError(
                f"Chroma database not found at: {CHROMA_PATH}"
            )

        vector_store = Chroma(
            collection_name=COLLECTION_NAME,
            embedding_function=self.embedding_model,
            persist_directory=str(CHROMA_PATH)
        )

        return vector_store