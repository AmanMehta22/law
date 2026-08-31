?# PMa Complete Data Flow: User Request → RAG → Response

This document explains the complete end-to-end flow of a user request through the frontend, backend, and RAG service, including the reverse path back to the user.

## 5.1 Complete Request Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (React/Vite, Port 5173)               │
│                                                                             │
│  User types message                                                        │
│       │                                                                      │
│       ▼                                                                      │
│  Composer component → handleSendMessage()                                   │
│       │                                                                      │
│       ▼                                                                      │
│  useSendMessage() mutation (React Query)                                    │
│       │                                                                      │
│       ├─► 1. Create user message object (optimistic)                        │
│       ├─► 2. Dispatch MESSAGE_SENT to chatReducer                           │
│       ├─► 3. Dispatch STREAM_START + STREAM_STATUS "Thinking..."            │
│       └─► 4. Call streamMessage() API function                              │
│                       │                                                      │
│                       ▼                                                      │
│              POST /api/messages (SSE stream)                                │
│              Headers: Content-Type, Accept: text/event-stream,              │
│                       X-Session-Id, Authorization: Bearer JWT               │
│              Body: { conversationId, message, context? }                    │
└───────────────────────────┬───────────────────────────────────────────────┘
                            │ (Axios/fetch proxy via Vite → localhost:3000)
                            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BACKEND (Express/TS, Port 3000)                │
│                                                                             │
│  /api/messages → authMiddleware → validate → messageController               │
│       │                                                                      │
│       ├─► 1. Ownership check: conversation belongs to user?                 │
│       ├─► 2. Set SSE headers, create AbortController, start heartbeat      │
│       └─► 3. Call workflowService.processMessage()                          │
│                       │                                                      │
│                       ▼                                                      │
│              workflowService.processMessage()                               │
│                       │                                                      │
│                       ├─► Classify intent (LLM)                             │
│                       │     - GENERAL_QUERY → generalWorkflow               │
│                       │     - CASE_ANALYSIS → caseWorkflow                  │
│                       │     - DOCUMENT_QA → documentWorkflow                │
│                       │     - CALCULATOR → calculatorsService              │
│                       │                                                      │
│                       └─► LLM generates retrieval query (optimized)         │
│                                 │                                             │
│                                 ▼                                             │
│                       ragService.query(query)                                │
│                                 │                                             │
│                                 ▼                                             │
│                       POST http://localhost:8000/query                       │
│                       Headers: Content-Type: application/json               │
│                       Body: { query, top_k: 5 }                              │
└───────────────────────────┬───────────────────────────────────────────────┘
                            │ (network)
                            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       RAG SERVICE (FastAPI, Port 8000)                     │
│                                                                             │
│  /query → retriever.retrieve(query, k=5)                                    │
│       │                                                                      │
│       ├─► route_query(query)  ← Lay-language → statutory routing            │
│       │       │                                                              │
│       │       ├─► Match against 90+ Route patterns                          │
│       │       └─► Return concepts, terms, sections, lift_targets            │
│       │                                                                      │
│       ├─► _normalize_query(query, routed_terms)                              │
│       ├─► _section_targets(query)                                            │
│       │                                                                      │
│       └─► _hybrid_retrieve()                                                 │
│               │                                                              │
│               ├─► Dense search (ChromaDB, filter source=v2, k=30)            │
│               ├─► BM25 search (k=20)                                         │
│               ├─► Definition lift (if definition-style query)               │
│               ├─► Section lift (user-named sections, const=10)              │
│               ├─► Routed section lift (inferred, const=14)                  │
│               ├─► Routed concept lift (force-included, const=42)            │
│               ├─► RRF fusion + type weights                                  │
│               ├─► Canonical twin promotion                                   │
│               └─► Slot budget enforcement (_select_ids)                      │
│                       │                                                      │
│                       ▼                                                      │
│              Returns top-K Document[] with metadata                          │
└───────────────────────────┬───────────────────────────────────────────────┘
                            │ (HTTP response JSON)
                            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BACKEND (Port 3000) - Response                      │
