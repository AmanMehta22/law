# PMa — Project Memory for OpenCode

> **Purpose:** This is the single source of truth for OpenCode to remember what is happening in this project across sessions. **Read this file at the start of every session and update it at the end.**
> **Rule:** Every time OpenCode is used, append to `## Session History` and update `## Current State` and `Last Updated`.

---

## Last Updated
- **Date:** 2026-09-01 14:35 +05:30
- **Branch:** `feature-frontend` at `e215f8c` (7 ahead of `26b5462`, 1 ahead of `03b769a`, not pushed)
- **HEAD:** `e215f8c feat: add complete LegalBot CPA 2019 system prompt` (legalBotCpaSystem 26 sections, 3 wrappers, memory)
- **Working tree:** Clean (`git status` no `M`, `e215f8c` committed)
- **By:** Muse Spark (opencode) — senior engineer, complete system prompt committed

---

## 1. Project Overview
**PMa (LegalBot CPA)** — RAG-powered legal assistant for **Consumer Protection Act, 2019 (India)**. Thesis: **statute-grounded, cited answers** via hybrid retrieval + LLM, with **PART A (verbatim statute) vs PART B (interpretive)** split to prevent hallucination.

**Shipped features:**
- RAG Q&A with citations (ChromaDB + hybrid dense+BM25 + concept routing + slot budgets)
- 5-step intake wizard (caseType → parties → incident → evidence → relief) → flattens to chat
- 3 calculators: Limitation `S.69` (2yr), Pecuniary jurisdiction `S.34/47/58` (₹1cr/₹10cr enacted + prescribedValueNote), Penalty
- Document templates (Complaint/Legal Notice/Appeal) — backend scaffolding only, **no PDF/DOCX or frontend surface** (known gap)
- Conversation persistence + auto-recovery + SSE streaming (typewriter) + multi-provider LLM failover (Groq ↔ Gemini, key rotation, cooldown)

**Ports (fixed):** Frontend `5173` → Backend `3000` → RAG `8000` + Postgres (`legalbot`) + ChromaDB `consumer_protection_v2` / `consumer_protection_act`.

---

## 2. Architecture

```
Frontend React19/Vite6/Tailwind4/TanStackQuery (5173)
   │ POST /api/messages SSE (X-Session-Id, Authorization)
   ▼
Backend Express5/TS/Prisma (3000) ──POST http://localhost:8000/query (30s)──▶ RAG FastAPI (8000)
   │  authMiddleware → validate → ownership check → workflowService → ragService → ragAnswerFormatter PART A/B → llmService.stream
   │         ↓
   │   Postgres (User, Conversation 1-1 IntakeData, Message sources/metadata Json)
   │   + Redis (planned)
   ▼
ChromaDB (RAG/data/chroma_db) — MiniLM 384d — 4,623 embeddings (4,147 cards + 476 statute chunks)
LLM: Groq openai/gpt-oss-120b/fast 20b + Gemini gemini-flash-latest/lite, failover groq→gemini, 25s/8s timeouts, 3 retries
```

**Chat flow:** `Composer.onSend` → `useSendMessage` optimistic + `STREAM_START` → `fetch POST /messages` → backend `auth → ownership → SSE headers + AbortController + heartbeat 15s` → `workflowService.processMessage(intent → retrievalQuery → ragService.query → PART A/B → llmService.stream)` → `status/delta/sources/done` → `chatReducer` guard `streamConversationId` → `BotMessageCard` + `SourceCards` → `localStorage activeConversation`.

---

## 3. Tech Stack

| Layer | Tech | Purpose |
|-------|------|---------|
| Frontend | React 19, Vite 6, Tailwind 4, TanStack Query, axios, MemoryRouter | Chat, SSE, state |
| Backend | Node 18+, Express 5, TS, Prisma 6.19, pino, @google/genai 2.15 | API, workflow, LLM |
| RAG | Python 3.10+, FastAPI 0.141, ChromaDB 1.5.9, langchain 1.3, sentence-transformers 5.6/6.0, onnxruntime 1.24 | Hybrid retrieval |
| DB | Postgres + Prisma, ChromaDB PersistentClient | Persistence + vectors |
| LLM | Groq (120b/20b) + Gemini (flash/latest) | Generation with failover |

---

## 4. Key File Roles (absolute)

