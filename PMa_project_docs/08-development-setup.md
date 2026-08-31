?# PMa Development Setup

How to get all three layers (Frontend, Backend, RAG) running locally, plus one-time data setup, Docker, and the lint/test/build commands.

## 8.1 Prerequisites

- **Node.js** (v18+) and npm
- **Python** (3.10+) with pip or a virtual environment
- **PostgreSQL** running locally (or via Docker)
- Recommended: three terminals, one per layer

## 8.2 One-Time Setup

### 1) Configure env files

Create each layer's env file from its example:

```bash
# Backend
copy backend\.env.example backend\.env
# edit backend\.env  (DATABASE_URL, JWT_SECRET, at least one LLM key)

# RAG
# Note: No .env.example exists in RAG/, create RAG\.env manually based on configuration
# requirements in 07-environment-configuration.md section 7.2

# Frontend
copy frontend\.env.example frontend\.env   # if an example exists
```

### 2) Install dependencies

```bash
# Backend
cd backend
npm install
npx prisma generate

# Frontend
cd ..\frontend
npm install

# RAG
cd ..\RAG
py -3 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### 3) Build / ingest the vector store (one-time)

The RAG service needs its ChromaDB collection populated before queries work:

```bash
cd RAG
.venv\Scripts\activate
py -3 ingest.py        # ingests dataset into ChromaDB
```

## 8.3 Running the Stack (3 Terminals)

### Terminal 1 — Backend (Port 3000)

```bash
cd backend
npm run dev
```

Runs the Express server with TypeScript watch mode (ts-node-dev / tsx). Health check: `http://localhost:3000/health`.

### Terminal 2 — RAG (Port 8000)

```bash
cd RAG
.venv\Scripts\activate
uvicorn api:app --reload --port 8000
```

Health check: `http://localhost:8000/health`. Docs: `http://localhost:8000/docs`.

### Terminal 3 — Frontend (Port 5173)

```bash
cd frontend
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` and `/messages` to the backend.

## 8.4 Database Migration & Seed

```bash
cd backend
npx prisma migrate dev      # create tables from schema.prisma
npx prisma db seed          # seed admin user + reference data (uses ADMIN_USER_EMAIL)
```

If using Docker for PostgreSQL:

```bash
docker run -d --name pma-db \
  -e POSTGRES_USER=pma -e POSTGRES_PASSWORD=secret \
  -e POSTGRES_DB=pma -p 5432:5432 postgres:16
```

## 8.5 Docker Compose (Optional)

If a `docker-compose.yml` exists at the repo root, it can run the full stack:

```bash
docker compose up --build
```

This typically brings up PostgreSQL, backend, RAG, and frontend together. Individual services:

```bash
docker compose up backend
docker compose up rag
docker compose up frontend
```

## 8.6 Lint, Test, Build Commands

### Backend

```bash
cd backend
npm run lint       # ESLint
npm run format     # Prettier
npm test           # Vitest unit/integration tests
npm run build      # Compile TS → dist/
npm run typecheck  # tsc --noEmit (if configured)
```

### Frontend

```bash
cd frontend
npm run lint
npm test           # Vitest + React Testing Library
npm run build      # Vite production build
```

### RAG

```bash
cd RAG
.venv\Scripts\activate
py -3 -m pytest            # if pytest tests exist
py -3 eval/run_eval.py     # run the RAG evaluation suite
```

## 8.7 Verification Checklist

After everything is running:

1. Backend up → `curl http://localhost:3000/health` returns 200.
2. RAG up → `curl http://localhost:8000/health` returns 200.
3. RAG has data → a test query returns results:
   ```bash
   curl -X POST http://localhost:8000/query -H "Content-Type: application/json" \
     -d '{"query":"refund defective product","top_k":3}'
   ```
4. Frontend loads at `:5173`, login/register works, sending a chat message streams a bot reply with source citations.
5. No CORS errors in browser console (see `CORS_ORIGINS`).

## 8.8 Common Startup Errors & Fixes

| Error | Fix |
|---|---|
| `datasource "db" has an invalid URL` | Fix `DATABASE_URL` in `backend/.env` |
| `RAG service unavailable` | Ensure RAG is running on port 8000, check `RAG_API_URL` |
| `401 Unauthorized` | Register/login first to obtain a token |
| `Module not found` on start | Re-run `npm install` in that layer |
| `No LLM providers configured` | Set `GEMINI_API_KEY` or `GROQ_API_KEY` |
| ChromaDB empty results | Run `py -3 ingest.py` in `RAG/` |