│                                                                             │
│  ragService.query() returns RagResponse                                      │
│       │                                                                      │
│       └─► ragAnswerService.buildContext(documents, 4000 tokens)              │
│               │                                                              │
│               │ Split into PART A (verbatim statute) + PART B (interpretive)│
│               │ Labels [A1], [A2]... and [Source N]...                       │
│               ▼                                                              │
│                                                                             │
│       └─► llmService.generateAnswer(query, context)                          │
│               │  systemPrompt: Answer with citations [A1], [A2]             │
│               │  userPrompt: User query + PART A + PART B                    │
│               │                                                              │
│               ▼                                                              │
│             Generate response (Gemini/Groq, streaming)                        │
│               │                                                              │
│               └─► Stream tokens via SSE                                      │
│                     event: status  "Finding relevant sections..."           │
│                     event: delta   "Consumer" " protection" ...              │
│                     event: sources  citations array                           │
│                     event: done     { data: BackendMessageResult }            │
└───────────────────────────┬───────────────────────────────────────────────┘
                            │ (SSE stream)
                            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Port 5173) - Response                     │
│                                                                             │
│  streamMessage() SSE parser                                                   │
│       │                                                                      │
│       ├─► event: status → dispatch STREAM_STATUS                             │
│       ├─► event: delta  → dispatch STREAM_TOKEN                              │
│       ├─► event: sources→ dispatch STREAM_SOURCES                             │
│       └─► event: done  → call onDone(result)                                 │
│               │                                                              │
│               ▼                                                              │
│             onDone callback in useSendMessage                                │
│               │                                                              │
│               ├─► toMessage(result)  ← BackendMessageResult → Message        │
│               ├─► dispatch MESSAGE_RECEIVED (adds bot message)               │
│               ├─► dispatch CONVERSATION_STARTED (if new)                     │
│               └─► dispatch STREAM_END                                        │
│                       │                                                      │
│                       ▼                                                      │
│             Chat reducer updates state                                       │
│               │                                                              │
│               ▼                                                              │
│             BotMessageCard renders                                            │
│               │                                                              │
│               ├─► TextAnswer (markdown renderer, typewriter effect)          │
│               ├─► SourceCards (citations with reviewed badges)              │
│               ├─► Confidence badge, review status, provider badge           │
│               ├─► Quick replies / suggested follow-ups                      │
│               └─► Disclaimer at bottom                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 5.2 Phase 1: Frontend → Backend (User Sends Message)

### Step 1: User Input

The user types a message in the `Composer` component (or via the `IntakeWizard` guided intake).

**Component**: `ChatPage.tsx` → `Composer`

```tsx
const handleSendMessage = (text: string) => {
  if (state.isSending || state.isLoadingConversation) return;
  sendMessageMutation.mutate(
    { text },
    { onSuccess: () => { loadConversations(); } },
  );
};
```

### Step 2: useSendMessage Mutation

**Hook**: `useSendMessage` (`frontend/src/hooks/useSendMessage.ts`)

Uses React Query's `useMutation` for state management.

