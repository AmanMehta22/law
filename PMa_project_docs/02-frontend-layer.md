?# PMa Frontend Layer: Detailed Analysis

## 2.1 Project Structure

```
frontend/src/
├── main.tsx              # Entry point
├── App.tsx               # Root component + routing (Auth vs Chat)
├── api/                  # API clients (axios + SSE)
│   ├── client.ts         # axios instance, interceptors, error mapping
│   ├── auth.ts           # register/login/logout
│   ├── conversations.ts  # get / list conversations
│   ├── messages.ts       # streamMessage() SSE client
│   ├── calculators.ts    # limitation/jurisdiction/penalty
│   └── intake.ts         # intake requirements + document generation
├── components/           # Reusable UI components
│   ├── ChatPage.tsx (dup in pages) ─ page shell
│   ├── SidePanel.tsx     # conversation list + new chat
│   ├── AppHeader.tsx     # top bar, logout
│   ├── ConversationView.tsx  # message list + loading
│   ├── Composer.tsx      # text input
│   ├── BotMessageCard.tsx    # bot answer card
│   ├── UserMessageBubble.tsx # user bubble
│   ├── TextAnswer.tsx    # markdown renderer / typewriter
│   ├── SourceCards.tsx   # citations
│   ├── QuickReplyRow.tsx # suggested follow-ups
│   ├── IntakeWizard.tsx  # guided intake
│   ├── CalculatorsPage.tsx (in pages)
│   ├── DisclaimerBanner.tsx
│   ├── WelcomeState.tsx
│   ├── LoadingIndicator.tsx
│   └── ErrorBoundary.tsx
├── pages/
│   ├── ChatPage.tsx
│   ├── CalculatorsPage.tsx
│   └── AuthPage.tsx
├── store/
│   ├── ChatContext.tsx   # React Context + useReducer
│   └── chatReducer.ts    # state transitions + tests
├── hooks/
│   └── useSendMessage.ts # TanStack Query mutation + SSE orchestration (+ test)
├── types/
│   ├── conversation.ts   # Message, Conversation, IntakeContext
│   ├── knowledgeCard.ts  # KnowledgeCard, V2KnowledgeCard, ReviewStatus
│   └── user.ts           # User, UserData
├── utils/
│   ├── sessionId.ts      # persistent session id
│   ├── queryClient.ts    # TanStack Query client
│   └── cn.ts             # className merge helper
└── constants/
    └── storageKeys.ts    # localStorage keys
```

## 2.2 State Management (React Context + Reducer)

**Files**: `store/ChatContext.tsx`, `store/chatReducer.ts`

The chat is stateful across the whole page via a single Context with a reducer. There is no Redux — just `useReducer` exposed through context.

### ChatState shape

```typescript
interface ChatState {
  conversationId: string | null;
  messages: Message[];
  intakeContext: IntakeContext;
  conversations: Conversation[];
  isSending: boolean;
  isLoadingConversation: boolean;
  error: string | null;
  streamingText: string;          // accumulating SSE tokens
  streamStatus: string | null;    // "Thinking…", "Finding relevant sections…"
  streamConversationId: string | null;
}
```

### Actions

| Action | Effect |
|---|---|
| `CONVERSATION_STARTED` | Sets `conversationId` for a new chat; clears error |
| `MESSAGE_SENT` | Appends the user message optimistically; sets `isSending` |
| `MESSAGE_RECEIVED` | Appends the final bot message; clears streaming state; handles "saved to another conversation" mismatch |
| `REMOVE_MESSAGE` | Removes a message by id |
| `SET_INTAKE_CONTEXT` | Merges intake data into context |
| `RESET_CONVERSATION` | Back to initial state (keeps conversation list) |
| `SET_ERROR` | Clears streaming, records error |
| `STREAM_START` | Prepares streaming buffers, marks `isSending` |
| `STREAM_STATUS` | Sets status text |
| `STREAM_DELTA` | Appends a token (guarded by `streamConversationId` match) |
| `STREAM_END` | Clears streaming buffers |
| `CONVERSATIONS_LOADED` | Sets list, moves active to top (`moveToTop`) |
| `CONVERSATION_LOADING` | Sets `isLoadingConversation` |
| `CONVERSATION_LOADED` | Loads a full conversation into the view |
| `CONVERSATION_TITLE_UPDATED` | Renames a conversation in the list |
| `AWAIT_REPLY` | Reopens an in-progress chat; shows "still writing" indicator |
| `AWAIT_REPLY_TIMEOUT` | Gives up polling after ~2.5 minutes |

