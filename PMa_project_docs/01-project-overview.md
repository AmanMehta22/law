# PMa - Legal Assistant Chatbot: Project Overview

## 1.1 Project Summary

**PMa** is a Legal Assistant Chatbot specialized in the **Indian Consumer Protection Act, 2019**. It provides RAG-powered legal Q&A with source citations, a structured intake wizard for case documentation, compensation/limitation calculators, document template generation, and conversation management with persistence.

## 1.2 Tech Stack

| Layer | Technology | Purpose | Port |
|-------|-----------|---------|------|
| **Frontend** | React 19, TypeScript, Vite, TanStack Query, TailwindCSS | User interface, API client, state management, streaming SSE | 5173 |
| **Backend** | Node.js, Express 5, TypeScript, Prisma ORM | API server, business logic, authentication, workflow orchestration | 3000 |
| **RAG Service** | Python, FastAPI, ChromaDB, LangChain, SentenceTransformers | Legal text retrieval, hybrid search, concept routing, PART A/PART B context splitting | 8000 |
| **Database** | PostgreSQL (via Prisma) | User data, conversations, messages, intake data | - |
| **Vector Store** | ChromaDB (local persistence) | Knowledge card storage and similarity search | - |
| **LLM** | Google Gemini (via `@google/genai`) | Answer generation, streaming, structured output, JSON mode | - |

## 1.3 Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │────►│   Backend       │────►│   RAG Service   │
│   (React/Vite)  │     │   (Express)     │     │   (FastAPI)     │
│   Port: 5173    │     │   Port: 3000    │     │   Port: 8000    │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                  │
              ┌─────────────────┼────────────┐
              ▼             ▼            ▼
        ┌─────────┐    ┌──────────┐  ┌──────────┐
        │PostgreSQL│    │  Redis   │  │ChromaDB  │
        │ (Prisma) │    │ (Session)│  │ (Vector) │
        └─────────┘    └──────────┘  └──────────┘
```

## 1.4 Key Features

- **RAG-powered legal Q&A** with source citations from Consumer Protection Act, 2019
- **5-step structured intake wizard** for case documentation (case type, parties, incident, evidence, relief sought)
- **Three legal calculators**: limitation period, pecuniary jurisdiction, statutory penalty
- **Document template generation** (complaint, legal notice, appeal)
- **Conversation management** with persistence and auto-recovery on refresh
- **Streaming response** via Server-Sent Events (SSE) for typewriter-style token delivery
- **Concept routing** mapping lay language to statutory provisions before retrieval
- **PART A/PART B context split**: verbatim statute (PART A) + interpretive material (PART B)
- **Multi-provider LLM failover** (Groq ↔ Gemini) with cooldown and retry logic
- **Jurisdiction thresholds** corrected to enacted values (₹1 crore, ₹10 crore) with proviso notes

## 1.5 Development Commands (3 Terminals)

```
Terminal 1: RAG Service
  cd RAG && py -3 main.py

Terminal 2: Backend
  cd backend && npm run dev

Terminal 3: Frontend
  cd frontend && npm run dev
```

## 1.6 Uncommitted Changes Summary

**Backend needs commit**:
- `ragAnswerFormatter.ts` - Major PART A/PART B refactor with statute integration
- `statuteIndex.ts` - Verbatim statute loader (v1-statute.jsonl, 276 nodes)
- `calculators.service.ts` - Jurisdiction thresholds fixed to enacted values
- Prompt files with `STATUTE_GROUNDING_RULES` shared across all prompts
- `vitest.config.ts`, `.gitignore`

**Frontend needs commit**:
- `TextAnswer.tsx` - Full markdown-ish renderer (headings, lists, bold/italic)
- `CalculatorsPage.tsx` - Corrected labels + prescribedValueNote display
- `api/calculators.ts` - prescribedValueNote in JurisdictionResult

**RAG needs commit**:
- `requirements.txt` - onnxruntime 3.14 fix, rank-bm25, sentence-transformers 6.0+
- Python 3.14 compatibility updates