```tsx
export function useSendMessage() {
  const { state, dispatch } = useConversation();

  return useMutation<Message, Error, SendMessageArgs>({
    mutationFn: async ({ text, contextOverride }) => {
      const startedNew = !state.conversationId;
      const convId = state.conversationId;

      const mergedContext: IntakeContext = {
        ...state.intakeContext,
        ...contextOverride,
      };

      // Add user message immediately (optimistic update)
      const userMessage: Message = {
        message_id: 'msg_u_' + Math.random().toString(36).substring(2, 9),
        conversation_id: convId ?? '',
        created_at: new Date().toISOString(),
        sender: 'user',
        answer_text: text,
        answer_format: 'text',
        cards_used: [],
        overall_confidence: 1.0,
        overall_review_status: 'reviewed',
        disclaimer: '',
        suggested_follow_ups: [],
        context: mergedContext,
      };

      dispatch({ type: 'MESSAGE_SENT', payload: { userMessage } });
      dispatch({ type: 'STREAM_START' });
      dispatch({ type: 'STREAM_STATUS', payload: 'Thinking\u2026' });

      return new Promise<Message>((resolve, reject) => {
        let settled = false;

        streamMessage(convId, text, mergedContext, {
          onStatus: (status) => dispatch({ type: 'STREAM_STATUS', payload: status }),
          onToken: (token) => dispatch({ type: 'STREAM_DELTA', payload: { text: token } }),
          onDone: (result) => {
            if (startedNew) {
              dispatch({
                type: 'CONVERSATION_STARTED',
                payload: { conversationId: result.conversationId },
              });
            }
            const botMessage = toMessage(result);
            dispatch({ type: 'MESSAGE_RECEIVED', payload: { botMessage } });
            dispatch({ type: 'STREAM_END' });
            settled = true;
            resolve(botMessage);
          },
        })
          .then(() => {
            if (!settled) {
              reject(new Error('The server did not return an answer. Please try again.'));
            }
          })
          .catch((error: unknown) => {
            if (!settled) {
              reject(error instanceof Error ? error : new Error(String(error)));
            }
          });
      });
    },
    onError: (error) => {
      dispatch({
        type: 'SET_ERROR',
        payload: getApiErrorMessage(error),
      });
    },
  });
}
```

**Key steps**:
1. Optimistically add user message to UI immediately
2. Start streaming state (STREAM_START, STREAM_STATUS "Thinking...")
3. Call streamMessage() which POSTs to backend with SSE
4. Resolve the Promise when onDone fires (or reject on error/disconnect)

### Step 3: Frontend API Call

**API**: `frontend/src/api/messages.ts` → `streamMessage()`

```tsx
export async function streamMessage(
  conversationId: string | null,
  messageText: string,
  context: IntakeContext | undefined,
  handlers: MessageStreamHandlers,
): Promise<void> {
  const token = localStorage.getItem(STORAGE_KEYS.token);

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-Session-Id': getSessionId(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        conversationId,
        message: messageText,
        ...(context && Object.keys(context).length > 0 ? { context } : {}),
      }),
    });
  } catch {
    throw new Error('Cannot reach the server. Check your internet connection and try again.');
  }

  // Handle auth errors
  if (response.status === 401) {
    clearAuthAndReload();
    throw new Error('Your session has expired. Please log in again.');
  }

  if (response.status === 429) {
    throw new Error('Daily AI quota reached. Please try again later.');
  }

  if (!response.ok || !response.body) {
    throw new Error(`Request failed (${response.status}). Please try again.`);
  }

  // Parse SSE stream
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let receivedDone = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');

      let separator = buffer.indexOf('\n\n');

      while (separator !== -1) {
        const block = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);

        let eventName: string | null = null;
        const dataLines: string[] = [];

        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).replace(/^ /, ''));
          }
        }

        if (dataLines.length > 0) {
          if (eventName === 'done') {
            receivedDone = true;
          }
          dispatchEvent(eventName, dataLines.join('\n'), handlers);
        }

        separator = buffer.indexOf('\n\n');
      }
    }
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error('Something went wrong. Please try again.');
  }

  if (!receivedDone) {
    throw new Error('The server ended the response unexpectedly. Please try again.');
  }
}
```

**Note about SSE data parsing**:
```tsx
// Per the SSE spec only ONE leading space after "data:" is the separator;
// stripping all whitespace would corrupt token deltas that intentionally
// begin or end with spaces.
dataLines.push(line.slice(5).replace(/^ /, ''));
```

## 5.3 Phase 2: Backend Receives & Processes

### Step 4: Express Route

**Route**: `backend/src/routes/message.routes.ts`

```typescript
import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { validate } from "../middleware/validation.middleware";
import { messageController } from "../controllers/message.controller";
import { sendMessageSchema } from "../validators/message.validator";

const router = Router();

router.post(
  "/",
  authMiddleware,
  validate(sendMessageSchema),
  messageController.sendMessage,
);

export default router;
```

### Step 5: Message Controller

**Controller**: `backend/src/controllers/message.controller.ts`

