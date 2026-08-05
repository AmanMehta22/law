# Backend Connection Guide — Complete Checklist

How to fully connect the LegalBot frontend to the real backend (`backend/`), replacing the mock/fallback flow.

**Current state:** Auth UI calls the real backend (`/auth/login`, `/auth/register`) but discards the token. Chat still uses the mock engine (`mockApi` + `frontend/server.ts` routes). This guide closes that gap.

---

## Quick Reference — Backend API

Base URL: `http://localhost:3000` (backend port; Postgres on 5432; frontend on 5173)

| Purpose | Method & Path | Auth | Body |
|---|---|---|---|
| Register | `POST /auth/register` | none | `{ email, password }` |
| Login | `POST /auth/login` | none | `{ email, password }` |
| Send message | `POST /messages` | Bearer | `{ conversationId, message }` |
| Start conversation | `POST /conversations` | Bearer | — (optional) |

### Login response (token source)
```json
{ "success": true, "data": { "accessToken": "eyJhbGc...", "user": { "id": "...", "email": "..." } } }
```
> Register response has NO token — after signup you must call login to get one.

### Message response (send message)
```json
{
  "success": true,
  "data": {
    "conversationId": "ckxyz...",
    "readyForRag": false,
    "reply": "Thank you. Could you tell me the value of the product?"
  }
}
```
- `conversationId: null` on the **first** message → backend creates the conversation and returns its id; send that id on all later messages.
- Backend is an intake workflow: it asks follow-up questions until the required consumer fields are complete, then replies `"✅ Enough information has been collected. RAG will be called next."` (`readyForRag: true`).

### Response wrapper
Every endpoint returns `{ success, data }` — always unwrap `.data`.

---

## Phase 1 — Real Auth & JWT (code needed)

1. **Save the token after login — `src/components/AuthPage.tsx`**
   - Login branch: `localStorage.setItem('legalbot_token', data.data.accessToken)`
   - Signup branch: after `signup()`, call `loginUser(email, password)` and save its token
2. **Create `src/lib/authToken.ts`** — `getToken()`, `setToken()`, `clearToken()` helpers (localStorage, try/catch)
3. **Attach header — `src/api/mockApi.ts` interceptor**
   ```ts
   apiClient.interceptors.request.use((config) => {
     config.headers['X-Session-Id'] = getSessionId();
     const token = localStorage.getItem('legalbot_token');
     if (token) config.headers.Authorization = `Bearer ${token}`;
     return config;
   });
   ```
4. **Clear on logout — `src/App.tsx` `handleLogout`**: `localStorage.removeItem('legalbot_token')`
5. **Switch `login.ts`/`signup.ts` to `apiClient`** (or keep raw axios — the token is saved in AuthPage either way)

**Verify:** login → `legalbot_token` in DevTools → Application → Local Storage. Call `/messages` → no 401.

---

## Phase 2 — Connect Messages

1. **`src/api/backendApi.ts` (new)** — real send-message function:
   ```ts
   export async function sendMessage(conversationId: string | null, message: string) {
     const res = await apiClient.post('/messages', { conversationId, message });
     return res.data.data; // { conversationId, readyForRag, reply }
   }
   ```
2. **`src/features/chat/hooks/useSendMessage.ts`** — replace `mockApi.sendMessage(...)` with `sendMessage(convId, text)`; dispatch `CONVERSATION_STARTED` with the returned `conversationId` (first message).
3. **`src/features/chat/hooks/useConversation.tsx`** — remove the automatic `mockApi.startConversation()` effect; conversation id comes from the message response. `resetConversation()` just clears state.

**Verify:** first message gets a follow-up question; second message keeps the same backend conversation (check Postgres `conversation` table).

---

## Phase 3 — Response Mapping & Fallback

1. **`src/lib/messageMapper.ts` (new)** — map backend `{ conversationId, readyForRag, reply }` → frontend `Message`:
   - `answer_text: reply`
   - `answer_format: 'text'`
   - `cards_used: []`, `v1_nodes_used: []`
   - `overall_confidence: 0.9`, `overall_review_status: 'reviewed'`
   - `disclaimer: ''`, `suggested_follow_ups: []`
2. **Keep the mock fallback** — if `POST /messages` throws (backend down), fall back to `processUserQuery` so the app never breaks.

---

## Phase 4 — History (needs small backend addition)

1. **Backend — add routes** (auth-protected, like existing):
   - `GET /conversations` → list current user's conversations
   - `GET /conversations/:id/messages` → full transcript
2. **SidePanel** — replace `mockChats` with fetched data; clicking a conversation loads it into chat (add a `LOAD_CONVERSATION` reducer action).
3. **"New Chat" button** → `resetConversation()` + empty chat.

---

## Phase 5 — Polish

- Fix retry duplicate bubbles (`ConversationView.tsx` `handleRetry`)
- Per-error messages: 401 → "Session expired, log in again"; network → "Backend offline, showing mock data"
- `CitationDrawer` — remove fabricated fallback statute text
- Remove/retire mock `/api/v1/...` routes in `frontend/server.ts` once the real backend is the single source

---

## Run Order & Verification

```bash
# 1. Postgres (already running on 5432)
# 2. Backend
cd backend && npm run dev        # http://localhost:3000
# 3. Frontend
cd frontend && npm run dev       # http://localhost:5173
```
- `npm run lint` in `frontend/` after each phase
- Sign up → auto-login → send a message → backend asks follow-up questions → after info complete, `readyForRag: true`
