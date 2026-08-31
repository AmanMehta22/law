# LegalBot — Repository Status Audit

**Date:** 2026-08-21 · **Branch:** `feature-frontend` (not merged to `dev`/`main`) · **Working tree:** clean
**Verification:** `backend` and `frontend` both pass `tsc --noEmit`. Test suites could not be executed from the audit sandbox (see *Caveats*).

---

## Executive summary

The project is considerably further along than its own documentation suggests. The legal dataset, the retrieval service, and the streaming chat pipeline are all genuinely finished and wired together end to end — a user can register, ask a consumer-law question, and receive a statute-grounded answer with sources. That is the core thesis of the project and it works.

What remains splits into three unequal piles. First, three small but blocking defects — one of which hangs the entire UI on any network error — that gate a demo or user test. Second, one large missing feature: document generation exists as prompt scaffolding but produces no downloadable file and has no frontend at all, despite the landing page advertising it. Third, a quality-assurance regression in which ad-hoc patch scripts desynchronised the canonical dataset and invalidated the acceptance gates, so the accuracy claims are currently unverified rather than disproven.

The honest one-line status: the hard, interesting problems are solved; the remaining work is mostly hardening, one significant feature, and re-establishing trust in the dataset.

---

## Layer 1 — Legal dataset (`legal-dataset/`)

**Status: complete, with one integrity regression.**

This is the strongest part of the repository. The Consumer Protection Act 2019 has been decomposed into 276 verbatim statute nodes (V1) across all eight chapters and all 47 definitions, each carrying a SHA-256 checksum of its official text. From those, 4,147 knowledge cards (V2) were derived across sixteen concept types — definitions, procedures, penalties, offences, timelines, obligations, rights, remedies, exceptions, evidence, authorities, jurisdiction, plus four search-support types. Every card records the V1 node IDs it descends from, which is what makes citation-grounded answers possible rather than aspirational.

Review was thorough and well documented. Tier A (195 cards) and Tier B (426 cards) were reviewed at 100 percent against source text with 59 source-backed corrections applied; Tier C (3,526 cards) was reviewed in a later pass with 243 corrections. Eight acceptance gates — schema validation, checksum integrity, ID uniqueness, no orphan references, full V1 coverage, merge consistency, Tier A completeness, and vocabulary conformance — all passed on 2026-08-04.

The regression is that three ad-hoc scripts at the RAG root (`_tmp_patch_cards.py`, `_tmp_rephrase.py`, `_tmp_fix3.py`) write directly into `final/v2-knowledge-cards.json` with no backup, no schema revalidation, and no gate re-run. The companion `.jsonl` was never regenerated, so **88 cards now differ in content between the two files** — mostly `content` fields, concentrated in definitions and examples. Gate G6 (json equals jsonl) no longer holds. Nothing is corrupt, but the "all eight gates pass" statement is now only true as of 2026-08-04.

Two further items to be aware of. Four V1 statute files carry known text defects that were logged but never fixed — a silent truncation in s.38(1), stray margin-note text in s.37(2) and s.101(2), and a stray "importing" in s.91(1) — and these are embedded in the live index. And `search-augmentation.json` (533 entries, 730 KB) is referenced nowhere in either the RAG service or the backend; it is dead data, since the intents it aggregates already exist as 1,820 standalone indexed cards.

## Layer 2 — RAG retrieval service (`RAG/`)

**Status: complete and running.**

A retrieval-only FastAPI service — deliberately no LLM, since generation lives in the backend. Documents are embedded with a local HuggingFace MiniLM model (384-dimensional, CPU, normalised) into a persistent Chroma store. Knowledge cards are indexed one document per card with no chunking; statute nodes are chunked at 450 characters with 60-character overlap.

Retrieval is genuinely sophisticated rather than a naive similarity search. Four candidate sources are generated and fused by rank-based scoring: dense vector search over knowledge cards, BM25 keyword search over the same corpus, a definition lift that detects "what is X" style queries and pulls the matching definition cards plus statute heads, and a section lift that recognises explicit section or subsection references and injects the corresponding statute chunks with the largest boost in the system. Query normalisation strips act-name noise and expands a hand-written synonym map.

The index exists and is current: 4,623 embeddings (4,147 cards plus 476 statute chunks), last written after the most recent card patches, so it reflects the patched JSON. The service exposes exactly two endpoints, `GET /health` and `POST /query`.

Caveats worth knowing rather than fixing urgently. There is no reranker or cross-encoder. The store and retriever are constructed at module import, so a missing index means the process fails to start rather than degrading gracefully — and since `RAG/data` is gitignored, a fresh clone must run ingestion before the API will boot at all. BM25 and the definition index build lazily on the first query by scanning the whole collection into memory, which the backend's 30-second timeout has to absorb. Ingestion is a full rebuild with no incremental upsert, and because the reset path does not reclaim HNSW segment directories, the store has grown to 273 MB across 25 segment folders with only one live; two further orphaned vector stores sit alongside it.

