# LegalBot (PMa)

A RAG-powered legal assistant for India's **Consumer Protection Act, 2019**. It gives statute-grounded, cited answers — verbatim statute text (PART A) is kept separate from interpretation (PART B) to prevent hallucination.

## Architecture

Three services:

| Service | Stack | Port |
|---------|-------|------|
| `frontend/` | React + Vite + TypeScript | 5173 |
| `backend/` | Node.js + Express + Prisma | 3000 |
| `RAG/` | Python + FastAPI + ChromaDB | 8000 |

The backend rewrites the conversation into a retrieval query, calls the RAG API (hybrid dense + BM25 search with concept routing), and streams a cited answer from Groq/Gemini.

## Prerequisites

- Node.js 18+
- Python 3.10+ and [uv](https://docs.astral.sh/uv/)
- PostgreSQL
- API keys: Groq and/or Gemini

## Setup

```bash
# 1. Environment
cp backend/.env.example backend/.env   # fill in DATABASE_URL, JWT_SECRET, LLM keys
cp .env.example .env                   # HF_TOKEN (embedding model download)

# 2. RAG service (terminal 1)
cd RAG
uv sync
uv run uvicorn src.api:app --reload     # http://localhost:8000

# 3. Backend (terminal 2)
cd backend
npm i
npm run prisma:migrate
npm run dev                             # http://localhost:3000

# 4. Frontend (terminal 3)
cd frontend
npm i
npm run dev                             # http://localhost:5173
```

## Testing

```bash
cd backend && npm test        # vitest
cd RAG && uv run python eval/run_eval.py   # retrieval eval (106 questions)
```

## Project docs

- `PMa_project_docs/` — layer-by-layer architecture (frontend, backend, RAG, data flow)
- `PROJECT_WORKFLOW.md` — full user & developer workflow
- `legal-dataset/docs/` — knowledge-card schema and authoring rules
- `RAG/eval/` — retrieval evaluation harness
