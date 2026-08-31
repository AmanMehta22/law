# PMa - Legal Assistant Chatbot
## Complete Project Workflow Documentation

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [User Workflow](#user-workflow)
3. [Developer Workflow](#developer-workflow)
4. [System Architecture](#system-architecture)
5. [Data Flow](#data-flow)
6. [API Endpoints](#api-endpoints)
7. [Running the Project](#running-the-project)
8. [Testing & Evaluation](#testing--evaluation)

---

## Project Overview

**PMa** is a Legal Assistant Chatbot specialized in **Indian Consumer Protection Act 2019**. It provides:
- RAG-powered legal Q&A with source citations
- Structured intake wizard for case documentation
- Compensation/limitation calculators
- Document template generation
- Conversation management with persistence

### Tech Stack
| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite, TanStack Query, TailwindCSS |
| Backend | Node.js, Express 5, TypeScript, Prisma ORM |
| RAG Service | Python, FastAPI, ChromaDB, LangChain, SentenceTransformers |
| Database | PostgreSQL (via Prisma) |
| Vector Store | ChromaDB (local persistence) |
| LLM | Google Gemini (via @google/genai) |

---

## User Workflow

### 1. Authentication Flow
```
User visits app
    │
    ├─► Not authenticated → Redirect to /auth
    │       │
    │       ├─► Register → POST /api/auth/register → JWT + User profile
    │       └─► Login → POST /api/auth/login → JWT + User profile
    │
    └─► Authenticated → Redirect to /chat
```

### 2. Main Chat Flow
```
User opens /chat
    │
    ├─► Load conversation history (GET /api/conversations)
    │
    ├─► User sends message
    │       │
    │       ├─► POST /api/messages (streaming)
    │       │       │
    │       │       ├─► Intent Classification (LLM)
    │       │       │       ├─► GENERAL_QUERY → RAG Retrieval
    │       │       │       ├─► CASE_ANALYSIS → RAG + Workflow
    │       │       │       ├─► DOCUMENT_QA → RAG + Document context
    │       │       │       └─► CALCULATOR → Calculator service
    │       │       │
    │       │       ├─► RAG Query → POST http://localhost:8000/query
    │       │       │       └─► Returns top-K knowledge cards
    │       │       │
    │       │       ├─► LLM generates answer with citations
    │       │       │
    │       │       └─► Stream response to frontend (SSE)
    │       │
    │       └─► Save message + sources to DB
    │
    └─► Display answer with Source Cards (citations)
```

### 3. Intake Wizard Flow
```
User clicks "Start Intake"
    │
    ├─► Step 1: Case Type Selection (Consumer/Service/Product)
    ├─► Step 2: Party Details (Complainant/Respondent)
    ├─► Step 3: Incident Details (Date, Description, Value)
    ├─► Step 4: Evidence Upload (Documents, Photos, Bills)
    ├─► Step 5: Relief Sought (Refund, Replacement, Compensation)
    │
    └─► POST /api/intake/submit
            │
            ├─► Generate case summary
            ├─► Create conversation with context
            └─► Return case ID + next steps
```

### 4. Calculator Flow
```
User navigates to /calculators
    │
    ├─► Limitation Calculator
    │       ├─► Input: Cause of action date
    │       └─► Output: Days remaining / expiry date
    │
    ├─► Compensation Calculator
    │       ├─► Input: Purchase price, defect type, harm level
    │       └─► Output: Estimated compensation range
    │
    └─► Penalty Calculator
            ├─► Input: Violation type, business scale
            └─► Output: Statutory penalty range
```

### 5. Document Generation Flow
```
User completes intake → Clicks "Generate Document"
    │
    ├─► Select template: Complaint / Legal Notice / Appeal
    │
    ├─► POST /api/documents/generate
    │       │
    │       ├─► Populate template with intake data
    │       ├─► Add legal citations from RAG
    │       └─► Return formatted document (Markdown/PDF)
    │
    └─► Download / Copy / Edit
```

---

## Developer Workflow

### 1. Local Development Setup

#### Prerequisites
```bash
# Check versions
node --version    # >= 18
npm --version     # >= 9
python --version  # >= 3.10 (use `py -3` on Windows)
```

#### Initial Setup
```bash
# 1. Clone & install dependencies
cd backend && npm install
cd ../frontend && npm install
cd ../RAG && py -3 -m pip install -r requirements.txt

# 2. Environment configuration
cp backend/.env.example backend/.env
cp RAG/.env.example RAG/.env
# Edit both with API keys (Google Gemini, etc.)

# 3. Database setup
cd backend
npx prisma generate
npx prisma migrate dev --name init

# 4. Build legal dataset (one-time)
cd ../legal-dataset
# Follow dataset README for processing
```

### 2. Development Commands

#### Backend (Terminal 1)
```bash
cd backend

# Development with hot reload
npm run dev          # tsx watch src/server.ts

# Type checking
npm run lint         # tsc --noEmit

# Testing
npm test             # vitest run
npm run test:watch   # vitest

# Database
npm run prisma:generate
npm run prisma:migrate
npm run prisma:studio

# Build for production
npm run build        # tsc
npm start            # node dist/server.js
```

#### Frontend (Terminal 2)
```bash
cd frontend

# Development server
npm run dev          # tsx server.ts + vite

# Type checking
npm run lint         # tsc --noEmit

# Testing
npm test             # vitest run

# Production build
npm run build        # vite build + esbuild server.ts
npm start            # node dist/server.cjs

# Preview production build
npm run preview
```

#### RAG Service (Terminal 3)
```bash
cd RAG

# Development (auto-reload)
py -3 main.py        # uvicorn with reload

# Production
py -3 -m uvicorn src.api:app --host 0.0.0.0 --port 8000

# Evaluation
py -3 eval/run_eval.py

# Rebuild vector store (after dataset changes)
py -3 -c "
from src.ingest import build_vector_store
build_vector_store()
"
```

### 3. Code Structure & Conventions

#### Backend (`backend/src/`)
```
src/
├── app.ts                 # Express app setup
├── server.ts              # Entry point
├── config/                # Environment & config
├── controllers/           # Request handlers
├── services/              # Business logic
│   ├── rag.service.ts     # RAG orchestration
│   ├── knowledge.service.ts  # Domain logic
│   ├── workflow.service.ts   # Multi-step flows
│   └── *.service.ts
├── repositories/          # Data access (Prisma)
├── routes/                # Route definitions
├── middleware/            # Auth, error, validation
├── prompts/               # LLM prompt templates
├── templates/             # Document templates
├── types/                 # TypeScript types
├── utils/                 # Helpers & formatters
├── validators/            # Zod schemas
└── errors/                # Custom error classes
```

#### Frontend (`frontend/src/`)
```
src/
├── main.tsx               # Entry point
├── App.tsx                # Root component + routes
├── api/                   # API clients (axios + TanStack Query)
├── components/            # Reusable UI components
├── pages/                 # Route-level components
├── store/                 # React Context + Reducer
├── hooks/                 # Custom hooks
├── types/                 # TypeScript types
├── utils/                 # Helpers
└── constants/             # Constants
```

#### RAG (`RAG/src/`)
```
src/
├── api.py                 # FastAPI endpoints
├── config.py              # Settings
├── vectorStore.py         # ChromaDB wrapper
├── retriever.py           # Retrieval logic (BM25 + Vector)
├── documentBuilder.py     # Document processing
├── embeddings.py          # Embedding model
├── ingest.py              # Data ingestion pipeline
├── jsonLoader.py          # JSON loader
└── statuteLoader.py       # Statute loader
```

### 4. Adding New Features

#### New API Endpoint (Backend)
```bash
# 1. Add validator
touch src/validators/newFeature.validator.ts

# 2. Add service
touch src/services/newFeature.service.ts

# 3. Add controller
touch src/controllers/newFeature.controller.ts

# 4. Add routes
touch src/routes/newFeature.routes.ts

# 5. Register in app.ts
import newFeatureRoutes from './routes/newFeature.routes'
app.use('/api/new-feature', newFeatureRoutes)
```

#### New UI Component (Frontend)
```bash
# 1. Create component
touch src/components/NewComponent.tsx

# 2. Add to page or create new page
touch src/pages/NewPage.tsx

# 3. Add route in App.tsx
<Route path="/new-page" element={<NewPage />} />
```

#### New Knowledge Domain (RAG)
```bash
# 1. Add JSON files to legal-dataset/acts/new-act/
# 2. Update schema if needed (legal-dataset/schema/v2.schema.json)
# 3. Rebuild vector store
py -3 -c "from src.ingest import build_vector_store; build_vector_store()"
# 4. Update knowledge service domain mapping
```

---

## System Architecture

### High-Level Diagram
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │────►│   Backend       │────►│   RAG Service   │
│   (React/Vite)  │     │   (Express)     │     │   (FastAPI)     │
│   Port: 5173    │     │   Port: 3000    │     │   Port: 8000    │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
              ┌─────────┐  ┌──────────┐  ┌──────────┐
              │PostgreSQL│  │  Redis   │  │ChromaDB  │
              │ (Prisma) │  │ (Session)│  │ (Vector) │
              └─────────┘  └──────────┘  └──────────┘
```

### Request Flow (Chat Message)
```
1. User types message in frontend
         │
         ▼
2. Frontend: useSendMessage hook
   - POST /api/messages (streaming)
   - Adds to local state immediately
         │
         ▼
3. Backend: message.controller.ts
   - Validates input (Zod)
   - Creates message record
   - Calls message.service.sendMessage()
         │
         ▼
4. message.service.ts
   - Classifies intent (LLM)
   - Routes to workflow:
     • generalWorkflow → RAG + answer
     • caseWorkflow → Intake + RAG + answer
     • documentWorkflow → Template + RAG
   - Streams tokens via SSE
         │
         ▼
5. rag.service.ts (for RAG flows)
   - Generates retrieval query (LLM)
   - Calls RAG API: POST /query
   - Receives top-K documents
   - Builds context + citations
   - Calls LLM for final answer
         │
         ▼
6. RAG Service (Python)
   - Vector search (ChromaDB)
   - BM25 keyword search
   - Hybrid ranking
   - Returns documents with metadata
         │
         ▼
7. Backend formats answer
   - Adds source citations
   - Saves to database
   - Streams to frontend
         │
         ▼
8. Frontend displays
   - Streaming text
   - Source cards (clickable)
   - Follow-up suggestions
```

---

## Data Flow

### Knowledge Card Structure (v2)
```json
{
  "concept_id": "right.right_to_refund",
  "title": "Right to Refund",
  "category": "rights",
  "tags": ["refund", "defective", "service"],
  "jurisdiction": "india",
  "statute": "Consumer Protection Act, 2019",
  "sections": ["Section 2(9)", "Section 14"],
  "content": "A consumer has the right to...",
  "examples": [...],
  "exceptions": [...],
  "cross_references": [...],
  "metadata": {
    "version": "2.0",
    "last_updated": "2026-08-01",
    "source": "bare_act"
  }
}
```

### Database Schema (Prisma)
```prisma
model User {
  id        String       @id @default(cuid())
  email     String       @unique
  password  String
  name      String?
  createdAt DateTime     @default(now())
  conversations Conversation[]
}

model Conversation {
  id        String   @id @default(cuid())
  userId    String
  title     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  messages  Message[]
  intake    IntakeData?
}

model Message {
  id              String   @id @default(cuid())
  conversationId  String
  role            String   // user | assistant | system
  content         String
  sources         Json?    // Citation metadata
  metadata        Json?    // Intent, workflow state
  createdAt       DateTime @default(now())
}

model IntakeData {
  id             String   @id @default(cuid())
  conversationId String   @unique
  caseType       String
  parties        Json
  incident       Json
  evidence       Json
  reliefSought   Json
  createdAt      DateTime @default(now())
}
```

### Vector Store (ChromaDB)
- **Collection**: `consumer_protection_v2`
- **Embedding Model**: `sentence-transformers/all-MiniLM-L6-v2`
- **Metadata**: concept_id, category, statute, section, title
- **Hybrid Search**: Vector similarity + BM25 keyword

---

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login user |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/refresh` | Refresh access token |

### Conversations
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/conversations` | List user conversations |
| POST | `/api/conversations` | Create new conversation |
| GET | `/api/conversations/:id` | Get conversation with messages |
| PATCH | `/api/conversations/:id` | Update title |
| DELETE | `/api/conversations/:id` | Delete conversation |

### Messages (Streaming)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/messages` | Send message (SSE stream) |
| GET | `/api/conversations/:id/messages` | Get message history |

### Intake Wizard
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/intake/start` | Initialize intake session |
| POST | `/api/intake/step` | Submit step data |
| POST | `/api/intake/submit` | Finalize & generate case |
| GET | `/api/intake/:id` | Get intake progress |

### Calculators
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/calculators/limitation` | Calculate limitation period |
| POST | `/api/calculators/compensation` | Estimate compensation |
| POST | `/api/calculators/penalty` | Calculate statutory penalty |

### Documents
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/documents/generate` | Generate from template |
| GET | `/api/documents/templates` | List available templates |
| POST | `/api/documents/preview` | Preview without saving |

### RAG Service (Internal)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/query` | Retrieve documents |

**Request:**
```json
{
  "query": "consumer rights for defective product refund",
  "top_k": 5
}
```

**Response:**
```json
{
  "query": "consumer rights for defective product refund",
  "results": [
    {
      "content": "A consumer has the right to...",
      "metadata": {
        "concept_id": "right.right_to_refund",
        "category": "rights",
        "statute": "Consumer Protection Act, 2019",
        "sections": ["Section 14"]
      }
    }
  ]
}
```

---

## Running the Project

### Development (3 Terminals)
```bash
# Terminal 1: RAG API
cd RAG && py -3 main.py

# Terminal 2: Backend
cd backend && npm run dev

# Terminal 3: Frontend
cd frontend && npm run dev
```

### Verify All Services
```bash
# Health checks
curl http://localhost:8000/health    # RAG
curl http://localhost:3000/health    # Backend
curl http://localhost:5173           # Frontend
```

### Production Build
```bash
# Build all
cd backend && npm run build
cd ../frontend && npm run build
cd ../RAG && py -3 -m pip install -r requirements.txt

# Run production
cd backend && npm start          # Port 3000
cd frontend && npm start         # Port 5173 (serves static + API)
cd RAG && py -3 -m uvicorn src.api:app --host 0.0.0.0 --port 8000
```

### Docker (Optional)
```dockerfile
# docker-compose.yml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: pma
      POSTGRES_USER: pma
      POSTGRES_PASSWORD: pma
    volumes:
      - pgdata:/var/lib/postgresql/data

  backend:
    build: ./backend
    ports: ["3000:3000"]
    depends_on: [postgres]
    environment:
      DATABASE_URL: postgresql://pma:pma@postgres:5432/pma

  frontend:
    build: ./frontend
    ports: ["5173:5173"]
    depends_on: [backend]

  rag:
    build: ./RAG
    ports: ["8000:8000"]
    volumes:
      - ./RAG/data:/app/data

volumes:
  pgdata:
```

---

## Testing & Evaluation

### Backend Tests
```bash
cd backend
npm test                 # All tests
npm test -- --watch     # Watch mode
npm test -- --coverage  # With coverage
```

**Test Files:**
- `services/*.service.test.ts` - Unit tests
- `utils/*.test.ts` - Utility tests
- Run with `vitest`

### Frontend Tests
```bash
cd frontend
npm test                 # All tests (chatReducer)
```

### RAG Evaluation
```bash
cd RAG
py -3 eval/run_eval.py
```

**Output:**
```
Eval set: 106 questions (k=5)
Strict recall@5:  73.6%
Content recall@5: 99.1%

Category breakdown:
definitions       21  100.0%   100.0%
evidence           2  100.0%   100.0%
procedures        16   50.0%    93.8%
...
```

### Manual Testing Checklist
- [ ] User registration & login
- [ ] Chat with legal queries
- [ ] Source citations display correctly
- [ ] Intake wizard completes all steps
- [ ] Calculators return valid results
- [ ] Document generation works
- [ ] Conversation persistence
- [ ] Error handling (network, auth, validation)

---

## Environment Variables

### Backend (`backend/.env`)
```env
DATABASE_URL="postgresql://user:pass@localhost:5432/pma"
JWT_SECRET="your-super-secret-key"
JWT_EXPIRES_IN="7d"
PORT=3000
RAG_API_URL="http://localhost:8000"
GOOGLE_API_KEY="your-gemini-api-key"
LOG_LEVEL="info"
```

### RAG (`RAG/.env`)
```env
CHROMA_PERSIST_DIR="./data/chroma_db"
EMBEDDING_MODEL="sentence-transformers/all-MiniLM-L6-v2"
TOP_K=5
GOOGLE_API_KEY="your-gemini-api-key"
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Python blocked on Windows | Use `py -3` instead of `python` |
| Port 5173 in use | Kill process or change Vite port |
| ChromaDB lock error | Delete `data/chroma_db/*.lock` files |
| Prisma migration fails | `npx prisma migrate reset` |
| Module not found (RAG) | `py -3 -m pip install -r requirements.txt` |
| CORS errors | Check backend CORS config matches frontend origin |

### Logs
```bash
# Backend logs (pino)
cd backend && npm run dev 2>&1 | npx pino-pretty

# RAG logs
cd RAG && py -3 main.py 2>&1 | tee rag.log
```

---

## Contributing

1. Fork repository
2. Create feature branch
3. Run tests: `npm test` (backend & frontend), `py -3 eval/run_eval.py` (RAG)
4. Type check: `npm run lint` (both)
5. Submit PR with description

---

## License
MIT License - See LICENSE file