# RAG Service

Vector-search retrieval service for the LegalBot knowledge base (Consumer
Protection Act, 2019). Exposes a FastAPI server that the backend queries to
retrieve relevant knowledge cards before answering.

## Setup

```bash
uv sync
```

## Environment

Create a `.env` in the project root (`../.env`) with:

```
HF_TOKEN=hf_...        # Hugging Face token for the embedding model
```

## Run the server

```bash
uv run uvicorn src.api:app --reload     # http://localhost:8000
```

## Rebuild the vector index

```bash
uv run python -m src.ingest
```

This rebuilds the ChromaDB collection from the knowledge-base JSON files under
`../legal-dataset` (approximately 4,000+ documents).

## API

- `GET /health` — service health
- `POST /query` — body `{"query": "...", "top_k": N}` returns ranked results
  with metadata (`concept_type`, `review_status`, `title`, ...)