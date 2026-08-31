?# PMa Environment Configuration

This document lists every environment variable across the three layers (backend, RAG, frontend), what it does, and the `.env` templates you should use.

## 7.1 Backend Configuration

**File location**: `backend/.env` (copy from `backend/.env.example`)

```bash
# ── Server ───────────────────────────────────────────────
NODE_ENV=development
PORT=3000

# ── Database (PostgreSQL via Prisma) ─────────────────────
DATABASE_URL="postgresql://postgres:aman@localhost:5432/legalbot"

# ── Authentication ───────────────────────────────────────
JWT_SECRET=40cd3aeb0fcca612fecd9a1a155e4f6223c285ad56fc3e2cd15af4b2d564a6e8
JWT_EXPIRES_IN=1d

# ── RAG Service connection ───────────────────────────────
RAG_API_URL="http://localhost:8000"
RAG_TOP_K=5

# ── CORS allowed origins (comma-separated) ───────────────
CORS_ORIGINS="http://localhost:5173"

# ── LLM Providers (at least one is required) ─────────────
GEMINI_API_KEY="your_gemini_api_key_here"
GEMINI_API_KEYS="your_gemini_key_1,your_gemini_key_2,your_gemini_key_3"
GROQ_API_KEYS="your_groq_key_1,your_groq_key_2,your_groq_key_3"

# Provider order, tried left to right. Groq leads by default: it is the
# faster provider and Gemini's free tier is the one that returns 503
# "high demand" under load. Flip this to "gemini,groq" without a code change.
LLM_PROVIDER_ORDER="groq,gemini"

# Two model tiers per provider. "fast" serves the small structured calls
# (intent classification, slot checks, retrieval-query rewriting) which are
# a few dozen characters and need speed, not depth. "quality" serves the
# user-facing legal answer. Sending a 47-character classification to a
# 120B model was pure latency and quota waste.
#
# Defaults use Groq's current catalogue: every meta-llama/* chat model was
# decommissioned in Aug 2026 and returns 404 model_not_found.
GROQ_MODEL="openai/gpt-oss-120b"
GROQ_FAST_MODEL="openai/gpt-oss-20b"
GEMINI_MODEL="gemini-flash-latest"
GEMINI_FAST_MODEL="gemini-flash-lite-latest"

# Per-call budgets. The fast tier gets a tight one so a stalled classification
# cannot eat the whole request.
LLM_TIMEOUT_MS=25000
LLM_FAST_TIMEOUT_MS=8000

# Logging: master on/off switch + verbosity (silent|error|warn|info|debug)
ENABLE_LOGS=true
LOG_LEVEL=debug

# ── Statute formatter fields (from v1-statute.jsonl) ─────
# Control which JSONL field holds the statute subject and its label.
STATUTE_SUBJECT_FIELD="subject"
STATUTE_LABEL_FIELD="label"

# ── Admin seeding ────────────────────────────────────────
ADMIN_USER_EMAIL="admin@example.com"
```

### Variable Reference Table

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | Yes | `development` | Runtime mode |
| `PORT` | Yes | `3000` | Backend listen port |
| `DATABASE_URL` | Yes | — | Prisma PostgreSQL connection string |
| `JWT_SECRET` | Yes | — | Signs auth tokens; use a long random value |
| `RAG_API_URL` | Yes | — | Base URL of the FastAPI service |
| `RAG_TOP_K` | No | `5` | Number of retrieved docs sent to LLM |
| `CORS_ORIGINS` | Yes | — | Comma-separated allowed browser origins |
| `GEMINI_API_KEY` | One of | — | Gemini provider key (single key) |
| `GEMINI_API_KEYS` | One of | — | Gemini provider keys (comma-separated) |
| `GEMINI_MODEL` | No | `gemini-flash-latest` | Gemini model name |
| `GEMINI_FAST_MODEL` | No | `gemini-flash-lite-latest` | Gemini fast model name |
| `GROQ_API_KEYS` | One of | — | Groq provider keys (comma-separated) |
| `GROQ_MODEL` | No | `openai/gpt-oss-120b` | Groq model name |
| `GROQ_FAST_MODEL` | No | `openai/gpt-oss-20b` | Groq fast model name |
| `LLM_PROVIDER_ORDER` | No | all configured | Failover order, e.g. `groq,gemini` |
| `LLM_TIMEOUT_MS` | No | `25000` | Overall timeout for quality calls (ms) |
| `LLM_FAST_TIMEOUT_MS` | No | `8000` | Overall timeout for fast calls (ms) |
| `ENABLE_LOGS` | No | `true` | Enable/disable logging |
| `LOG_LEVEL` | No | `debug` | Log level (silent|error|warn|info|debug) |
| `STATUTE_SUBJECT_FIELD` | No | `subject` | Verbatim statute subject field |
| `STATUTE_LABEL_FIELD` | No | `label` | Statute label field |
| `ADMIN_USER_EMAIL` | No | — | Email seeded as admin |

## 7.2 RAG Service Configuration

**File location**: Configuration is handled via environment variables and `RAG/src/config.py`

