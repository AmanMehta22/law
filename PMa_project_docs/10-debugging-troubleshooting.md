?# PMa Debugging & Troubleshooting

Practical debugging workflow and fixes for the most common issues across the three layers.

## 10.1 Debugging Workflow (Top → Bottom)

When something fails, isolate the layer first:

1. **Frontend problem?** → Check browser console + Network tab. If the request reaches the backend, the problem is deeper.
2. **Backend problem?** → Check the backend terminal logs. Confirm the RAG call happened.
3. **RAG problem?** → Hit the RAG `/query` endpoint directly with `curl` to bypass the backend.

```
Step 1          Step 2            Step 3
Browser  ──►   Backend logs ──►   curl RAG /query
:5173          :3000             :8000
```

## 10.2 Quick Connection Probes

```bash
# Is the RAG service healthy?
curl http://localhost:8000/health

# Is the backend healthy?
curl http://localhost:3000/health

# Query RAG directly (bypasses backend)
curl -X POST http://localhost:8000/query \
  -H "Content-Type: application/json" \
  -d '{"query":"consumer refund defective product","top_k":3}'

# Test the backend calculator in isolation
curl -X POST http://localhost:3000/api/calculators/limitation \
  -H "Content-Type: application/json" \
  -d '{"causeOfAction":"2024-01-15"}'
```

## 10.3 Common Issues & Fixes

| Symptom | Layer | Likely cause | Fix |
|---|---|---|---|
| "Cannot reach the server" | Frontend | Backend not running or wrong `VITE_API_URL` | Start backend; verify URL/proxy |
| "Request failed (401)" | Frontend | Expired/invalid JWT | Clear token, log in again |
| "Daily AI quota reached" | Frontend | Daily limit hit (429) | Wait for reset or raise limit |
| CORS console error | Browser | `CORS_ORIGINS` wrong | Add frontend origin to `CORS_ORIGINS` |
| Empty/blank stream | Backend | RAG returned no results OR LLM error | Check RAG data (ingest), check LLM key |
| "RAG service timed out" | Backend | RAG down or slow/misconfigured | Start RAG; check `RAG_API_URL`; reduce load |
| "RAG returned HTTP 500" | Backend | Exception inside `api.py` | Check RAG terminal for traceback |
| Poor/irrelevant citations | RAG | Retrieval tuning or missing routing | Run `explain()`, inspect routing + scores |
| Wrong section cited | RAG/Backend | `STATUTE_SUBJECT_FIELD`/`LABEL` mismatch | Align formatter env with JSONL schema |
| "No LLM providers configured" | Backend | Missing API keys | Set `GEMINI_API_KEY` or `GROQ_API_KEY` |
| Chat stuck "Thinking…" | Frontend | SSE never reached `done` | Start RAG; check backend logs for thrown error |

## 10.4 Logging

- **Backend**: structured logs (pino/winston) with request IDs. Watch the RAG logger entries (`querying RAG service`, `RAG retrieval succeeded`).
- **RAG**: FastAPI prints request logs and any exceptions as tracebacks to the RAG terminal.
- **Frontend**: browser devtools console + Network tab for SSE event inspection.

To enable verbose RAG logging, set the config/log level in `RAG/src/config.py`.

## 10.5 Inspecting the Retrieval Pipeline (explain)

The retriever ships a debug method showing exactly what was routed, lifted, and scored for a query — the fastest way to debug retrieval quality.

```bash
cd RAG
.venv\Scripts\activate
py -3 -c "
from src.retriever import RAGRetriever
from src.vectorStore import VectorStoreManager
import json
manager = VectorStoreManager()
retriever = RAGRetriever(manager.load())
print(json.dumps(retriever.explain('gym forces me to buy their protein powder'), indent=2))
"
```

### Example `explain()` output (structure)

```json
{
  "query": "gym forces me to buy their protein powder",
  "normalized_query": "restrictive trade practice tie up sales conditions ...",
  "concept_routing": {
    "matched_routes": ["tie_in_or_forced_purchase"],
    "concepts": ["definition.restrictive_trade_practice"],
    "sections": ["2(41)"],
    "lift_targets": [["2", "41"]]
  },
  "section_targets": [],
  "candidates": {
    "dense": 30,
    "bm25": 20,
    "definition_lift": 0,
    "section_lift": 0,
    "routed_section_lift": 1,
    "routed_concept_lift": 2
  },
  "final_scores": [
    { "id": "definition.restrictive_trade_practice", "score": 0.907, "type": "definition" },
    { "id": "right.refusal_to_deal", "score": 0.611, "type": "right" },
    { "id": "example.forced_purchase", "score": 0.54, "type": "example" }
  ],
  "selected": {
    "id": ["definition.restrictive_trade_practice", "right.refusal_to_deal"],
    "metadata": { "...": "..." }
  }
}
```

Use this to confirm:
- The route was matched (lay language → statutory terms worked).
- The right concepts were force-included.
- The final ranking reflects the expected knowledge cards.

## 10.6 Debugging the SSE Stream

To see exactly which events the backend sends:

```bash
curl -N -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"message":"Can I return a defective phone?"}'
```

You should observe the event sequence:

```
event: status
data: {"status":"Finding relevant sections..."}

event: delta
data: {"token":"Yes"}

event: delta
data: {"token":", you"}

...

event: sources
data: {"type":"sources","sources":[...]}

event: done
data: {"data":{...}}
```

If you only see `status` and no deltas, the RAG or LLM step is failing — check those terminals.

## 10.7 Debugging a Failed RAG Call in the Backend Logs

Look for these markers:

```
INFO [rag] Querying RAG service {"url":"http://localhost:8000/query","topK":5}
ERROR [rag] RAG service request failed {"duration":"30000ms","error":"AbortError ..."}
```

- `AbortError` → 30s timeout; RAG was unreachable.
- `RAG service unavailable: fetch failed` → network/DNS, wrong URL.
- `RAG service returned HTTP 500` → bug inside `api.py`/`retriever.py`.

## 10.8 Resetting / Rebuilding

### Re-ingest the vector store (fix "no results")

```bash
cd RAG
.venv\Scripts\activate
py -3 ingest.py        # rebuilds ChromaDB collection
```

### Reset the database

```bash
cd backend
npx prisma migrate reset   # drops & re-migrates & reseeds
```

### Clear frontend auth/state

In the browser: clear localStorage for the app (token, activeConversation, sessionId) and reload.