**Backend `backend/src/`:**
- `server.ts` — `assertRequiredEnv()`, `logServiceStatuses()` dashboard (DB/RAG/LLM/JWT/CORS), `app.listen`, graceful shutdown
- `app.ts` — Express + helmet/cors/pino-http + routes
- `config/env.ts` — dotenv + `RAG_TOP_K`, `LLM_PROVIDER_ORDER groq,gemini`, models `openai/gpt-oss-120b`, timeouts, `assertRequiredEnv`
- `services/llm.service.ts` (890L) — `streamChat`, `withRetry` 3× 750/1500/3000, failover, 90s/30s timeouts
- `services/rag.service.ts` — `query()` POST :8000/query
- `utils/ragAnswerFormatter.ts` (536L) — PART A `[A1] Section X """verbatim"""` (budget 12k, 4/prov/card, breadth-first, statutory order) + PART B `[Source N]` with anchors
- `utils/statuteIndex.ts` — loads `v1-statute.jsonl` 276 nodes, `getStatuteNodes(derived_from)`
- `services/workflow.service.ts` — intent → case/document/general/calculator
- `controllers/message.controller.ts` — SSE `sendMessage` (ownership `conversation.userId !== req.user.sub`, headers `text/event-stream`, `AbortController`, heartbeat `:\n\n`, `flush()`)
- `prompts/statuteGrounding.rules.ts` — shared S1-S5 + PART A/B + citation rules
- `prompts/caseAnswer|generalAnswer|documentAnswer|informationChecker` — system prompts importing grounding
- `prisma/schema.prisma` — User, Conversation 1-1 IntakeData, Message (sources Json)

**Frontend `frontend/src/`:**
- `api/client.ts` — `apiClient` axios, `X-Session-Id` + Bearer, 401→clearAuth
- `api/messages.ts` — `streamMessage` fetch SSE buffered `\n\n` split, `slice(5).replace(/^ /,'')`, `receivedDone` guard
- `store/ChatContext.tsx` — `loadConversations`, `openConversation`, `beginAwaitingReply` polling 2.5s×60, `AbortController`
- `store/chatReducer.ts` — 16 actions, stream guard, `STREAM_CANCEL`
- `hooks/useSendMessage.ts` — TanStack mutation, optimistic, `settled` flag, `.catch` forwarding
- `components/UserMessageBubble.tsx` — `text + createdAt` → `11px right mt-1.5` time (added 2026-09-01)
- `components/BotMessageCard.tsx` — header + TTS + Copy + `is_out_of_scope`/`is_low_confidence` + `Verified/Draft` badges + `SourceCards` + `QuickReplyRow` + `disclaimer` + `time pt-1 right` (added 2026-09-01)
- `components/ConversationView.tsx` — renders `UserMessageBubble`/`BotMessageCard`, streaming `TextAnswer` + `elapsedSec` + `LoadingIndicator`
- `pages/ChatPage.tsx`, `CalculatorsPage.tsx` (3 calculators, INR, `prescribedValueNote`), `AuthPage.tsx`

**RAG `RAG/src/`:**
- `api.py` — `GET /health`, `POST /query {query,top_k}` → `retriever.retrieve`
- `retriever.py` (1252L) — hybrid RRF (dense 30 + BM25 20 + lifts 10/14/42 + slot budgets MAX_ROUTED 2 + TYPE_WEIGHTS), `route_query()` → `_hybrid_retrieve`, `warm()`, `explain()`, `_bm25_built` guard (added 2026-08-31)
- `concept_routing.py` (1014L) — 90+ `Route(priority 10-60)`, `route_query()`
- `vectorStore.py` — `PersistentClient chroma_db`, `consumer_protection_act`
- `config.py` — `CHROMA_PERSIST_DIR`, `EMBEDDING_MODEL MiniLM`, `TOP_K 5`
- `documentBuilder.py`, `ingest.py` — build corpus, `build_vector_store()` full rebuild

**Dataset `legal-dataset/`:**
- `schema/v1.schema.json`, `v2.schema.json`
- `acts/consumer-protection-act-2019/source/*.pdf`, `v1-statute/sections/*.json` (276, SHA-256), `v2-knowledge-cards/` (4,147: tier-a 195, tier-b 426, tier-c 3526), `final/v1-statute.jsonl` (276) + `final/v2-knowledge-cards.jsonl` (4,147)
- `review/progress.md`, `review-state.json`, `tools/build_section_map.py`

**Docs:** `PROJECT_WORKFLOW.md` (741L canonical), `PMa_project_docs/01..10` (each 77-1078L), `LegalBot_Status_Audit_2026-08-21.md`, `LegalBot_GoldLabel_Repair_2026-08-22.md`, `frontend_integration.md`, `RAG/README.md`, `RAG/eval/README.md`

---

## 5. Recent Work (6 Phase-wise Commits on top of 26b5462)