```typescript
class MessageController {
  sendMessage = asyncHandler(async (req: Request, res: Response) => {
    const { conversationId, message } = req.body;

    // Ownership check BEFORE any work starts
    if (conversationId) {
      const conversation = await conversationRepository.findById(conversationId);

      if (!conversation) {
        throw new NotFoundError("Conversation not found.");
      }

      if (conversation.userId !== req.user.sub) {
        throw new ForbiddenError(
          "You do not have access to this conversation.",
        );
      }
    }

    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // AbortController for client disconnect
    const disconnectController = new AbortController();
    res.on("close", () => disconnectController.abort());

    // Heartbeat every 15s
    const heartbeat = setInterval(() => {
      if (!res.writableEnded && !res.destroyed) {
        res.write(": heartbeat\n\n");
      }
    }, 15_000);

    const send = (event: string, data: unknown) => {
      if (res.writableEnded || res.destroyed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const result = await workflowService.processMessage(
        req.user.sub,
        conversationId ?? null,
        message,
        {
          onStatus: (status) => send("status", { status }),
          onToken: (token) => send("delta", { text: token }),
          signal: disconnectController.signal,
        },
      );

      send("done", { data: result });
    } catch (error) {
      logger.error("Message streaming failed", {
        error: error instanceof Error ? error.message : String(error),
      });

      const errorMessage =
        error instanceof AppError
          ? error.message
          : "The server ran into an error. Please try again in a moment.";

      send("error", { error: errorMessage });
    } finally {
      clearInterval(heartbeat);
      if (!res.writableEnded) {
        res.end();
      }
    }
  });
}
```

## 5.4 Phase 3: Workflow Orchestration

### Step 6: workflowService.processMessage()

This is the orchestration hub that:
1. Classifies intent (via LLM)
2. Routes to appropriate workflow (general, case, document, calculator)
3. Streams tokens as they arrive
4. Saves to database
5. Returns final result

The actual routing logic is:

```typescript
// Content of workflowService.processMessage() (conceptual):
switch (intent.type) {
  case 'CASE_ANALYSIS':
    return this.caseWorkflow.analyze(query, context);
  case 'DOCUMENT_QA':
    return this.documentWorkflow.answer(query, context);
  case 'CALCULATOR':
    return this.calculatorsService.calculate(query);
  default:
    return this.generalWorkflow.handle(query, context);
}
```

## 5.5 Phase 4: Backend → RAG Service

### Step 7: ragService.query()

**Service**: `backend/src/services/rag.service.ts`

```typescript
class RagService {
  private readonly baseUrl: string;
  private readonly timeoutMs = 30_000;
  private readonly topK: number;

  constructor() {
    this.baseUrl = env.RAG_API_URL.replace(/\/$/, "");
    this.topK = Number(env.RAG_TOP_K ?? 5);
  }

  async query(query: string): Promise<RagResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const start = Date.now();

    ragLogger.info("Querying RAG service", {
      url: `${this.baseUrl}/query`,
      topK: this.topK,
      queryPreview: query.slice(0, 120),
    });

    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, top_k: this.topK }),
        signal: controller.signal,
      });
    } catch (error) {
      ragLogger.error("RAG service request failed", {
        duration: `${Date.now() - start}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`RAG service timed out after ${this.timeoutMs}ms`);
      }
      throw new Error(
        `RAG service unavailable: ${
          error instanceof Error ? error.message : "Unknown network error"
        }`,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      ragLogger.error("RAG service returned an error response", {
        status: response.status,
        duration: `${Date.now() - start}ms`,
      });
      throw new Error(`RAG service returned HTTP ${response.status}`);
    }

    const data = (await response.json()) as RagApiResponse;

    if (typeof data.query !== "string" || !Array.isArray(data.results)) {
      ragLogger.error("RAG service returned a malformed response");
      throw new Error("Invalid response from RAG service");
    }

    ragLogger.info("RAG retrieval succeeded", {
      resultCount: data.results.length,
      duration: `${Date.now() - start}ms`,
    });

    return data as RagResponse;
  }
}

