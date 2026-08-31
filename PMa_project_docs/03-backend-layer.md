?# PMa Backend Layer: Detailed Analysis

## 3.1 Project Structure

```
backend/src/
├── app.ts                 # Express app setup with middleware
├── server.ts              # Entry point with graceful shutdown
├── config/                # Environment & configuration
├── controllers/           # Request handlers (12 controllers)
├── routes/                # Route definitions (12 routes)
├── middleware/            # Auth, error, validation middleware
├── prompts/               # LLM prompt templates (7 prompts + grounding rules)
├── services/              # Business logic services (27 services)
├── repositories/          # Data access (Prisma)
├── types/                 # TypeScript types
├── utils/                 # Helpers & formatters
├── validators/            # Zod validation schemas
├── errors/                # Custom error classes
└── templates/             # Document templates
```

## 3.2 Key Services

### 3.2.1 `llm.service.ts` (890 lines - Major Refactor)

**Purpose**: LLM integration with streaming, structured output, intent classification, and multi-provider failover.

**Key Features**:
- **`streamChat()`**: Async generator yielding tokens for SSE streaming
- **`generateStructured()`**: JSON mode parsing with fence stripping fallback
- **`classifyIntent()`**: 5 intent types with confidence scores
- **`generateRetrievalQuery()`**: LLM-query optimization for RAG
- **`withRetry()`**: Exponential backoff retry logic (max 3 attempts per key)
- **`countTokens()`**: Context window management
- **Multi-provider failover**: Groq ↔ Gemini with cooldown management
- **Key rotation**: Distributes load across multiple API keys
- **Provider cooldowns**: Prevents repeated calls to overloaded/quota-exhausted keys

**Failure Classification** (`classifyFailure()`):
- `capacity` - Model pool overloaded (503/502/504)
- `quota` - Key out of quota (429, Gemini 500)
- `auth` - Invalid/revoked key (401/403)
- `badRequest` - Malformed request (400/404/422)
- `timeout` - Request timed out

**Retry Logic** (`withRetry()`):
- Max 3 key attempts per provider
- Exponential backoff: 750ms, 1500ms, 3000ms (capped at 4s)
- Overall timeout: 90s for quality calls, 30s for fast calls
- Per-key cooldown: 10min after auth failure, 30s after quota failure

**Provider Order** (default): `["groq", "gemini"]`

**Models**:
- Fast: Groq `llama3-groq-70b-8192`, Gemini `gemini-1.5-flash`
- Quality: Groq `mixtral-8x7b-32768`, Gemini `gemini-1.5-pro`

### 3.2.2 `rag.service.ts` (125 lines)

**Purpose**: RAG orchestration - routes messages to appropriate workflows and calls RAG API.

**Key Features**:
- `query()`: POST to RAG API with timeout and abort controller
- Routes based on intent type to: `caseWorkflow`, `documentWorkflow`, `generalWorkflow`, or `calculatorsService`
- Handles malformed responses and network errors
- Configurable base URL and top-k from environment

**Interfaces**:
```typescript
export interface RagMetadata {
  source?: string;        // "v1" for verbatim statute, "v2" for knowledge card
  concept_id?: string;
  concept_type?: string;
  title?: string;
  review_status?: string;
  derived_from?: string;
  related_concepts?: string;
  v1_id?: string;         // v1 statute chunk identifier
  official_text?: string; // Verbatim statute text
  section_number?: string;
  subsection_number?: string;
  node_type?: string;
  content_type?: string;
}

export interface RagResult {
  content: string;
  metadata: RagMetadata;
}

export interface RagResponse {
  query: string;
  results: RagResult[];
}
```

### 3.2.3 `calculators.service.ts` (Uncommitted - Corrected)

**Purpose**: Jurisdiction and limitation calculations with enacted values.

**Key Improvements** (from BACKEND_IMPROVEMENTS.md):