### Stream guard

`STREAM_DELTA` only appends when `state.streamConversationId === state.conversationId`, so tokens from a stale (abandoned) stream are dropped.

### Polling to recover mid-stream answers (AWAIT_REPLY)

If a conversation is reopened (e.g. after a browser refresh) while the backend is still generating, the last message is an unanswered user question. `beginAwaitingReply()` in `ChatContext.tsx` polls `getConversation()` every **2.5s** (up to 60 attempts ≈ 2.5 minutes) until the last message becomes a bot answer, then dispatches `MESSAGE_RECEIVED`. This relies on the backend persisting the finished answer even if the original tab disconnected.

## 2.3 API Client Layer

**File**: `api/client.ts`

```typescript
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});
```

**Request interceptor** adds:
- `X-Session-Id: <persistent session id>` (from `utils/sessionId.ts`)
- `Authorization: Bearer <token>` if present in localStorage

**Response interceptor**:
- On 401 → `clearAuthAndReload()` (clears token/auth/user/localStorage, reloads to `/auth`)

**`getApiErrorMessage(error, fallback)`** maps Axios/native errors to friendly text:
- No response → "Cannot reach the server…"
- 401 → "Your session has expired…"
- 429 → "Daily AI quota reached…"
- 500+ → "The server ran into an error…"
- Backend-provided `{ error }` message, else `Request failed (status)`

## 2.4 Sending a Message (SSE Streaming)

**Files**: `hooks/useSendMessage.ts`, `api/messages.ts`, `pages/ChatPage.tsx`, `components/Composer.tsx`

Flow (detailed in `05-data-flow.md`):

1. `Composer` calls `onSend(text)` from `ChatPage.handleSendMessage`.
2. Guard: skip if `isSending` or `isLoadingConversation`.
3. `useSendMessage().mutate({ text })`.
4. The mutation builds an optimistic user `Message`, dispatches `MESSAGE_SENT` + `STREAM_START` + `STREAM_STATUS`, then calls `streamMessage()`.
5. `streamMessage()` POSTs to `${API_BASE_URL}/messages` with `Accept: text/event-stream`, `X-Session-Id`, optional `Authorization`, and body `{ conversationId, message, context }`.
6. It reads the Response `body` reader, buffers chunks, splits SSE blocks on `\n\n`, and dispatches events.
7. Resolves when the `done` event arrives; rejects if the stream ends without `done`.

### SSE event dispatcher

```typescript
switch (eventName) {
  case 'status':  handlers.onStatus(...)
  case 'delta':   handlers.onToken(...)     // { text }
  case 'done':    handlers.onDone(result)   // { data: BackendMessageResult }
  case 'error':   throw new Error(error)
}
```

### Data parsing note

`data:` lines are sliced with `line.slice(5).replace(/^ /, '')` — only the single spec-compliant leading space is removed, preserving intentional leading/trailing whitespace in token deltas.

## 2.5 Rendering a Bot Answer

**File**: `components/BotMessageCard.tsx`

Structure of the card (top to bottom):