| # | Hash | Message (understandable) | Files | What |
|---|------|--------------------------|-------|------|
| 1 | `8e374bb` | Fix search so first question doesn't crash when two people ask at same time | `RAG/src/retriever.py` + `backend/src/config/env.ts` | `_bm25_built` guard + empty corpus `BM25=None`, `gemini-flash-lite-latest` |
| 2 | `7e448c0` | Show database, search and AI status table when backend starts | `backend/src/server.ts` | `logServiceStatuses()` DB/RAG/LLM/JWT/CORS table before `listen` |
| 3 | `d65cb2d` | Track each chat request with ID and log how long it takes | `requestContext.ts` NEW + `logging.middleware.ts` + `logger.ts` + `controllers/*` + `services/intent|llm|rag*` + `.gitignore` | `requestId` (`randomUUID` 8) via `AsyncLocalStorage`, `durationSec` |
| 4 | `8e151bd` | Answer directly if your message is clear, don't repeat same question | `caseWorkflow.service.ts` + `prompts/caseAnswer|informationChecker` | `isSufficientQuestion` bypass + `alreadyAskedIds` filter, YES/NO + `MVP FACT-SURFACING` |
| 5 | `9051b7f` | Make chat stream instantly, show wait time and add Stop button | `frontend/App|api/messages|Composer|ConversationView|BotMessageCard|LoadingIndicator|useSendMessage|ChatContext|chatReducer` + `UserMessageBubble` time | `AbortController`, `flush()`, `elapsedSec`, Stop, `STREAM_CANCEL` — **time below right added here** |
| 6 | `03b769a` | Add project workflow and audit notes | `PMa_project_docs/01..10` + `PROJECT_WORKFLOW.md` + `LegalBot_*` + `RAG/eval/live-probe.md` | Docs, `your_gemini_api_key_here` placeholder (secret removed) |