**Jurisdiction Thresholds Fixed**:
```typescript
// AFTER (correct - enacted values from Gazette PDF):
const ONE_CRORE = 10_000_000;    // s.34(1) enacted value
const TEN_CRORE = 100_000_000;   // s.47(1)(a)(i), s.58(1)(a)(i) enacted values

// Prescriptive proviso note added to ALL results:
const PRESCRIBED_VALUE_NOTE =
  "These are the values enacted in the Consumer Protection Act, 2019. Each of " +
  "Sections 34(1), 47(1)(a)(i) and 58(1)(a)(i) ends with the proviso that " +
  "\"where the Central Government deems it necessary so to do, it may prescribe " +
  "such other value, as it deems fit\". A prescribed value is made by " +
  "notification and is not part of the Act, so it is outside the material this " +
  "assistant works from - check the current prescribed value before you file.";
```

**Section References Corrected**:
- Before: "Section 34(1)(a)" - doesn't exist
- After: "Section 34(1)", "Section 47(1)(a)(i)", "Section 58(1)(a)(i)"

**Limitation Explanation** (corrected):
```
"Under Section 69(1) a Commission shall not admit a complaint unless it " +
"is filed within two years from the date on which the cause of action " +
"has arisen. Section 69(2) allows a later complaint to be entertained if " +
"the complainant satisfies the Commission that he had sufficient cause " +
"for not filing in time, and the proviso to Section 69(2) requires the " +
"Commission to record its reasons for condoning the delay."
```

**Result Interface**:
```typescript
export interface JurisdictionResult {
  claimValue: number;
  forum: string;
  section: string;
  valueRange: string;
  explanation: string;
  prescribedValueNote: string;  // ALWAYS present
}
```

### 3.2.4 `caseWorkflow.service.ts` (101 lines - New)

**Purpose**: Multi-step case analysis workflow.

**Methods**:
```typescript
class CaseWorkflowService {
  async extractIssues(narrative: string): Promise<LegalIssue[]>
  async retrieveLaw(issues: LegalIssue[]): Promise<KnowledgeCard[]>
  async generateAnalysis(narrative: string, law: KnowledgeCard[]): Promise<CaseAnalysis>
  suggestNextSteps(analysis: CaseAnalysis): NextStep[]
}
```

**Workflow**:
1. Extract legal issues from user narrative
2. Retrieve applicable law sections via RAG
3. Generate structured case analysis (issues, law, orders sought)
4. Suggest next steps: intake, calculator, or document generation

### 3.2.5 `documentWorkflow.service.ts` (59 lines - New)

**Purpose**: Document generation pipeline.

**Methods**:
```typescript
class DocumentWorkflowService {
  selectTemplate(intake: IntakeData): DocumentTemplate
  async populateTemplate(template: DocumentTemplate, intake: IntakeData, citations: Citation[]): Promise<string>
  validateIntake(intake: IntakeData): ValidationResult
}
```

**Template Selection Logic**:
- Maps case type + relief sought to template
- Populates template with intake data and legal citations from RAG
- Validates required fields before generation

**Available Templates**: Complaint, Legal Notice, Appeal

### 3.2.6 `generalWorkflow.service.ts` (36 lines - New)

**Purpose**: General Q&A workflow (non-case queries).

**Method**:
```typescript
async handleQuery(query: string, history: Message[]): Promise<WorkflowResult>
```

**Steps**:
1. Classify intent (via LLM)
2. Generate retrieval query (optimized for RAG)
3. Call RAG API (POST /query)
4. Format answer with citations

### 3.2.7 `knowledge.service.ts` (New)

**Purpose**: Consumer Protection Act domain logic.

**Methods**:
```typescript
class KnowledgeService {
  mapToSections(query: string): string[]     // Map query terms to statute sections
  getCard(conceptId: string): KnowledgeCard | null  // Get card by concept_id
  validateCitation(conceptId: string): boolean      // Validate citation exists
  calculateLimitation(causeOfAction: Date): LimitationResult
  calculateCompensation(params: CompensationParams): CompensationResult
}
```