1. **Header** — LegalBot CPA identity, audio `Listen` (Web Speech API TTS, strips `*#`), `Copy` button (Clipboard API with textarea fallback).
2. **TextAnswer** — renders the markdown answer (`components/TextAnswer.tsx`, typewriter effect while streaming).
3. **Out-of-scope notice** — if `is_out_of_scope`.
4. **Low-confidence warning** — if `is_low_confidence`.
5. **Meta badges** — review status (`Verified sources` / `Draft sources`), `NN% confidence`, provider badge (`via Gemini` / `via Groq`).
6. **SourceCards** — `cards_used` citations (`components/SourceCards.tsx`, expandable, "+N reviewed" badge).
7. **Quick replies / suggested follow-ups** — `QuickReplyRow` (up to 3 `suggested_follow_ups`, or `quick_replies` if present).
8. **Disclaimer** — footer text.

## 2.6 Conversation Management

**File**: `api/conversations.ts`

- `getConversations()` → `GET /conversations` (axios), maps backend snake/camel to frontend types.
- `getConversation(id)` → `GET /conversations/:id`, filters out `SYSTEM` role messages, maps `USER`→`user`, else `bot`.
- **No pagination yet** — fetches full history in one call (documented TODO).

**In `ChatContext.loadConversations()`**:
- Loads the list.
- "Placeholder" conversations (empty title / `New Conversation`) are hydrated from their first user message (first 60 chars, truncated with `...`); empty ones are dropped.

**In `ChatPage` mount**:
- Restores the persisted active conversation from `localStorage[activeConversation]` via `openConversation`.
- If none persisted but the newest conversation's last message is an unanswered user message, it reopens that one (recovering an interrupted stream) — this triggers `AWAIT_REPLY` polling.
- Also refreshes the list on `document.visibilitychange` (tab focus).

## 2.7 Intake Wizard

**File**: `components/IntakeWizard.tsx`, `api/intake.ts`

- Triggered from a link under the composer ("Start a guided intake").
- Fetches required fields from `GET /api/intake/requirements`.
- Multi-step form (case type, parties, incident, evidence, relief).
- On completion, composes a single message string from all answers and calls `handleSendMessage(composedMessage)` → normal streaming path, with `context` sent in the request body.

## 2.8 Calculators Page

**File**: `pages/CalculatorsPage.tsx`, `api/calculators.ts`

Three independent calculators, each a separate backend call:

- **Limitation Calculator** → `POST /api/calculators/limitation` with `{ causeOfAction }` → returns deadline, days remaining, expired flag, Section 69 explanation.
- **Jurisdiction Calculator** → `POST /api/calculators/jurisdiction` with `{ purchasePrice }` → returns forum (district/state/national) per Section 34 thresholds.
- **Penalty Calculator** → `POST /api/calculators/penalty` with violation type + business scale → returns min/max penalty.

## 2.9 Type Conversions

The frontend defines its own display types; backend responses are mapped in the API layer.

- `Message` (portable frontend shape) ← `BackendMessageResult` (from SSE `done`) via `toMessage()` in `useSendMessage.ts`.
- `Message` ← `BackendMessage` (from `GET /conversations/:id`) via mapping in `conversations.ts`.
- `Conversation` ← `BackendConversation` (camel→snake field mapping).

## 2.10 Tests

**Run**: `cd frontend && npm test`

- `store/chatReducer.test.ts` — verifies all reducer transitions including stream guard and `AWAIT_REPLY`.
- `hooks/useSendMessage.test.ts` — verifies the mutation → SSE → `onDone` orchestration and error paths.
- `components/TextAnswer.test.tsx` — markdown/typewriter rendering.

## 2.11 Key Frontend Behaviors to Preserve

- **Optimistic user message** appears instantly; bot text streams token-by-token.
- **Partial-stream protection**: tokens from an abandoned stream are dropped (`streamConversationId` guard); an answer saved to a *different* conversation surfaces a clear notice.
- **Refresh recovery**: reopening an in-progress chat polls until the answer lands.
- **Accessibility**: aria-labels on audio/copy buttons; textarea fallback for the Clipboard API on insecure origins.
- **Out-of-scope / low-confidence** calls are surfaced as distinct banners, not reported as normal answers.