**Time feature (within #5, also separate `df14a1c` squashed):**
- `UserMessageBubble.tsx:1` `formatTime(iso) => toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})` → `text-[11px] text-neutral-500 text-right mt-1.5`
- `BotMessageCard.tsx:1` same `formatTime` + `text-right pt-1` below disclaimer
- `ConversationView.tsx:79` passes `msg.created_at`, streaming shows `new Date().toLocaleTimeString()`

**Before:** `26b5462` feat: conversation, auth, SSE hardening + ownership; `66bb5d6` fix 500→400/401/403/404.

---

## 6. System Prompt (current) — **UPDATED 2026-09-01 to COMPLETE 26-section LegalBot CPA**

**Canonical file (NEW):** `backend/src/prompts/legalBotCpaSystem.prompt.ts` (387L, 15280 bytes) — `LEGALBOT_CPA_SYSTEM_PROMPT` — the fixed 26-section system prompt from user's spec. **This is the single source of truth, never contains CPA JSON.**

**Implementation (as per user's requirement):**
```
SYSTEM PROMPT (legalBotCpaSystem.prompt.ts, fixed, 26 sections)
      +
USER QUESTION (current message + conversation history via formatConversation)
      +
RETRIEVED CPA CHUNKS (official_text via ragAnswerFormatter.ts: PART A verbatim """ + PART B [Source N])
      ↓
     LLM (llm.service.ts: systemPrompt + userPrompt)
      ↓
 LegalBot Answer (Short answer → Why → What you can do now → The law behind this → Important)
```

**Old prompts now wrappers (updated 2026-09-01):**
- `caseAnswer.prompt.ts` (now 30L) — `LEGALBOT_CPA_SYSTEM_PROMPT + STATUTE_GROUNDING + PLAIN_LANGUAGE + CASE-SPECIFIC echo facts + seller vs brand`
- `generalAnswer.prompt.ts` (now 20L) — `LEGALBOT_CPA_SYSTEM_PROMPT + ... + GENERAL-SPECIFIC (term everyday first, Yes/No first word)`
- `documentAnswer.prompt.ts` (now 25L) — `LEGALBOT_CPA_SYSTEM_PROMPT + ... + DOCUMENT-SPECIFIC (Heading→Parties→Facts→Legal grounds→Demand→Signature, placeholders)`
- All still import `statuteGrounding.rules.ts` (122L) for project-specific PART A/B + prescribed values.

**26 sections in new system:** 1 Primary Objective → 26 Final Instruction (Legal accuracy, Faithfulness, No hallucination, etc.), includes strict grounding (no invent section), multi-chunk reasoning, relevance filter, 7-step legal reasoning, answer format, citations `Section 2(20)`, statutory text, practical guidance, follow-up, insufficient/out-of-scope, no guaranteed outcomes, product liability rule (84-86 not auto), consumer-friendly, final disclaimer.

**Never:** Put entire CPA JSON into system prompt; put it only in `RETRIEVED CPA CHUNKS` via `ragAnswerFormatter.ts`.

---

## 7. Current State (to update every session)

- **Branch:** `feature-frontend` at `03b769a` (6 ahead of `26b5462`, clean)
- **Origin:** `origin/feature-frontend` at `03b769a` after `push --force` (merge `f1ef9bd` removed)
- **Working tree:** Clean (`git status` no `M`, `??` docs are intentional untracked)
- **Ports:** `5173` `3000` `8000` all healthy (`/health` 200, `/query 200` OK, `422` only on bad payload `topK` vs `top_k`)
- **RAG ingest:** Not needed unless `legal-dataset/final/*.jsonl` changed or `RAG/data/chroma_db` missing; `__pycache__` deleted is bytecode only
- **Time feature:** Live, `tsc PASS` frontend/backend
- **Git ignore:** Fixed `*.mjs/*.md` blanket removed, now `_tmp_*`, `probe-live.mjs`, `RAG/eval/live-probe.*`, `RAG/package-lock.json`
- **Known gaps (from audit):** Document generation no PDF/DOCX/frontend, intake flattens to chat, source cards only 4 fields, no rate limit, 88 cards json≠jsonl gate G6, no linter
- **Next to push:** Already pushed `03b769a` (force), 6 commits are on origin

---

## 8. Decisions & Conventions

- **Enacted-only:** CPA 2019 as enacted is scope; prescribed values are notifications, not Act — give enacted + proviso.
- **PART A/B:** Verbatim statute is authority, cards are interpretive `[Source N]` — fixes prior header bug.
- **No clause nodes:** Smallest is subsection (checksum G2), clause markers extracted and cited `Section 2(9)(iii)`.
- **Hybrid + routing + budgets:** Dense+BM25 RRF + 90+ routes (priority 10-60) + slot budgets (MAX_ROUTED 2) prevent crowding.
- **LLM failover:** Groq leads (faster), key rotation, cooldown, 2 tiers, timeouts.
- **Observability:** `requestId` + dashboard + heartbeat 15s.
- **Streaming resilience:** `settled` flag + `AbortController` + `STREAM_CANCEL` fixes hanging UI (audit blocker #1).
- **Time:** `11px neutral-500 right` below bubble, `created_at` ISO → `02:34 PM`.
- **Commit style:** Understandable messages, 6 phase-wise, `your_gemini_api_key_here` placeholder (never real keys in docs).

---

## 9. Session History (append every use)

| Date | By | What happened | Next |
|------|----|---------------|------|
| 2026-08-31 23:29 | Muse Spark | 6 phase commits created, time below right added, secret fixed (squash 50b329f → 6), merge f1ef9bd removed, push --force to 03b769a | Verify push, next: rate limit, document PDF, reconcile dataset |
| 2026-09-01 10:05 | Muse Spark | Created this memory.md (14.8k), full project scan, verified RAG 200 OK, frontend/backend tsc PASS, time feature live | Keep updating this file each session |
| 2026-09-01 14:30 | Muse Spark | Implemented COMPLETE LegalBot CPA 2019 system prompt (26 sections, 15k) as `legalBotCpaSystem.prompt.ts` (fixed), updated 3 wrappers (case/general/document) to use it, verified dynamic injection `SYSTEM + QUESTION + CHUNKS (official_text)` via `ragAnswerFormatter` PART A/B, tsc PASS | Next: commit + push, test RAG Q&A with new prompt |

> **Template for next entry:**
> ```
> | YYYY-MM-DD HH:mm | OpenCode | 1-line summary of work | Next step |
> ```

---

## 10. How OpenCode Should Use This File

1. **At session start:** `Read .opencode/memory.md` + `git log --oneline -5` + `git status` to recall context.
2. **During work:** Follow `## Decisions & Conventions` (enacted-only, PART A/B, placeholder keys).
3. **At session end:** Update `## Last Updated`, `## Current State`, and append to `## Session History` + update `## Recent Work` if new commits.
4. **Never** commit real API keys (use `your_..._here`), never use `*.md` blanket ignore, never delete `PMa_project_docs` without asking.
5. **Check:** `PROJECT_WORKFLOW.md` is canonical, `PMa_project_docs/01..10` are detailed; `RAG/data` is gitignored and needs `ingest.py` on fresh clone.

---

## 11. Quick Commands

```bash
# 3 terminals
cd RAG && uv run uvicorn src.api:app --reload  # 8000
cd backend && npm run dev                        # 3000
cd frontend && npm run dev                       # 5173

# Health
curl http://localhost:8000/health
curl http://localhost:3000/health
curl -X POST http://localhost:8000/query -H "Content-Type: application/json" -d '{"query":"test","top_k":5}'

# Git
git log --oneline -8
git status --porcelain
git push origin feature-frontend --force  # after history rewrite
```

---

*End of memory — update me every session.*