An evaluation harness does exist (`RAG/eval/`) measuring recall@5 over 106 questions, plus a 150-question answer-quality grading set. Both are stale — the last run predates the current index — and the results are sobering: strict recall@5 of 0.736, and answer grading at a mean of 79/100 with 29 major failures out of 145 graded. The harness itself also documents unfixed retrieval defects and, more seriously, that **jurisdiction monetary limits in the dataset are pre-2021** and some section numbering drifts from the real Act. For a consumer-facing legal tool that is a substantive accuracy risk and deserves attention ahead of most of the engineering work listed below.

> **Correction, 2026-08-22.** The jurisdiction point above is withdrawn. The figures in the dataset are the ones the Act enacts, and the later limits were prescribed by notification under the proviso to s.34(1)/s.47(1)(a)(i)/s.58(1)(a)(i) rather than by amending the Act. The project's scope is now fixed as the Consumer Protection Act, 2019 as enacted, so prescribed values are deliberately out of scope: the enacted figure is stated, the prescribing proviso is surfaced, and the user is told to check the value currently in force. Nothing in the dataset needs changing. What did need changing was `backend/src/services/calculators.service.ts`, which shipped the prescribed figures while citing the Act's sections — fixed the same day.

## Layer 3 — Backend (`backend/`)

**Status: core complete; auth hardening and document output outstanding.**

Eleven endpoints across auth, conversations, messages, calculators, intake requirements, document templates, and health. Compiles cleanly.

The chat pipeline is complete with no stubs anywhere in the path. A message flows from the controller through intent classification into one of three workflows — general question, specific case, or document request — each of which builds a retrieval query, calls the RAG service, formats a grounded prompt, streams tokens from the LLM, and persists the full response envelope. Streaming is real Server-Sent Events with four event types and proper write guards.

The LLM layer is the most mature code in the repository: Gemini as primary with multi-key round-robin, per-key quota cooldown, exponential backoff with jitter, layered timeouts, and a Groq fallback. It is also the best tested.

Slot-filling works but is stateless. An information-checker LLM call decides whether enough case detail has been gathered, and if not, the lowest-priority missing field's question is returned. Seven fields are defined. The gap is that slot state is never persisted — there are no slot columns in the schema, so every turn re-derives state by re-reading the entire message history through an LLM call. The `required` flag on optional fields is inert; nothing reads it.

Both calculators are complete and correct: a two-year limitation period citing section 69, and pecuniary jurisdiction thresholds citing sections 34, 47, and 58. They are, however, not reachable from chat — no workflow calls them — so asking the bot whether a claim is time-barred runs retrieval rather than the calculator.

Document generation is the significant gap. Three templates exist and the LLM fills their placeholders using retrieved statute context, but **there is no PDF or DOCX generation anywhere** — no such dependency, no download endpoint, no file storage, no generated-document model. Output is plain text in the response string. The document branch also skips slot-filling entirely, drafting immediately from the first message and leaving `[placeholder]` markers for everything absent.

Two things to know about what users are shown: confidence scores and review-status badges are **heuristics computed in the backend** (0.9 per reviewed card, 0.5 per draft, 0.2 if none) rather than model outputs, and `suggested_follow_ups` is assigned the same array as `quick_replies`, so it is a duplicate field rather than independent content.

`backend.md` documents roughly a v0.3 codebase and should be treated as stale — it lists RAG as "next", shows the message endpoint returning JSON, and omits four route groups.

## Layer 4 — Frontend (`frontend/`)

**Status: chat experience complete; document surface entirely absent.**

React 19, Vite 6, Tailwind v4, TanStack Query, with a well-structured reducer for chat state. Compiles cleanly. Three pages — auth, chat, calculators — all reachable.

The chat experience is finished and better than the documentation claims. Server-Sent Events are parsed properly with buffered frame handling, status messages and token deltas render live with a typing caret, optimistic user messages appear before the request, retry removes and resends, and conversation history loads on mount and on tab focus with the active conversation persisted across reloads. Voice input via the Web Speech API with English and Hindi variants is implemented and documented nowhere. The legal disclaimer is properly displayed both as a banner and per message. The calculators page is genuinely complete, with Indian-locale currency formatting and section citations.

Three gaps stand out. **Document generation has zero frontend surface** — no API module, no download button, no blob or print or PDF handling anywhere — while the landing page advertises "Draft Legal Notices Instantly" and a "Legal Notice Generator with copy and download tools". **Source cards render only four metadata fields**, so the `content`, `key_points`, and especially `derived_from` statute-node references are fetched, typed, and then never displayed; section numbers appear only inside free-text prose, meaning there is no clickable citation surface despite the data being present. And **the intake wizard does not actually do slot-filling** — on completion it flattens all answers into one English sentence and sends it as an ordinary chat message, never populating the intake context, so the `context` field in the request body is never sent at all.

Smaller items: routing uses `MemoryRouter`, so there are no URLs, no deep links, and no browser back button; the auth guard keys off a boolean string in `localStorage` rather than the token, so it is trivially bypassable client-side (the backend still enforces properly); there is no abort handling, so switching conversations mid-stream leaves the request and backend generation running.

