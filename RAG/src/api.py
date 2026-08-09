
from pydantic import BaseModel, Field
from fastapi import FastAPI, HTTPException

from src.config import TOP_K
from src.retriever import RAGRetriever
from src.vectorStore import VectorStoreManager



app = FastAPI(
    title="Legal RAG API",
    description="RAG API for the Consumer Protection Act knowledge base",
    version="1.0.0"
)


# --------------------------------------------------
# Request / Response Schemas
# --------------------------------------------------

class QueryRequest(BaseModel):
    query: str = Field(
        ...,
        min_length=1,
        description="User's legal question"
    )


class Source(BaseModel):
    concept_id: str | None = None
    concept_type: str | None = None
    title: str | None = None


class QueryResponse(BaseModel):
    query: str
    sources: list[Source]


class HealthResponse(BaseModel):
    status: str


# --------------------------------------------------
# Initialize RAG components ONCE
# --------------------------------------------------

vector_store_manager = VectorStoreManager()

vector_store = vector_store_manager.load()

retriever = RAGRetriever(
    vector_store=vector_store,
    k=TOP_K
)


# --------------------------------------------------
# Health Check
# --------------------------------------------------

@app.get(
    "/health",
    response_model=HealthResponse
)
def health_check():

    return {
        "status": "healthy"
    }


# --------------------------------------------------
# Query Endpoint
# --------------------------------------------------

@app.post(
    "/query",
    response_model=QueryResponse
)
def query_rag(request: QueryRequest):

    try:

        results = retriever.retrieve(
            request.query
        )

        sources = []

        for document in results:

            sources.append(
                Source(
                    concept_id=document.metadata.get(
                        "concept_id"
                    ),
                    concept_type=document.metadata.get(
                        "concept_type"
                    ),
                    title=document.metadata.get(
                        "title"
                    )
                )
            )

        return QueryResponse(
            query=request.query,
            sources=sources
        )

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail="An error occurred while processing the query."
        )