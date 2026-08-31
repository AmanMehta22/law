?# PMa Testing & Evaluation

How the project is tested and evaluated across all three layers, including the RAG retrieval-quality evaluation with its measured results.

## 9.1 Testing Overview

| Layer | Framework | Coverage |
|---|---|---|
| Backend | Vitest + Supertest | Services (LLM, calculators, RAG), controllers, auth |
| Frontend | Vitest + React Testing Library | Hooks, reducers, API parsing, components |
| RAG | pytest (optional) + custom eval suite | Retriever correctness, retrieval quality |
| End-to-end | Manual checklist | Full user journey |

## 9.2 Backend Tests

**Run**: `cd backend && npm test`

Key test files (in `backend/src/**/__tests__/` or `backend/tests/`):

- **Calculators service** — verifies the corrected thresholds:
  - Limitation: 2-year period (Section 69), date math, day counting
  - Jurisdiction: Section 34 value thresholds (district / state / national forums)
  - Penalty: min/max penalty computation per violation type
- **LLM service** — verifies provider failover, key rotation, cooldown, timeout behavior, and that a partially-streamed response is not failed over.
- **RAG service client** — verifies request/response handling, timeout, malformed-response detection.
- **Auth / middleware** — JWT verification, ownership checks, validation.
- **Controllers** — SSE event ordering (status → delta → done).

### Calculator threshold expectations (from `calculators.service.ts`)

The correct Indian Consumer Protection Act 2019 thresholds used by tests:

| Concern | Section | Threshold |
|---|---|---|
| Limitation period | 69 | 2 years |
| District forum | 34(1) | up to ₹50 lakh |
| State commission | 34 | ₹50 lakh – ₹2 crore |
| National commission | 34 | above ₹2 crore |

## 9.3 Frontend Tests

**Run**: `cd frontend && npm test`

- **chatReducer** — verifies all stream actions: `STREAM_START`, `STREAM_DELTA`, `STREAM_STATUS`, `STREAM_SOURCES`, `MESSAGE_RECEIVED`, `STREAM_END`, `MESSAGE_SENT`, `CONVERSATION_STARTED`, `SET_ERROR`.
- **API SSE parser** — verifies `streamMessage`/`dispatchEvent` correctly handles the SSE `done` event and detects when the server ends unexpectedly (`receivedDone` logic).
- **toMessage()** — verifies `BackendMessageResult` → `Message` mapping (defaults, optional fields like `provider`, `quick_replies`, `is_low_confidence`).
- **Components** — rendering of `BotMessageCard`, `SourceCards`, `TextAnswer`, quick replies, disclaimers, confidence/review badges.

## 9.4 RAG Evaluation

**Run**: `cd RAG && py -3 eval/run_eval.py`

Evaluates retrieval quality against a set of labeled questions derived from the legal dataset (≈106 questions).

### Scoring

| Metric | Value |
|---|---|
| **Strict retrieval accuracy** | **73.6%** |
| **Content-level accuracy** (relevant content found) | **99.1%** |

- **Strict** counts a query as correct only if the top retrieved results exactly match the expected card(s).
- **Content** counts a query as correct if the expected content is present anywhere in the top-K, even if not ranked first.

### Category Breakdown

The eval set is grouped by legal category. Each category is scored on strict/content accuracy:

| Category | Queries | Strict | Content |
|---|---|---|---|
| (example) Unfair Trade Practices | — | — | — |
| (example) Restrictive Trade Practices | — | — | — |
| ... | — | — | — |

*(Populate the table from `eval/run_eval.py` output or the eval results log when you run it.)*

## 9.5 Retrieval-Improvement Mechanisms Covered by Eval

- Hybrid dense + BM25 retrieval (RRF fusion)
- Concept routing (lay → statutory language)
- Section lift for user-named sections
- Routed section/concept lift
- Definition lift for definition-style questions
- Canonical twin promotion (example ↔ definition/right)
- Type weights and slot budget enforcement

These mechanisms are what push content-level accuracy to ~99%.

## 9.6 Manual End-to-End Checklist

For a final pre-release smoke test:

1. Register a new user; login persists the token.
2. Send a general legal question ("Can I return a defective phone?") → bot streams an answer with source citations and a review badge.
3. Ask a definition question ("What is a restrictive trade practice?") → answer highlights the statutory definition.
4. Ask a question naming a section ("Tell me about Section 69") → eligible section is lifted and cited.
5. Use the Intake Wizard → compose a case → confirm context is passed in the request body.
6. Use the calculators (limitation / jurisdiction / penalty) and confirm correct thresholds.
7. Refresh mid-stream → confirm polling recovers the bot reply.
8. Quota test → send past the daily limit → confirm the 429 message.
9. Kill the RAG service → send a message → confirm a friendly timeout/error, not a crash.
10. Kill the primary LLM provider → confirm failover to the secondary provider.

## 9.7 Coverage Expectations

- Backend and frontend suites should be kept green before commits (`npm test`).
- The RAG eval should be re-run after any change to `retriever.py`, `concept_routing.py`, the dataset, or tuning constants, to confirm strict/content accuracy does not regress.
- Target: content accuracy ≥ 98%, strict accuracy trending up with routing coverage.