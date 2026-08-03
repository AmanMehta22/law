# LegalBot Backend

## Overview

The backend is the central orchestrator of LegalBot.

It is responsible for:

- Authentication
- User management
- Conversation management
- AI orchestration
- RAG integration
- Prompt generation
- Chat history
- Document generation
- API layer

The backend **does not** contain legal knowledge.

Legal knowledge is provided by the Knowledge Base (V2) and retrieved through the RAG pipeline.

---

# Architecture

```
Frontend
    │
    ▼
Express Backend
    │
    ├── Authentication
    ├── Conversation Engine
    ├── Workflow Engine
    ├── Prompt Builder
    ├── RAG Service
    ├── LLM Service
    └── Database
```

---

# Tech Stack

| Component       | Technology       |
| --------------- | ---------------- |
| Runtime         | Node.js          |
| Framework       | Express.js       |
| Language        | TypeScript       |
| ORM             | Prisma           |
| Database        | PostgreSQL       |
| Authentication  | JWT              |
| Validation      | Zod              |
| Logging         | Pino             |
| AI              | OpenAI           |
| Vector Database | ChromaDB (later) |

---

# Project Structure

```
backend/

src/

    config/

    routes/

    controllers/

    services/

    repositories/

    middleware/

    validators/

    prompts/

    types/

    utils/

prisma/

tests/
```

---

# Responsibilities

## Backend

Responsible for:

- API endpoints
- Authentication
- Conversation lifecycle
- Prompt construction
- Calling RAG
- Calling OpenAI
- Saving conversations
- Returning responses

---

## RAG Module

Responsible for:

- Embedding user query
- Retrieving relevant knowledge cards
- Returning retrieved context

The backend treats RAG as a dependency.

---

## Frontend

Responsible for:

- User Interface
- Authentication Screens
- Chat UI
- Displaying citations
- Displaying generated documents

---

# Development Phases

## Phase 1

Backend Foundation

- Express
- TypeScript
- Environment Configuration
- Logger
- Prisma
- PostgreSQL
- Folder Structure

---

## Phase 2

Authentication

- User Model
- Register
- Login
- JWT Middleware
- Protected Routes

---

## Phase 3

Conversation Engine

- Create Conversation
- Send Message
- Conversation History
- Delete Conversation

Initially responses will be mocked.

---

## Phase 4

OpenAI Integration

- OpenAI Client
- Prompt Builder
- LLM Service

---

## Phase 5

RAG Integration

Replace mocked retrieval with actual vector search.

Backend API should remain unchanged.

---

## Phase 6

Workflow Engine

Conversation State

Intent Detection

Slot Filling

Information Collection

Conditional Retrieval

---

## Phase 7

Document Generation

Generate

- Legal Notice
- Complaint Draft
- Application

---

# API Design

## Authentication

POST /auth/register

POST /auth/login

GET /auth/profile

---

## Conversations

POST /conversations

GET /conversations

GET /conversations/:id

DELETE /conversations/:id

---

## Messages

POST /conversations/:id/messages

GET /conversations/:id/messages

---

## Health

GET /health

---

# Core Services

ConversationService

Responsible for

- Conversation lifecycle
- Calling Workflow Engine
- Calling RAG
- Calling LLM

---

WorkflowService

Responsible for

- Detecting user intent
- Tracking missing information
- Determining when retrieval should happen

---

RAGService

Responsible for

- Calling Vector Repository
- Retrieving Knowledge Cards

---

PromptService

Responsible for

- Building prompts
- Formatting retrieved knowledge
- Injecting conversation context

---

LLMService

Responsible for

- Calling OpenAI
- Streaming responses
- Returning structured output

---

Repositories

Repositories communicate only with databases.

Examples

UserRepository

ConversationRepository

MessageRepository

VectorRepository

---

# Database

PostgreSQL stores

- Users
- Conversations
- Messages
- Feedback
- Audit Logs

ChromaDB stores

- Embeddings
- Knowledge Card References

---

# Guiding Principles

## Controllers

Controllers should contain no business logic.

---

## Services

Services contain business logic.

---

## Repositories

Repositories contain data access logic.

---

## Prompt Isolation

Prompts should never be hardcoded inside services.

All prompts belong inside the prompts directory.

---

## Separation of Concerns

The backend should not know how vector search works.

The backend should only know how to request retrieval.

---

# Future Features

- Streaming Responses
- Voice Support
- Admin Dashboard
- Knowledge Upload
- Human Review Workflow
- Legal Notice Generator
- Multi-Act Support
- Analytics Dashboard

---

# Definition of Done

The backend is considered complete when:

- Authentication works
- Conversations persist
- Messages persist
- OpenAI responses work
- RAG can be plugged in without changing APIs
- Frontend communicates entirely through REST APIs
- All services are independently testable
