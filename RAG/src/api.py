import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from src.config import TOP_K
from src.vectorStore import VectorStoreManager
from src.retriever import RAGRetriever


logger = logging.getLogger("rag.api")


# --------------------------------------------------
# Initialize Vector Store and Retriever
#
# Built once at import so the embedding model is loaded a single time and
# embeddings are never regenerated per request.
# --------------------------------------------------

vector_store_manager = VectorStoreManager()

vector_store = vector_store_manager.load()

retriever = RAGRetriever(
    vector_store=vector_store,
    k=TOP_K,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pay the one-time retrieval costs at startup so the FIRST user query does
    # not: building the BM25 index is a full-corpus scan plus tokenisation, and
    # the embedding model's first forward pass has its own warm-up. Best-effort
    # - a warm failure must never stop the service from starting.
    try:
        retriever.warm()
        logger.info("RAG retriever warmed at startup")
    except Exception as exc:  # noqa: BLE001 - startup must be resilient
        logger.warning("RAG warmup skipped: %s", exc)

    yield


app = FastAPI(
    title="Legal RAG API",
    description="Legal RAG retrieval API",
    version="1.0.0",
    lifespan=lifespan,
)


# --------------------------------------------------
# Request Schema
# --------------------------------------------------

class QueryRequest(BaseModel):
    query: str = Field(
        ...,
        min_length=1,
        description="User's legal query"
    )
    top_k: int | None = Field(
        default=None,
        ge=1,
        le=20,
        description="Number of results to return (defaults to TOP_K)"
    )


# --------------------------------------------------
# Response Schema
# --------------------------------------------------

class QueryResponse(BaseModel):
    query: str
    results: list[dict]


# --------------------------------------------------
# Health Check
# --------------------------------------------------

@app.get("/health")
def health_check():

    return {
        "status": "healthy"
    }


# --------------------------------------------------
# Query
# --------------------------------------------------

@app.post(
    "/query",
    response_model=QueryResponse
)
def query_rag(request: QueryRequest):

    try:

        documents = retriever.retrieve(
            request.query,
            k=request.top_k
        )

        results = []

        for document in documents:

            results.append({
                "content": document.page_content,
                "metadata": document.metadata
            })

        return {
            "query": request.query,
            "results": results
        }

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )