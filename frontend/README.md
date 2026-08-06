# LegalBot CPA — Frontend

React 19 + TypeScript + Vite + Tailwind CSS v4 + TanStack Query client for the LegalBot Consumer Protection Act, 2019 assistant. Talks to the real backend in `../backend` — **there is no mock data or fallback engine anywhere in this app**.

## Setup

```bash
npm install
cp .env.example .env   # VITE_API_BASE_URL=http://localhost:3000
npm run dev            # serves the app on http://localhost:5173 (tsx server.ts)
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server (Express + Vite middleware) on :5173. `server.ts` is only a static host — it contains no API routes. |
| `npm run build` | `vite build` + bundles `server.ts` to `dist/server.cjs` |
| `npm start` | Runs the production bundle (`node dist/server.cjs`) |
| `npm run lint` | `tsc --noEmit` |
| `npm test` | `vitest run` — unit tests for the chat reducer (`src/store/chatReducer.test.ts`) |

## Structure

```
src/
  api/          client.ts (axios instance + interceptors), auth.ts, conversations.ts, messages.ts
  components/   SidePanel, ConversationView, Composer, BotMessageCard, etc.
  hooks/        useSendMessage (chat send mutation)
  pages/        AuthPage (login/signup), ChatPage (main chat layout)
  store/        ChatContext + chatReducer (conversation state machine)
  types/        conversation, knowledgeCard, statute, user
  utils/        sessionId, queryClient, cn
```

## API layer — `src/api/`

One file per resource, all sharing the axios instance from `client.ts`:

| File | Functions |
| --- | --- |
| `client.ts` | `apiClient` instance, base URL from `VITE_API_BASE_URL`, JWT + `X-Session-Id` request interceptor, 401 → redirect to `/auth` |
| `conversations.ts` | `startConversation()` (POST), `getConversations()` (list), `getConversation(id)` (detail + messages) |
| `messages.ts` | `sendMessage(conversationId, message)` (POST) |
| `auth.ts` | `login(email, password)` (POST /auth/login), `register(email, password)` (POST /auth/register) |

### Backend endpoints used

| Endpoint | Purpose |
| --- | --- |
| `POST /auth/login`, `POST /auth/register` | Auth; response `{ success, data: { accessToken, user } }` |
| `POST /messages` | Body `{ conversationId, message }`. `conversationId` may be `null` — the backend then creates the conversation and auto-titles it from the message. Response `{ success, data: { conversationId, readyForRag, reply } }`. |
| `GET /conversations` | Sidebar history list (ordered by `updatedAt` desc) |
| `GET /conversations/:id` | Conversation detail incl. `messages` (`role: USER | ASSISTANT | SYSTEM`) |

## Chat flow

1. First message in a new chat is sent with `conversationId: null` — no empty conversations are ever created up front.
2. The backend returns the real conversation id, which becomes the active conversation.
3. Sidebar refreshes after every successful send; the active conversation is pinned to the top.
4. The active conversation id is persisted in `localStorage['legalbot_active_conversation']` and restored on reload (full message history is re-fetched).
5. Legacy rows titled "New Conversation" are inspected via `GET /conversations/:id`: truly empty ones are hidden; ones with messages get a client-side title from their first message.

## localStorage keys

| Key | Purpose |
| --- | --- |
| `legalbot_token` | JWT (set by AuthPage) |
| `legalbot_user`, `legalbot_authenticated` | Session state |
| `legalbot_active_conversation` | Active conversation id for resume-on-reload |
| `legalbot_cpa_session_id` | Anonymous session id (sessionStorage) |

## Notes for other developers

- `readyForRag: true` replies are rendered like any other bot text message — no extra handling needed once the backend lands real RAG answers.
- If the backend returns HTTP 429, it is the Gemini free-tier quota being exhausted (backend-side), not a frontend bug.