```bash
# There is no .env.example in the RAG directory.
# Configuration is done by setting environment variables directly or creating a .env file
# in the RAG project root (which is loaded by RAG/src/config.py).

# ── ChromaDB persistence ─────────────────────────────────
CHROMA_PERSIST_DIR="./data/chroma_db"
# Note: Collection name is hardcoded as "consumer_protection_act" in RAG/src/config.py

# ── Embedding model ──────────────────────────────────────
# Model used for the dense/vector leg of hybrid retrieval.
EMBEDDING_MODEL="sentence-transformers/all-MiniLM-L6-v2"

# ── Retrieval tunables (optional overrides) ──────────────
TOP_K=5
DENSE_CANDIDATES=30
BM25_CANDIDATES=20
DEFINITION_LIFT_RANK_CONST=44
DEFINITION_V1_LIFT_RANK_CONST=74
SECTION_LIFT_RANK_CONST=10
SECTION_LIFT_V2_RANK_CONST=46
SECTION_LIFT_V2_LIMIT=6
ROUTED_SECTION_LIFT_RANK_CONST=14
CONCEPT_ROUTE_RANK_CONST=42
MAX_ROUTED_STATUTE_SLOTS=2
MAX_ROUTED_CARD_SLOTS=2
MAX_EXAMPLES_IN_RESULT=2
MAX_RESERVED_SLOTS=2
TYPE_WEIGHTS_example=0.70
TYPE_WEIGHTS_relationship=0.55
TYPE_WEIGHTS_alias=0.40
TYPE_WEIGHTS_intent=0.40
```

### Config Module

**File**: `RAG/src/config.py`

The configuration loads environment variables from a `.env` file in the RAG project root (if it exists) or from system environment variables. Key configuration includes:

- `CHROMA_PERSIST_DIR`: Path to ChromaDB storage (defaults to "./data/chroma_db")
- `COLLECTION_NAME`: Hardcoded as "consumer_protection_act" 
- `DATA_PATH` and `V1_DATA_PATH`: Paths to knowledge card and statute JSONL files
- `EMBEDDING_MODEL`: Embedding model for vector search
- Retrieval constants: `TOP_K`, `DENSE_CANDIDATES`, `BM25_CANDIDATES`, various lift constants, slot budgets, and type weights
- `GEMINI_API_KEY`: For LLM services in the RAG pipeline

Note: The RAG service loads its .env file from the project root (same level as src/ directory), not from within the src/ directory.

## 7.3 Frontend Configuration

**File location**: `frontend/.env`

```bash
# Base URL of the backend API (used by the Vite proxy in dev).
VITE_API_BASE_URL="http://localhost:3000"
```

### Vite Proxy

In development, `frontend/vite.config.ts` proxies `/api` and `/messages` requests to `http://localhost:3000`, so the browser only talks to the Vite dev server (port 5173).

## 7.4 LLM Provider Behavior Details

The backend reads all configured providers and builds a failover chain.

- **Provider detection**: A provider is "configured" if its `API_KEY` is set and non-empty.
- **Provider order**: Controlled by `LLM_PROVIDER_ORDER`. Uses all configured providers even if not listed.
- **Key rotation**: Multiple keys per provider are supported (comma-separated in the env var).
- **Cooldown**: After a provider fails, it enters a cooldown period to avoid hammering a down service.
- **Timeouts**: 90s overall for quality mode, 30s for fast mode.

Example: only `GEMINI_API_KEY` set → only Gemini used. Both set → Gemini tried first, fallback to Groq on failure.

## 7.5 Prisma / Database

- Schema located at `backend/prisma/schema.prisma`
- Run `npx prisma migrate dev` in `backend/` to create tables
- Run `npx prisma db seed` to seed (admin user, etc.)
- `DATABASE_URL` must point at a running PostgreSQL instance

## 7.6 Swapping / Adding a Provider

To add a new provider (e.g. OpenAI):
1. Add a `ProviderId` value (`openai`) in `backend/src/services/llm.service.ts`
2. Add `OPENAI_API_KEY` / `OPENAI_MODEL` to `env.ts` and `.env.example`
3. Implement the request adapter in the provider client
4. Add `openai` to `LLM_PROVIDER_ORDER` as desired

## 7.7 Common Configuration Mistakes

| Symptom | Likely cause | Fix |
|---|---|---|
| RAG queries fail/timeout | `RAG_API_URL` wrong or RAG not running | Start RAG, verify URL `http://localhost:8000` |
| CORS errors in browser | `CORS_ORIGINS` missing frontend origin | Set to `http://localhost:5173` |
| 401 on auth routes | `JWT_SECRET` not set / changed | Set a stable secret |
| LLM fails with "no configured providers" | Neither `GEMINI_API_KEY` nor `GROQ_API_KEY` set | Add at least one key |
| Wrong statute citations | `STATUTE_SUBJECT_FIELD`/`STATUTE_LABEL_FIELD` mismatch JSONL | Align with your `v1-statute.jsonl` schema |
| Wrong top-k behavior | `RAG_TOP_K` too large/small | Default 5 is fine |