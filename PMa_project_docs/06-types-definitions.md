?# PMa Type Definitions

This document catalogs the core TypeScript type definitions across the frontend and backend, and the Python type definitions in the RAG service. These types define the contracts between layers.

## 6.1 Frontend Types

### Message

**File**: `frontend/src/types/conversation.ts`

The unified message shape used by the chat reducer and all message components.

```typescript
export interface Message {
  message_id: string;
  conversation_id: string;
  created_at: string;
  sender: 'user' | 'bot';
  answer_text: string;
  answer_format: 'text' | 'intake' | 'document';
  cards_used: KnowledgeCard[];
  overall_confidence: number;       // 0..1
  overall_review_status: string;    // 'reviewed' | 'pending' | 'draft'
  disclaimer: string;
  suggested_follow_ups: string[];
  context?: IntakeContext;
  is_low_confidence?: boolean;
  is_out_of_scope?: boolean;
  quick_replies?: string[];
  provider?: 'gemini' | 'groq';
}
```

### IntakeContext

**File**: `frontend/src/types/conversation.ts`

Captured during the guided intake wizard and passed along with messages so the backend and LLM have case context.

```typescript
export interface IntakeContext {
  caseType?: string;
  complainantName?: string;
  respondentName?: string;
  complaintDate?: string;
  purchaseDate?: string;
  purchasePrice?: number;
  productCategory?: string;
  defectSummary?: string;
  resolutionSought?: string;
  evidence?: string[];
  [key: string]: string | number | string[] | undefined;
}
```

### Conversation

**File**: `frontend/src/types/conversation.ts`

```typescript
export interface Conversation {
  conversation_id: string;
  title: string;
  created_at: string;
  last_message_at: string;
  message_count?: number;
}
```

### KnowledgeCard

**File**: `frontend/src/types/knowledgeCard.ts`

Represents a chunk of the legal knowledge base (RAG document). This is the shape returned in `cards_used` for source citations.

```typescript
export interface KnowledgeCard {
  id: string;
  title: string;
  content: string;
  topic: string;
  category: string;
  source_url: string;
  review_status: string;
  numeric_section?: string;
  created_at: string;
  updated_at: string;
  metadata?: {
    source?: string;          // 'v2' | 'v1' | 'example'
    concept?: string;
    section?: string;
    provision?: string;
    topicKey?: string;
  };
}
```

### User Profile

**File**: `frontend/src/types/user.ts`

```typescript
export interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  created_at: string;
  remaining_messages?: number;
  daily_limit?: number;
}
```

### API Client Types

**File**: `frontend/src/api/client.ts`

```typescript
interface ApiClientConfig {
  baseURL: string;
  timeoutMs?: number;
  token?: string;
}

interface BatchResults {
  results: unknown[];
  limit: number;
}
```

## 6.2 Backend Types

### RagMetadata

**File**: `backend/src/services/rag.service.ts`

The metadata attached to each retrieved RAG document.

```typescript
export interface RagMetadata {
  id: string;
  title: string;
  topic: string;
  category: string;
  review_status: string;
  source_url: string;
  numeric_section?: string;
  source?: string;      // 'v2' knowledge cards | 'v1' statute | 'example'
  concept?: string;
  section?: string;
  provision?: string;
  topicKey?: string;
}
```

### RagResult

**File**: `backend/src/services/rag.service.ts`

A single retrieved document with content and metadata.

```typescript
export interface RagResult {
  content: string;
  metadata: RagMetadata;
}
```

### RagResponse

**File**: `backend/src/services/rag.service.ts`

The complete response from the RAG service.

```typescript
export interface RagResponse {
  query: string;
  results: RagResult[];
}
```

### RagApiResponse

**File**: `backend/src/services/rag.service.ts`

Internal validation type.

```typescript
export interface RagApiResponse {
  query: string;
  results: RagResult[];
}
```

### BackendMessageResult

The message result returned via the SSE `done` event (this is what `toMessage()` in the frontend consumes).

```typescript
export interface BackendMessageResult {
  conversationId: string;
  reply: string;
  cards_used?: KnowledgeCard[];
  overall_confidence?: number;
  overall_review_status?: string;
  disclaimer?: string;
  suggested_follow_ups?: string[];
  answer_format?: 'text' | 'intake' | 'document';
  is_low_confidence?: boolean;
  is_out_of_scope?: boolean;
  quick_replies?: string[];
  provider?: 'gemini' | 'groq';
}
```

### LLM Service Types

**File**: `backend/src/services/llm.service.ts`

```typescript
export interface GenerateRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  onToken?: (token: string) => void;
  metadata?: {
    requestId: string;
    task?: string;
    context?: string;
  };
  signal?: AbortSignal;
  mode?: 'quality' | 'fast';
}

export interface GenerateAnswerRequest extends GenerateRequest {
  documents: RagResult[];
  conversationId?: string;
}

export interface ClassifyIntentRequest {
  mode: 'general' | 'calculator' | 'case' | 'document';
}

export type ProviderId = 'gemini' | 'groq';

export type ProviderConfig = {
  maxRetries: number;
  cooldownMs: number;
  models: string[];
};
```