**Domain Logic**:
- Section mapping based on query terms
- Card retrieval by concept ID
- Citation validation
- Legally-correct calculators with enacted values

### 3.2.8 `message.service.ts` (Streaming)

**Purpose**: SSE message streaming setup and token/source/done events.

**Key Features** (`sendMessage()` method):
- Ownership check: Verify conversation belongs to authenticated user
- SSE headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`
- AbortController: Cancel in-flight generation on client disconnect
- Heartbeat: Every 15s to prevent proxy/CDN timeouts
- Event callbacks:
  - `onStatus`: Progress updates ("Finding relevant sections...")
  - `onToken`: Token chunks for typewriter effect
  - `signal`: Disconnect signal from AbortController
- Error handling with graceful cleanup
- Final "done" event with result

**SSE Event Format**:
```
event: status    data: {"status": "Finding relevant sections..."}
event: delta     data: {"token": "Consumer"}
event: delta     data: {"token": " protection"}
event: sources   data: {"sources": [...], "type": "sources"}
event: done      data: {"message": {...}, "type": "done"}
event: error     data: {"error": "..."}
```

### 3.2.9 `ragAnswer.service.ts` (New - 232 lines)

**Purpose**: Format RAG retrieval results into cited answers.

**Methods**:
```typescript
class RagAnswerService {
  buildContext(documents: Document[], maxTokens: number): string
  formatAnswer(rawAnswer: string, citations: Citation[]): FormattedAnswer
  validateCitations(answer: string, docs: Document[]): boolean
}
```

**Key Improvement** (from BACKEND_IMPROVEMENTS.md - PART A/PART B Split):

**PART A — STATUTE (VERBATIM, AUTHORITATIVE)**:
- Loads verbatim text from v1-statute.jsonl via statuteIndex.ts
- Resolves each card's derived_from to statute nodes
- Budget: 12,000 chars, max 4 provisions per card
- Breadth-first: every card gets primary provision before any gets second
- Sorted in statutory order (section → subsection)
- Labels: [A1], [A2], ... for citation

**PART B — INTERPRETIVE MATERIAL (NOT THE WORDS OF THE ACT)**:
- Cards headed "[Source N]" (never a citation)
- Each card lists statutory anchors: "Statutory Text: see [A1], [A3] above"
- Content Nature tag: "illustrative example card (interpretive, not statutory wording)"
- Citation built from resolved statute nodes, not raw derived_from

**Key Constants** (configurable via env):
```typescript
const PROVISIONS_PER_CARD = Number(process.env.STATUTE_PROVISIONS_PER_CARD ?? 4);
const PART_A_CHAR_BUDGET = Number(process.env.STATUTE_CHAR_BUDGET ?? 12_000);
```

**Flow**:
```
1. Separate results: statuteResults (source:v1) vs cardResults (source:v2)
2. For each card: parse derived_from → resolveStatuteNode() → getStatuteNodes()
3. Collect statute nodes: direct statute first, then breadth-first (1 per card, then 2nd)
4. Sort by section → subsection, assign [A1], [A2] labels
5. Render PART A with [A1] labels, clause markers from official_text
6. Render PART B with [Source N] headings, anchors to PART A labels
7. Content Nature tag per concept_type
```

### 3.2.10 `title.service.ts` (New - 24 lines test)

**Purpose**: Auto-generate conversation titles from first message.

**Method**:
```typescript
class TitleService {
  async generateTitle(firstMessage: string): Promise<string>
}
```

**Logic**:
- Uses LLM with specific prompt for concise titles
- Falls back to truncation if LLM fails
- Updates conversation title when first user message is received

### 3.2.11 `intent.service.ts` (Intent Classification)

**Purpose**: Intent classification for workflow routing.

**Logic**:
- Classifies user query into one of 5 types
- Returns intent type with confidence score
- Routes to appropriate workflow (case, document, general, calculator)

### 3.2.11 `retrievalQuery.service.ts` (Retrieval Query Generation)

**Purpose**: Generate optimized retrieval queries from LLM.

**Logic**:
- Takes user query and optional history
- Returns optimized query for RAG retrieval
- Expands legal terms, adds synonyms

## 3.3 Controllers & Routes

### 3.3.1 Controller Overview

| Controller | Key Endpoints | Purpose |
|-----------|--------------|---------|
| `message.controller.ts` | `POST /api/messages` | Send message with SSE streaming |
| `auth.controller.ts` | `POST /api/auth/*` | Registration, login, token refresh |
| `conversation.controller.ts` | `GET/POST /api/conversations` | CRUD operations |
| `calculators.controller.ts` | `POST /api/calculators/*` | Limitation, compensation, penalty |
| `intake.controller.ts` | `POST /api/intake/*` | 5-step intake wizard |
| `documents.controller.ts` | `POST /api/documents/*` | Template generation |

### 3.3.2 `message.controller.ts` (96 lines)

**`sendMessage()` Method Key Steps**:

1. **Ownership check**: Verify conversation belongs to authenticated user
   ```typescript
   if (conversationId) {
     const conversation = await conversationRepository.findById(conversationId);
     if (!conversation) throw NotFoundError("Conversation not found.");
     if (conversation.userId !== req.user.sub) 
       throw ForbiddenError("You do not have access to this conversation.");
   }
   ```

2. **SSE headers setup**:
   ```typescript
   res.setHeader("Content-Type", "text/event-stream");
   res.setHeader("Cache-Control", "no-cache, no-transform");
   res.setHeader("Connection", "keep-alive");
   res.flushHeaders();
   ```

3. **AbortController** for client disconnect cancellation

4. **Heartbeat** every 15s to prevent proxy/CDN timeouts

5. **Call workflowService.processMessage()** with callbacks:
   ```typescript
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
   ```

6. **Send "done" event** with final result

7. **Error handling** with graceful cleanup (clear heartbeat, res.end())

### 3.3.3 Route Definitions

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/messages` | POST | Send message with SSE streaming |
| `/api/auth/register` | POST | Register new user |
| `/api/auth/login` | POST | Login user |
| `/api/auth/me` | GET | Get current user |
| `/api/auth/refresh` | POST | Refresh access token |
| `/api/conversations` | GET | List user conversations |
| `/api/conversations` | POST | Create new conversation |
| `/api/conversations/:id` | GET | Get conversation with messages |
| `/api/conversations/:id` | PATCH | Update title |
| `/api/conversations/:id` | DELETE | Delete conversation |
| `/api/messages/:id` | GET | Get message history |
| `/api/calculators/limitation` | POST | Limitation period calculation |
| `/api/calculators/compensation` | POST | Compensation estimation |
| `/api/calculators/penalty` | POST | Statutory penalty calculation |
| `/api/intake/start` | POST | Initialize intake session |
| `/api/intake/step` | POST | Submit step data |
| `/api/intake/submit` | POST | Finalize & generate case |
| `/api/intake/:id` | GET | Get intake progress |
| `/api/documents/generate` | POST | Generate from template |
| `/api/documents/templates` | GET | List available templates |
| `/api/documents/preview` | POST | Preview without saving |
| `/api/health` | GET | Health check |

### 3.3.4 `calculators.routes.ts`

```typescript
const router = Router();

// POST /api/calculators/limitation
router.post('/limitation', 
  validate(calculatorsValidator.limitation),
  asyncHandler(calculatorsController.calculateLimitation)
);

// POST /api/calculators/compensation
router.post('/compensation',
  validate(calculatorsValidator.compensation),
  asyncHandler(calculatorsController.calculateCompensation)
);

// POST /api/calculators/penalty
router.post('/penalty',
  validate(calculatorsValidator.penalty),
  asyncHandler(calculatorsController.calculatePenalty)
);
```

### 3.3.5 `intake.routes.ts`

```typescript
const router = Router();

// POST /api/intake/start - Initialize session
// POST /api/intake/step - Submit step data (validates per step)
// POST /api/intake/submit - Finalize → creates case + conversation
// GET /api/intake/:id - Get intake progress
```

### 3.3.6 `documents.routes.ts`

```typescript
// POST /api/documents/generate - Generate from template
// GET /api/documents/templates - List available templates
// POST /api/documents/preview - Preview without saving
```

### 3.3.7 `auth.routes.ts`

```typescript
// POST /api/auth/register - Register new user
// POST /api/auth/login - Login user
// GET /api/auth/me - Get current user
// POST /api/auth/refresh - Refresh access token
```

## 3.4 Middleware

### 3.4.1 Authentication Middleware (`auth.middleware.ts`)

**Function**: `authMiddleware`

**Logic**:
- Extracts JWT from Authorization header or httpOnly cookie
- Verifies token signature and expiry
- Attaches `req.user` with user sub (ID) and role
- Returns 401 if invalid/expired

### 3.4.2 Validation Middleware (`validation.middleware.ts`)

**Function**: `validate(schema)`

**Logic**:
- Validates request body against Zod schema
- Returns 400 with error details if validation fails
- Attaches validated data to `req.body`

### 3.4.3 Error Middleware (`error.middleware.ts`)

**Function**: `errorMiddleware`

**Logic**:
- Catches all async error handlers
- Maps custom errors (NotFoundError, ForbiddenError, etc.) to appropriate HTTP status
- Logs errors with context
- Returns standardized error response format

### 3.4.4 Logging Middleware (`logging.middleware.ts`)

**Function**: `requestLoggingMiddleware`

**Logic**:
- Logs request method, URL, response time, status code
- Uses pino logger structure
- Helps with debugging and monitoring

### 3.4.5 Request Logging

```
const logger = pino({
  level: env.LOG_LEVEL || "info",
  transport: {
    target: "pino-pretty",
    options: { colorize: true }
  }
});
```

## 3.5 Prisma Schema Changes

### 3.5.1 NEW MODEL: `IntakeData`

```prisma
model IntakeData {
  id             String   @id @default(cuid())
  conversationId String   @unique
  conversation   Conversation @relation(
    fields: [conversationId], 
    references: [id], 
    onDelete: Cascade
  )
  
  caseType       String   // consumer_dispute, service_deficiency, product_liability
  parties        Json     // { complainant: {}, respondent: {} }
  incident       Json     // { date, description, value, location }
  evidence       Json     // { documents: [], photos: [], bills: [] }
  reliefSought   Json     // { refund, replacement, compensation, punitive }
  
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

### 3.5.2 ENHANCED MODEL: `Conversation`

```prisma
model Conversation {
  // ... existing fields
  intake IntakeData?  // NEW: Optional one-to-one
}
```

### 3.5.3 Migration Files Added

1. `20260815070722_message_envelope_metadata` - Message metadata JSON field
2. `20260816000100_remove_v1_nodes_used` - Cleanup legacy fields

### 3.5.4 Migration Commands

```bash
npx prisma generate          # Generate Prisma client
npx prisma migrate deploy    # Run migrations
npx prisma db pull           # Verify schema
npm run build                # Build TypeScript
npm test                     # Run tests
npm start                    # Start production
```

## 3.6 Environment Configuration

### 3.6.1 Backend `.env`

```env
# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/pma"

# Authentication
JWT_SECRET="your-super-secret-key"
JWT_EXPIRES_IN="7d"

# Server
PORT=3000

# RAG Service
RAG_API_URL="http://localhost:8000"

# LLM API Keys
GOOGLE_API_KEY="your-gemini-api-key"
GEMINI_API_KEYS="key1,key2"      # Comma-separated, fallback to single
GROQ_API_KEYS="key1,key2"

# LLM Provider Configuration
LLM_PROVIDER_ORDER="groq,gemini"  # Default: try Groq first, then Gemini
GEMINI_FAST_MODEL="gemini-1.5-flash"
GEMINI_MODEL="gemini-1.5-pro"
GROQ_FAST_MODEL="llama3-groq-70b-8192"
GROQ_MODEL="mixtral-8x7b-32768"

# CORS
CORS_ORIGINS="http://localhost:5173"

# RAG Formatter Configuration
STATUTE_PROVISIONS_PER_CARD=4
STATUTE_CHAR_BUDGET=12000
STATUTE_DATA_PATH=/path/to/v1-statute.jsonl
KNOWLEDGE_CARDS_PATH=/path/to/v2-knowledge-cards.jsonl

# Logging
LOG_LEVEL="info"
```

### 3.6.2 RAG `.env`

```env
CHROMA_PERSIST_DIR="./data/chroma_db"
EMBEDDING_MODEL="sentence-transformers/all-MiniLM-L6-v2"
TOP_K=5
BM25_WEIGHT=0.3
VECTOR_WEIGHT=0.7
GOOGLE_API_KEY="your-gemini-api-key"
```

### 3.6.3 Frontend `.env`

```env
VITE_API_URL=http://localhost:3000
VITE_RAG_API_URL=http://localhost:8000
VITE_APP_NAME=PMa Legal Assistant
```

## 3.7 Key Files Reference

| Category | Key Files |
|----------|-----------|
| App Setup | `backend/src/app.ts`, `backend/src/server.ts` |
| RAG Integration | `backend/src/services/rag.service.ts` |
| LLM Service | `backend/src/services/llm.service.ts` |
| Workflow Services | `backend/src/services/caseWorkflow.service.ts`, `documentWorkflow.service.ts`, `generalWorkflow.service.ts` |
| Calculators | `backend/src/services/calculators.service.ts` |
| Validators | `backend/src/validators/calculators.validator.ts` |
| Prisma Schema | `backend/prisma/schema.prisma` |
| Prompts | `backend/src/prompts/*.prompt.ts`, `backend/src/prompts/statuteGrounding.rules.ts` |
| Error Classes | `backend/src/errors/` |
| Utilities | `backend/src/utils/` |

## 3.8 Uncommitted Changes (Need Review/Commit)

**Modified** (require review):
- `backend/src/prompts/caseAnswer.prompt.ts` - Added STATUTE_GROUNDING_RULES, YES/NO rule
- `backend/src/prompts/documentAnswer.prompt.ts` - Added STATUTE_GROUNDING_RULES, legal grounds rule
- `backend/src/prompts/generalAnswer.prompt.ts` - Added STATUTE_GROUNDING_RULES, direct question rule
- `backend/src/services/calculators.service.ts` - FIXED: thresholds to enacted values, added proviso note
- `backend/src/services/calculators.service.test.ts` - Tests need update for new values
- `backend/src/services/rag.service.ts` - Enhanced RagMetadata for v1 statute chunks
- `backend/src/templates/documentTemplates.ts` - Template updates
- `backend/src/utils/ragAnswerFormatter.ts` - MAJOR: Split PART A/PART B, statute integration
- `backend/src/utils/ragAnswerFormatter.test.ts` - Tests for new formatter

**New Files (Need Commit)**:
- `backend/.gitignore` - Proper gitignore
- `backend/vitest.config.ts` - Test config (fixes ESM/CommonJS)
- `backend/src/prompts/statuteGrounding.rules.ts` - Shared grounding rules
- `backend/src/templates/documentTemplates.test.ts` - Template tests
- `backend/src/utils/statuteIndex.ts` - Statute index loader