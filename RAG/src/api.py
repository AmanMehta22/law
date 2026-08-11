from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from src.config import TOP_K
from src.vectorStore import VectorStoreManager
from src.retriever import RAGRetriever


app = FastAPI(
    title="Legal RAG API",
    description="Legal RAG retrieval API",
    version="1.0.0"
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


# --------------------------------------------------
# Response Schema
# --------------------------------------------------

class QueryResponse(BaseModel):
    query: str
    results: list[dict]


# --------------------------------------------------
# Initialize Vector Store and Retriever
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
            request.query
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