## 6.3 RAG Python Types

### Route

**File**: `RAG/src/concept_routing.py`

A single concept-routing rule.

```python
@dataclass
class Route:
    id: str
    pattern: str              # regex pattern (re-escaped)
    terms: Tuple[str, ...]    # normalized terms to append to query
    concepts: Tuple[str, ...] # knowledge-card concepts (e.g. "definition.restrictive_trade_practice")
    sections: Tuple[str, ...] # statutory section labels (e.g. "2(41)")
    lift_targets: Tuple[Tuple[str, str], ...]  # ((section, subsection), ...) for section lift
    concept_groups: Tuple[Tuple[str, ...], ...]
    active: bool = True
    group: str = ""
```

### RoutingResult

**File**: `RAG/src/concept_routing.py`

The output of `route_query()`.

```python
@dataclass
class RoutingResult:
    terms: Tuple[str, ...]                     # appended tokens for normalization
    concepts: Tuple[str, ...]                  # all matched concepts to lift
    routes: Tuple[str, ...]                    # matched route ids
    sections: Tuple[str, ...]                  # matched section labels
    lift_targets: Tuple[Tuple[str, str], ...]  # section targets for explicit lift
    concept_groups: Tuple[Tuple[str, ...], ...]
```

### QueryRequest

**File**: `RAG/src/api.py`

```python
class QueryRequest(BaseModel):
    query: str
    top_k: int = 5
```

### QueryResponse

**File**: `RAG/src/api.py`

```python
class QueryResponse(BaseModel):
    query: str
    results: List[RagResult]
```

### RagResult / RagMetadata (RAG side)

**File**: `RAG/src/api.py`

```python
class RagMetadata(BaseModel):
    id: str
    title: str
    topic: str
    category: str
    review_status: str
    source_url: str
    numeric_section: Optional[str] = None
    source: Optional[str] = None
    concept: Optional[str] = None
    section: Optional[str] = None
    provision: Optional[str] = None
    topicKey: Optional[str] = None


class RagResult(BaseModel):
    content: str
    metadata: RagMetadata
```

## 6.4 Cross-Layer Type Contract

The following table shows how a type flows from RAG → Backend → Frontend unchanged for the source-citation feature:

| RAG (Python) | Backend (TS) | Frontend (TS) | Purpose |
|---|---|---|---|
| `metadata.id` | `RagMetadata.id` | `KnowledgeCard.id` | Unique card ID |
| `metadata.title` | `RagMetadata.title` | `KnowledgeCard.title` | Display title |
| `metadata.category` | `RagMetadata.category` | `KnowledgeCard.category` | Category/topic |
| `metadata.source` | `RagMetadata.source` | `KnowledgeCard.metadata?.source` | v2/v1/example |
| `metadata.concept` | `RagMetadata.concept` | `KnowledgeCard.metadata?.concept` | Concept routing |
| `content` | `RagResult.content` | `KnowledgeCard.content` | Body text |
| — | `ragAnswerService` builds PART A/B | `SourceCards` renders | Citations |

## 6.5 Response Type Summary (Event Payloads)

### SSE `done` event payload

```typescript
// Backend → Frontend
interface DoneEventPayload {
  data: BackendMessageResult;
}
```

### SSE `sources` event payload

```typescript
interface SourcesEventPayload {
  type: 'sources';
  sources: { id: string; title: string }[];
}
```

### Message POST response (non-streaming reference)

```typescript
interface MessageResponse {
  message: BackendMessageResult;
}
```

## 6.6 Calculator Response Types

**File**: `backend/src/services/calculators.service.ts`

```typescript
interface LimitationResult {
  causeOfActionDate: string;
  limitationPeriodYears: number;   // 2 for consumer (Section 69)
  deadline: string;
  daysRemaining: number;
  expired: boolean;
  section: string;                 // "69"
  explanation: string;
}

interface JurisdictionResult {
  claimValue: number;
  forum: 'district' | 'state' | 'national';   // Section 34 thresholds
  section: string;                 // "34"
  valueRange: string;
  explanation: string;
  prescribedValueNote?: string;
}

interface PenaltyResult {
  minPenalty: number;
  maxPenalty: number;
  statuteSection: string;
}
```

## 6.7 Environment / Config Types

**File**: `backend/src/config/env.ts`

```typescript
interface EnvSchema {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: string;
  DATABASE_URL: string;
  JWT_SECRET: string;
  RAG_API_URL: string;
  RAG_TOP_K: string;
  CORS_ORIGINS: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  LLM_PROVIDER_ORDER?: string;
  STATUTE_SUBJECT_FIELD?: string;
  STATUTE_LABEL_FIELD?: string;
  ADMIN_USER_EMAIL?: string;
}
```