---

## Confirmed blockers

These three were verified by reading the code directly, not inferred.

**1. Stream errors hang the UI permanently.** In `frontend/src/hooks/useSendMessage.ts:56-78`, `streamMessage()` is called inside a `new Promise` executor with no `.catch(reject)` and no `await`. The `reject` parameter is declared and never used. `streamMessage` throws on unreachable server, 401, 429, any non-OK status, malformed SSE, and a missing `done` event. Every one of those becomes an unhandled rejection: the outer promise never settles, `onError` never fires, no error is dispatched, and `isSending` stays true forever — spinner spinning, composer disabled, no message, no retry, recoverable only by reloading the page. All the careful error copy in `api/client.ts` is unreachable for streamed sends. This is a two-line fix and it is the highest-priority item in the repository.

**2. No ownership check on message send.** The workflow services build `conversation = { id: conversationId }` straight from the request body without verifying it belongs to the authenticated user — see `backend/src/services/caseWorkflow.service.ts:49-51` and the equivalent lines in the general and document workflows. A user can append messages to another user's conversation and receive answers grounded in that conversation's history. `GET /conversations/:id` does check ownership; the write path does not.

**3. Error conditions return HTTP 500.** Bare `throw new Error(...)` in `auth.service.ts:29,36` and `conversation.service.ts:16,20` bypasses the `instanceof AppError` check in the error middleware, so invalid credentials, unauthorised access, and not-found all surface as 500 with a generic message. The same class of bug in `validation.middleware.ts:6` means every Zod validation failure returns 500 rather than 400.

## Other outstanding work

**Security and robustness.** No rate limiting on any route, though `/messages` triggers two to three LLM calls per request. CORS is wide open. No environment validation at boot, so a missing `JWT_SECRET` silently defaults to an empty string and the server signs tokens with it. An unguarded `JSON.parse` of LLM output in `intent.service.ts:17`. An unguarded dereference in `caseWorkflow.service.ts:96` that the knowledge service's own test proves is reachable. No client-disconnect handling, so navigating away leaves generation and the database write running. The logger unconditionally loads a dev-only pretty-printer, so a production install with dev dependencies omitted crashes at import.

**Cleanup.** Six `_tmp_*.mjs` scratch files are committed at the backend root (an answer-quality eval harness with hardcoded absolute Windows paths, a hardcoded JWT secret, and a hardcoded user ID) plus seven `_tmp_*.py` scripts at the RAG root; `.gitignore` has no `_tmp*` rule. Two zero-byte files (`test.controller.ts`, `test.routes.ts`) are committed with a commented-out mount. No linter or formatter is configured in either package. Both `.env.example` files are out of sync with what the code reads. A meaningful amount of typed-but-unrendered frontend code exists — the whole card content union, `document_draft`, `checklist_ref`, `is_out_of_scope`, `answer_format` branching.

**Testing.** Coverage inverts the risk profile. The two best-tested backend units are thin I/O adapters, while the orchestration layer containing all the branching logic and every bug above — the workflow router, intent service, three workflows, and answer builder — has no tests, as does the entire auth and authorisation surface. There are no HTTP-level or integration tests. The frontend has exactly one test file, a good one covering the reducer, but nothing for the SSE parser (the highest-risk untested code), the send hook, the chat context, or any component. The RAG service has no tests at all.

---

## Suggested order of work

1. Fix the three blockers — small, localised, and they gate any demo or user test.
2. Reconcile the dataset `.json` and `.jsonl`, re-run schema validation and the acceptance gates, then re-run the retrieval eval against the current index so accuracy claims are backed by measurement again.
3. Correct the pre-2021 jurisdiction limits and the section-numbering drift, since these are legal-accuracy defects in a consumer-facing legal tool. *(Superseded 2026-08-22: the dataset figures are the enacted ones and are correct. The real defect was in the backend calculator, which shipped prescribed figures under the Act's section numbers; that is fixed. Prescribed values are out of scope — see the correction note above.)*
4. Render `derived_from` statute citations in the source cards — the data is already fetched and typed, so this is high value for low effort and directly serves the "verifiable, not hallucinated" goal.
5. Build document generation properly: file output, a download endpoint, and a frontend surface — or remove the landing-page claims until it exists.
6. Then the hardening backlog: rate limiting, environment validation, error-class corrections, tests on the orchestration layer, linting, scratch-file cleanup, and secret rotation.

---

## Caveats

Test suites could not be executed. `node_modules` was installed on Windows, so native bindings fail under the Linux audit sandbox (`Cannot find native binding … @rolldown/binding-wasm32-wasi`). Type-checking ran fine in both packages because it is pure JavaScript, and both passed. Whether the test suites currently pass is therefore unverified and should be checked on Windows.

Findings are from static reading plus read-only inspection of the vector store, not from running the application. Where a claim depended on runtime behaviour it is flagged as such above.