export const ragService = new RagService();
```

## 5.6 Phase 5: RAG Service Retrieval

### Step 8: FastAPI Endpoint

**Endpoint**: `RAG/src/api.py` → `POST /query`

```python
@app.post("/query", response_model=QueryResponse)
def query_rag(request: QueryRequest):
    try:
        documents = retriever.retrieve(request.query, k=request.top_k)
        results = []
        for document in documents:
            results.append({
                "content": document.page_content,
                "metadata": document.metadata
            })
        return {"query": request.query, "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### Step 9: Retriever Pipeline

**Module**: `RAG/src/retriever.py` → `RAGRetriever.retrieve()`

```python
def retrieve(self, query: str, k: int | None = None) -> List[Document]:
    # Concept routing on RAW query
    routing = route_query(query)

    # Query normalization with routed terms
    normalized = self._normalize_query(query, routing.terms)

    # Section targets from explicit mentions + routed inferences
    section_targets = self._section_targets(query)

    # Hybrid retrieval with routing awareness
    return self._hybrid_retrieve(normalized, k or self.k, section_targets, routing)
```

### Step 10: Concept Routing

**Module**: `RAG/src/concept_routing.py` → `route_query()`

**Purpose**: Maps lay language to statutory provisions BEFORE retrieval.

**Example**:

Input: "a gym forces me to buy their protein powder"
Output:
```python
RoutingResult(
    terms=("restrictive", "trade", "practice", "tie", "up", "sales", "conditions"),
    concepts=("definition.restrictive_trade_practice",),
    routes=("tie_in_or_forced_purchase",),
    sections=("2(41)",),
    lift_targets=(("2", "41"),),
    concept_groups=(("definition.restrictive_trade_practice",),),
)
```

### Step 11: Hybrid Retrieval

**Module**: `RAG/src/retriever.py` → `_hybrid_retrieve()`

Input: normalized query + routing result
Output: ranked list of Documents with scores

**Key steps**:

1. **Dense search** (ChromaDB):
   ```python
   dense = self.vector_store.similarity_search(
       query=query,
       k=self.DENSE_CANDIDATES,  # 30
       filter={"source": "v2"},  # Only knowledge cards
   )
   ```

2. **BM25 search**:
   ```python
   bm25_docs = self._bm25_retrieve(query, self.BM25_CANDIDATES)  # 20
   ```

3. **Definition lift** (if definition-style query):
   ```python
   extra_docs = self._lift_definition_docs(query)
   ```

4. **Section lift** (user-named sections):
   ```python
   section_docs = self._lift_section_docs(
       section_targets or [],
       self.SECTION_LIFT_RANK_CONST,  # 10
   )
   ```

5. **Routed section lift** (inferred sections):
   ```python
   routed_section_docs = self._lift_section_docs(
       list(routing.lift_targets),
       self.ROUTED_SECTION_LIFT_RANK_CONST,  # 14
   )
   ```

6. **Routed concept docs** (force-included):
   ```python
   routed_docs = self._lift_concept_docs(routing.concepts)
   ```

7. **RRF FUSION**:
   ```python
   rank_map = {}
   # Dense contribution
   for index, doc in enumerate(dense):
       doc_id = self._doc_id(doc)
       rank_map[doc_id] = rank_map.get(doc_id, 0) + 1.0 / (self.DENSE_RANK_CONST + index + 1)

   # BM25 contribution
   for index, doc in enumerate(bm25_docs):
       doc_id = self._doc_id(doc)
       rank_map[doc_id] = rank_map.get(doc_id, 0) + 1.0 / (self.BM25_RANK_CONST + index + 1)

   # Section lift contributions
   for doc, lift_const in section_docs:
       doc_id = self._doc_id(doc)
       rank_map[doc_id] = rank_map.get(doc_id, 0) + 1.0 / (lift_const + 1)

   # Routed section contributions
   for doc, lift_const in routed_section_docs:
       doc_id = self._doc_id(doc)
       rank_map[doc_id] = rank_map.get(doc_id, 0) + 1.0 / (lift_const + 1)

   # Routed concept contributions
   for doc in routed_docs:
       doc_id = self._doc_id(doc)
       rank_map[doc_id] = rank_map.get(doc_id, 0) + 1.0 / (self.CONCEPT_ROUTE_RANK_CONST + 1)

   # Definition lift contributions
   for doc in extra_docs:
       doc_id = self._doc_id(doc)
       if doc.metadata.get("source") == "v1":
           bonus = 1.0 / (self.DEFINITION_V1_LIFT_RANK_CONST + 1)
       else:
           bonus = 1.0 / (self.DEFINITION_LIFT_RANK_CONST + 1)
       rank_map[doc_id] = rank_map.get(doc_id, 0) + bonus
   ```

8. **Type weights applied**:
   ```python
   weighted = {
       doc_id: score * self._type_weight(by_id.get(doc_id))
       for doc_id, score in rank_map.items()
   }
   ```

9. **Canonical twin promotion**: If a `example.*` card scores well, its canonical `definition.*`/`right.*` sibling gets the same score.

10. **Slot budget enforcement** (`_select_ids`):
    ```python
    # Fill k slots in score order, subject to budgets:
    # - MAX_ROUTED_STATUTE_SLOTS=2
    # - MAX_ROUTED_CARD_SLOTS=2
    # - MAX_EXAMPLES_IN_RESULT=2
    # - MAX_RESERVED_SLOTS=2 (floor guarantee)
    ```

11. **Return** top k docs.

## 5.7 Phase 6: Backend Processes RAG Results

### Step 12: Build Context (PART A / PART B)

**Utility**: `backend/src/utils/ragAnswerFormatter.ts`

```typescript
// PART A — STATUTE (VERBATIM, AUTHORITATIVE)
// - Loads verbatim text from v1-statute.jsonl via statuteIndex.ts
// - Resolves each card's derived_from to statute nodes
// - Budget: 12,000 chars, max 4 provisions per card
// - Breadth-first: every card gets primary provision before any gets second
// - Sorted in statutory order (section → subsection)
// - Labels: [A1], [A2], ... for citation

// PART B — INTERPRETIVE MATERIAL (NOT THE WORDS OF THE ACT)
// - Cards headed "[Source N]" (never a citation)
// - Each card lists statutory anchors: "Statutory Text: see [A1], [A3] above"
// - Content Nature tag: "illustrative example card (interpretive, not statutory wording)"
// - Citation built from resolved statute nodes, not raw derived_from
```

### Step 13: LLM Answer Generation

**Service**: `backend/src/services/llm.service.ts` → `generate()`

```typescript
async generate(request: GenerateRequest, onToken?: (token: string) => void) {
  return this.withTimeout(
    this.generateWithFailover(request, onToken),
    this.overallTimeoutFor(request), // 90s for quality, 30s for fast
  );
}
```

**Failover Logic** (`generateWithFailover`):

1. Filter provider order by availability
2. Prefer providers not cooling down
3. If all cooling down, ignore cooldowns and try anyway
4. Try each provider with key rotation + retry logic
5. If partially streamed (emitted > 0), stop (can't failover partial output)

```typescript
private async generateWithFailover(
  request: GenerateRequest,
  onToken?: (token: string) => void,
): Promise<string> {
  const emitted: EmissionCounter = { count: 0 };
  const configured = this.providerOrder.filter(
    (provider) => this.keyCount(provider) > 0,
  );

  if (configured.length === 0) {
    throw new Error("No LLM providers configured");
  }

  const healthy = configured.filter(
    (provider) =>
      !this.providerIsCoolingDown(provider) &&
      !this.allKeysCoolingDown(provider),
  );

  const order = healthy.length > 0 ? healthy : configured;
  const ignoreCooldowns = healthy.length === 0;

  let lastError: unknown;

  for (const provider of order) {
    try {
      return await this.runProvider(provider, request, onToken, emitted, ignoreCooldowns);
    } catch (error) {
      lastError = error;
      if (request.signal?.aborted) throw error;  // Consumer gone
      if (emitted.count > 0) throw error;       // Partially streamed

      const next = order[order.indexOf(provider) + 1];
      if (next) {
        llmLogger.info("Failing over to next LLM provider", { from: provider, to: next });
      }
    }
  }

  throw lastError;
}
```

## 5.8 Phase 7: Backend → Frontend (SSE Streaming)

### Step 14: Stream Response

The controller sends these events via SSE:

```
event: status    data: {"status": "Finding relevant sections..."}
event: delta     data: {"token": "Consumer"}
event: delta     data: {"token": " protection"}
event: sources   data: {"sources": [...], "type": "sources"}
event: done      data: {"message": {...}, "type": "done"}
```

Note: In the actual implementation, "delta" is sent, while some docs use "token". The frontend `dispatchEvent()` handles both.

## 5.9 Phase 8: Frontend Reconstructs Display

### Step 15: SSE Parser in Frontend

**Module**: `frontend/src/api/messages.ts` → `dispatchEvent()`

```typescript
function dispatchEvent(
  eventName: string | null,
  data: string,
  handlers: MessageStreamHandlers,
): void {
  switch (eventName) {
    case 'status': {
      const { status } = JSON.parse(data) as { status: string };
      handlers.onStatus?.(status);
      break;
    }
    case 'delta': {
      const { text } = JSON.parse(data) as { text: string };
      handlers.onToken?.(text);
      break;
    }
    case 'done': {
      const { data: result } = JSON.parse(data) as {
        data: BackendMessageResult;
      };
      handlers.onDone(result);
      break;
    }
    case 'error': {
      const { error } = JSON.parse(data) as { error: string };
      throw new Error(error);
    }
    default:
      break;
  }
}
```

### Step 16: Update Reducer State

**Module**: `frontend/src/store/chatReducer.ts`

Actions dispatched:
- `STREAM_STATUS`: Updates status text ("Thinking...", "Finding relevant sections...")
- `STREAM_DELTA`: Appends token to `streamingContent`
- `CONVERSATION_STARTED`: Sets conversation ID (for new chats)
- `MESSAGE_RECEIVED`: Replaces streaming content with final message
- `STREAM_END`: Clears streaming state

### Step 17: Render BotMessageCard

**Component**: `frontend/src/components/BotMessageCard.tsx`

The `Message` interface transformed from `BackendMessageResult` via `toMessage()`:

```typescript
export function toMessage(result: BackendMessageResult): Message {
  return {
    message_id: 'msg_b_' + Math.random().toString(36).substring(2, 9),
    conversation_id: result.conversationId,
    created_at: new Date().toISOString(),
    sender: 'bot',
    answer_text: result.reply,
    answer_format: result.answer_format ?? 'text',
    cards_used: result.cards_used ?? [],
    overall_confidence: result.overall_confidence ?? 1.0,
    overall_review_status: result.overall_review_status ?? 'reviewed',
    disclaimer: result.disclaimer ?? '',
    suggested_follow_ups: result.suggested_follow_ups ?? [],
    ...(result.is_low_confidence !== undefined
      ? { is_low_confidence: result.is_low_confidence }
      : {}),
    ...(result.is_out_of_scope !== undefined
      ? { is_out_of_scope: result.is_out_of_scope }
      : {}),
    ...(result.quick_replies ? { quick_replies: result.quick_replies } : {}),
    ...(result.provider ? { provider: result.provider } : {}),
  };
}
```

**Rendering**:
```
┌───────────────────────────────────────────────────┐
│ [Scale icon] LegalBot CPA   [Listen][Copy]       │
├───────────────────────────────────────────────────┤
│ TextAnswer:                                        │
│   (renders markdown: headings, lists, bold/italic)│
├───────────────────────────────────────────────────┤
│ (if any) SourceCards:                              │
│   "Sources used (N)" [+N reviewed badge]          │
│   [Expandable cards with title, concept type,     │
│    review status, description, key_points,        │
│    derived_from refs]                             │
├───────────────────────────────────────────────────┤
│ Confidence badges:                                │
│   "Verified sources" or "Draft sources"           │
│   "85% confidence"                                │
│   "via Gemini" or "via Groq"                      │
├───────────────────────────────────────────────────┤
│ (if provided) QuickReplyRow:                      │
│   [suggested_follow_ups up to 3]                  │
├───────────────────────────────────────────────────┤
│ (if any) Disclaimer at bottom:                    │
│   "This is general information..."                │
└───────────────────────────────────────────────────┘
```

### Step 18: Conversation Persistence

After the response is displayed:
- Conversation ID stored in `localStorage` (activeConversation)
- Backend already saved message to DB
- Frontend calls `loadConversations()` to refresh list

**Restore on refresh**:
- If user refreshes mid-stream, backend continues generating
- Frontend detects last message is user (no bot reply yet)
- Starts polling (`beginAwaitingReply`) until bot message appears in DB

## 5.10 Special Workflows

### Intake Wizard Flow

```
User clicks "Start Intake" → IntakeWizard opens
    │
    ├─► Fetch intake requirements (GET /api/intake/requirements)
    │
    ├─► Step 1: Case type selection
    ├─► Step 2: Party details
    ├─► Step 3: Incident details
    ├─► Step 4: Evidence upload
    ├─► Step 5: Relief sought
    │
    └─► On complete: compose message from all answers
           "Here are the details of my consumer complaint:
            CaseType: ...; ComplainantName: ...; ..."
        → handleSendMessage(composedMessage)
        → POST /api/messages
```

### Calculator Flow

```
User navigates to /calculators
    │
    ├─► Limitation Calculator: Input causeOfAction date
    │       → POST /api/calculators/limitation
    │       → Returns { causeOfActionDate, limitationPeriodYears, deadline,
    │                    daysRemaining, expired, section, explanation }
    │
    ├─► Jurisdiction Calculator: Input purchase price
    │       → POST /api/calculators/jurisdiction
    │       → Returns { claimValue, forum, section, valueRange, explanation,
    │                    prescribedValueNote? }
    │
    └─► Penalty Calculator: Input violation type + business scale
            → POST /api/calculators/penalty
            → Returns { minPenalty, maxPenalty, statuteSection }
```

### Document Generation Flow

```
User completes intake → Clicks "Generate Document"
    │
    ├─► Select template: Complaint / Legal Notice / Appeal
    │
    ├─► POST /api/documents/generate
    │
    └─► Backend: Populate template with intake data + legal citations
        → Return formatted document (Markdown/PDF)
        → Frontend: Download / Copy / Edit
```

## 5.11 Error Handling Scenarios

| Scenario | Backend Behavior | Frontend Result |
|----------|-----------------|----------------|
| Invalid conversation ownership | `ForbiddenError` | Error message shown |
| Conversation not found | `NotFoundError` | Error message shown |
| RAG service not running | Timeout after 30s | Error message shown |
| RAG returns malformed response | `Invalid response from RAG service` | Error message shown |
| LLM quota exceeded | Cooldown + key rotation | Retry after cooldown |
| LLM provider down (503) | Failover to other provider | Continues processing |
| Client disconnects | AbortController aborts LLM | No further feedback |
| Session expired (401) | Auth middleware rejects | Frontend clears auth, redirects to login |
| Daily quota reached (429) | Rate limit | "Daily AI quota reached" message |

## 5.12 Debugging the Full Flow

### Check health of all services

```bash
curl http://localhost:8000/health   # RAG
curl http://localhost:3000/health   # Backend
curl http://localhost:5173          # Frontend
```

### Test RAG query directly

```bash
curl -X POST http://localhost:8000/query \
  -H "Content-Type: application/json" \
  -d '{"query": "consumer refund defective product", "top_k": 3}'
```

### Test backend calculators

```bash
curl -X POST http://localhost:3000/api/calculators/limitation \
  -H "Content-Type: application/json" \
  -d '{"causeOfAction": "2024-01-15"}'
```

### Explain RAG retrieval (debug)

```bash
py -3 -c "
from src.retriever import RAGRetriever
from src.vectorStore import VectorStoreManager
manager = VectorStoreManager()
retriever = RAGRetriever(manager.load())
import json
print(json.dumps(retriever.explain('gym forces me to buy protein powder'), indent=2))
"
```