# LegalBot — Frontend ↔ Backend Integration Guide

How the frontend integrates with the LegalBot backend: authentication, chat, API communication, and conversation/history management. This reflects the **current, implemented** setup — not a design sketch.

---

## 1. Overview

### Responsibilities

**Frontend (presentation layer only)**
- Authentication (register/login), token storage.
- Chat interface, message sending, assistant reply rendering.
- Conversation state + sidebar history rendering.
- Loading/error states.

**Backend (all decisions)**
- Auth, authorization (JWT).
- Conversation & message persistence.
- AI workflow orchestration — intent routing (GENERAL / CASE / DOCUMENT), follow-up question selection, Gemini calls, and (future) RAG.
- Always returns a consistent `{ success, data }` envelope.

### Communication flow

```
Frontend (5173) ──REST──▶ Backend (3000) ──▶ PostgreSQL
                                     └────▶ Gemini AI
```

The frontend **never** talks to the database or the AI provider directly.

---

## 2. Authentication

JWT-based. Every protected request sends `Authorization: Bearer <token>`.

### Register

`POST /auth/register` → `200`

Request:
```json
{ "email": "user@example.com", "password": "password123" }
```

Response:
```json
{
  "success": true,
  "data": { "id": "user_id", "email": "user@example.com", "createdAt": "2026-08-04T12:00:00Z" }
}
```

### Login

`POST /auth/login` → `200`

Request:
```json
{ "email": "user@example.com", "password": "password123" }
```

Response (note: `accessToken`, **not** `token`):
```json
{
  "success": true,
  "data": {
    "accessToken": "<JWT>",
    "user": { "id": "user_id", "email": "user@example.com" }
  }
}
```

### Where it's implemented
- `frontend/src/api/login.ts` / `signup.ts` (plain axios calls).
- `frontend/src/api/client.ts` — axios instance for all other calls; attaches `Authorization: Bearer <legalbot_token>` and `X-Session-Id` to every request via interceptor.
- Token stored as `localStorage["legalbot_token"]` by `AuthPage`.
- On any **401** the client clears session keys and redirects to `/auth`.

### Logout
No backend endpoint. Frontend removes `legalbot_token`, `legalbot_user`, `legalbot_authenticated`, `legalbot_active_conversation` and navigates to `/auth`.

---

## 3. Conversations & Chat

### Message endpoint

`POST /messages` → `201`, body `{ "conversationId": ..., "message": "..." }`

**Starting a new conversation:** send `"conversationId": null`. The backend creates the conversation, **auto-titles it from your message**, stores it, runs the workflow, and returns the new id. (`sendMessageSchema` accepts `conversationId` as nullable/optional.)

**Continuing:** send the previously returned `conversationId`.

Response:
```json
{
  "success": true,
  "data": {
    "conversationId": "cmsesinwl00016br4qj0igq06",
    "readyForRag": false,
    "reply": "Who sold the product or provided the service?"
  }
}
```

When information is complete:
```json
{
  "success": true,
  "data": {
    "conversationId": "cmsesinwl00016br4qj0igq06",
    "readyForRag": true,
    "reply": "Legal response (currently a placeholder until RAG ships)"
  }
}
```

The frontend renders `reply` identically whether it's a follow-up question or a `readyForRag` answer.

### History endpoints

`GET /conversations` → the user's conversations, ordered by `updatedAt` desc:
```json
{
  "success": true,
  "data": [
    { "id": "cmsg...", "title": "Recent title", "createdAt": "...", "updatedAt": "..." }
  ]
}
```

`GET /conversations/:id` → a conversation with all messages:
```json
{
  "success": true,
  "data": {
    "id": "cmsg...",
    "title": "...",
    "userId": "user_id",
    "createdAt": "...",
    "updatedAt": "...",
    "messages": [
      { "id": "msg...", "conversationId": "cmsg...", "role": "USER", "content": "...", "createdAt": "..." }
    ]
  }
}
```
`role` is one of `USER | ASSISTANT | SYSTEM`. The frontend maps `USER → user`, `ASSISTANT → bot`, and skips `SYSTEM`.

### Frontend behavior
- `GET /conversations` feeds the sidebar (`src/components/SidePanel.tsx`); search filters titles locally.
- Clicking a row calls `GET /conversations/:id` and replaces the thread (`openConversation` in `src/store/ChatContext.tsx`).
- After each successful send the list is refetched; the active conversation is pinned to the top.
- Legacy rows still titled "New Conversation" are verified via `GET /conversations/:id`: empty ones are hidden, ones with messages get a client-side title from their first message.
- The active conversation id is persisted in `localStorage["legalbot_active_conversation"]` and restored on reload.

### Important rules
- The frontend **never** generates a conversation id and never hardcodes questions.
- A conversation is created only by the backend (via `conversationId: null`), never with an empty upfront `POST /conversations`.
- Always reuse the latest returned `conversationId`.

---

## 4. Chat Workflow

```
send ✉──▶ POST /messages ──▶ backend stores message
                                  │
                                  ▼
                         intent + info check
                                  │
                    ┌──── complete? ────┐
                    No                 Yes
                    ▼                  ▼
              next follow-up      (RAG placeholder)
               question reply         reply
                    │                  │
                    ▼                  ▼
                { conversationId, readyForRag, reply }
```

The frontend state machine (`src/store/chatReducer.ts`) tracks:
`conversationId`, `messages`, `conversations`, `intakeContext`, `isSending`, `isLoadingConversation`, `error`.

Chat send lives in `src/hooks/useSendMessage.ts`:
1. Append user message (optimistic).
2. `POST /messages` (with `conversationId: null` on first send).
3. Adopt the returned conversation id.
4. Append the assistant reply.
5. Refresh the sidebar list.

Edge handling in the reducer:
- A reply that arrives for a conversation different from the currently-active one is **dropped** (prevents bleed when switching chats mid-send).
- 401 anywhere → the axios interceptor clears the session and redirects to `/auth`.

---

## 5. API Reference (implemented)

Base URL: `http://localhost:3000` via `VITE_API_BASE_URL`.

**Envelope:** success → `{ success: true, data: ... }`; failure → `{ success: false, error: "<message>" }` (`error`, not `message`).

### Endpoints

| Method & Path | Purpose |
| --- | --- |
| `GET /health` | Health probe → `{ status: "Ok", message: "...", timeStamp: "..." }` (not enveloped) |
| `POST /auth/register` | Create account → `{ id, email, createdAt }` |
| `POST /auth/login` | Login → `{ accessToken, user }` |
| `POST /conversations` | Create conversation (title `"New Conversation"` — the workflows normally create it via `/messages` instead) |
| `GET /conversations` | List user's conversations |
| `GET /conversations/:id` | Conversation + messages |
| `POST /messages` | Send a chat message; `conversationId` nullable |

### Status codes
| Status | Meaning | Frontend action |
| --- | --- | --- |
| 200/201 | Success | — |
| 400 | Validation failed | Show message |
| 401 | Unauthorized / expired JWT | Clear session, redirect to login |
| 404 | Not found | Show message |
| 429 | Gemini free-tier quota exhausted | Show retryable error |
| 500 | Server error | Show generic error |

---

## 6. Project layout (implemented)

```
src/
  api/        client.ts (axios instance + interceptors), conversations.ts, messages.ts, login.ts, signup.ts
  components/ SidePanel, ConversationView, Composer, BotMessageCard, …
  hooks/      useSendMessage
  pages/      AuthPage, ChatPage
  store/      ChatContext, chatReducer
  types/      conversation, knowledgeCard, statute, user
  utils/      sessionId, queryClient, cn
```

Note: `frontend/server.ts` is only a static/vite host — it defines **no** API routes. There is no mock data anywhere in the frontend.

---

## 7. Integration checklist (status)

Auth (register/login/JWT/header) — **done**
Chat send + conversationId flow — **done**
Sidebar history (`GET /conversations`, `GET /conversations/:id`) — **done**
Resume last conversation on reload — **done**
RAG rendering — **no action needed** (`readyForRag` replies render as plain text; waits on backend RAG)
Friendly 429/5xx in-chat messaging — **optional polish, pending**