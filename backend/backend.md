# 1. Project Overview

## Purpose

LegalBot is an AI-powered legal assistant backend designed for guided legal conversations. The current implementation focuses on **Indian Consumer Law**, with a modular architecture that can be extended to multiple legal domains.

---

## Tech Stack

- **Runtime:** Node.js
- **Language:** TypeScript
- **Framework:** Express.js
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Authentication:** JWT
- **Validation:** Zod
- **AI:** Google Gemini

---

## Current Status

Implemented:

- ✅ Authentication
- ✅ Conversation & Message Management
- ✅ AI Information Checker
- ✅ Workflow Engine
- ✅ Knowledge Layer
- ✅ Logging

Next:

- ⏳ Retrieval-Augmented Generation (RAG)
- ⏳ Vector Database & Embeddings
- ⏳ Legal Document Retrieval

---

## Design Principles

- Thin controllers, business logic in services.
- Repositories handle all database operations.
- AI is used for reasoning, not application logic.
- Backend controls conversation flow using the knowledge layer.
- Modular design to support future legal domains.

# 2. System Architecture

The backend follows a layered architecture where each layer has a single responsibility.

```text
Client
   │
   ▼
Routes
   │
   ▼
Controllers
   │
   ▼
Services
   │
   ├── Repositories
   │        │
   │        ▼
   │    PostgreSQL
   │
   └── LLM Service
            │
            ▼
         Gemini API
```

### Request Flow

```text
Request
   │
   ▼
Route
   │
   ▼
Controller
   │
   ▼
Workflow Service
   │
   ├── Conversation Service
   ├── Message Service
   ├── Information Checker
   ├── Knowledge Service
   └── (Future) RAG Service
   │
   ▼
Response
```

### Layer Responsibilities

- **Routes** → Define API endpoints.
- **Controllers** → Handle HTTP requests and responses.
- **Services** → Contain business logic.
- **Repositories** → Handle database operations.
- **LLM Service** → Centralized AI communication.
- **Knowledge Layer** → Defines required information and follow-up questions.

# 3. Project Structure

```text
src/
│
├── config/            # Environment & application configuration
├── controllers/       # HTTP request handlers
├── services/          # Business logic
├── repositories/      # Database access (Prisma)
├── routes/            # API routes
├── middleware/        # Express middleware
├── validators/        # Zod validation schemas
├── knowledge/         # Legal domain definitions
├── prompts/           # AI system prompts
├── logger/            # Logging utilities
├── utils/             # Shared helper functions
├── errors/            # Custom error classes
├── types/             # Shared TypeScript types
├── prisma/            # Prisma schema & migrations
└── app.ts             # Express application
```

## Folder Responsibilities

| Folder          | Purpose                                               |
| --------------- | ----------------------------------------------------- |
| `config/`       | Environment variables and application configuration.  |
| `controllers/`  | Receive requests and return responses.                |
| `services/`     | Core business logic and workflow orchestration.       |
| `repositories/` | Encapsulate all database queries.                     |
| `routes/`       | Register API endpoints.                               |
| `middleware/`   | Authentication, validation, and error handling.       |
| `validators/`   | Request validation using Zod.                         |
| `knowledge/`    | Domain-specific requirements and follow-up questions. |
| `prompts/`      | System prompts used by the LLM.                       |
| `logger/`       | Centralized logging and performance timing.           |
| `utils/`        | Reusable helper functions.                            |
| `errors/`       | Custom application errors.                            |
| `types/`        | Shared interfaces and type definitions.               |
| `prisma/`       | Database schema and migrations.                       |

# 4. Database Design

The backend uses **PostgreSQL** with **Prisma ORM**. The current schema is designed to support user authentication, conversations, and message history while remaining extensible for future RAG features.

## Current Models

### User

Stores registered user information.

- `id`
- `email`
- `password`
- `createdAt`

---

### Conversation

Represents a single legal consultation.

- `id`
- `userId`
- `createdAt`

**Relationship**

- One User → Many Conversations

---

### Message

Stores every message exchanged during a conversation.

- `id`
- `conversationId`
- `role` (USER / ASSISTANT)
- `content`
- `createdAt`

**Relationship**

- One Conversation → Many Messages

---

## Database Relationships

```text
User
 │
 └───────< Conversation
              │
              └───────< Message
```

---

## Future Enhancements

Planned additions include:

- Conversation summaries
- Vector embeddings
- Retrieved document references
- Generated legal documents

# 5. Authentication Module

The authentication module provides secure user registration and login using **JWT-based authentication**.

## Features

- User Registration
- User Login
- Password Hashing (bcrypt)
- JWT Token Generation
- Protected Routes

---

## Authentication Flow

```text
Register/Login
      │
      ▼
Validate Request
      │
      ▼
Create / Verify User
      │
      ▼
Generate JWT
      │
      ▼
Return Token
```

---

## Protected Requests

For authenticated routes:

```text
Client
   │
Authorization: Bearer <token>
   │
   ▼
Authentication Middleware
   │
   ▼
Verify JWT
   │
   ▼
Attach User to Request
   │
   ▼
Protected Controller
```

---

## Security

- Passwords are hashed before storage.
- JWT is used for stateless authentication.
- Protected endpoints require a valid access token.
- Authentication is handled through middleware.

# 6. Conversation Engine

The Conversation Engine manages the lifecycle of every legal consultation.

## Responsibilities

- Create new conversations.
- Store every user and assistant message.
- Maintain complete conversation history.
- Provide conversation context to the AI workflow.

## Flow

```text
User Message
      │
      ▼
Create Conversation (if required)
      │
      ▼
Store Message
      │
      ▼
Load Conversation History
```

Every message is persisted to ensure conversation continuity and future RAG support.

# 7. AI Workflow

The AI workflow follows a guided information collection process before invoking RAG.

## Workflow

```text
User Message
      │
      ▼
Save Message
      │
      ▼
Load Conversation
      │
      ▼
Information Checker
      │
      ▼
Enough Information?
      │
 ┌────┴────┐
 │         │
 ▼         ▼
No        Yes
 │         │
 ▼         ▼
Ask Next   (Future) RAG
Question
```

## Services

- **Workflow Service** – Orchestrates the complete flow.
- **Information Checker** – Determines if enough information has been collected.
- **Knowledge Service** – Selects the next follow-up question.
- **LLM Service** – Handles all AI interactions.

The backend controls the workflow while the LLM is only used for reasoning.

# 8. Prompt Engineering

Prompts are separated from business logic and stored independently.

## Current Prompt

- Information Checker

## Responsibilities

- Determine whether sufficient information is available.
- Identify missing information.
- Return structured JSON.
- Never provide legal advice or generate answers.

All prompts are version-controlled and designed to produce deterministic outputs.

# 9. LLM Integration

The backend communicates with AI through a centralized `LLMService`.

## Responsibilities

- Send prompts to the AI provider.
- Handle response parsing.
- Support structured JSON responses.
- Abstract the underlying AI provider.

## Current Provider

- Google Gemini

The abstraction allows future migration to OpenAI or other providers without affecting business logic.

# 10. Logging

A centralized logger is used throughout the backend for debugging and performance monitoring.

## Features

- Configurable log levels
- Execution time tracking
- Structured logging
- Debug and error logging

## Log Levels

- `debug`
- `info`
- `warn`
- `error`
- `silent`

Logging can be configured through environment variables without modifying the codebase.

# 11. Error Handling

The backend uses centralized error handling to provide consistent API responses.

## Components

- Custom Error Classes
- Global Error Middleware
- Async Handler

All unexpected errors are handled in one place, preventing unhandled promise rejections and keeping controllers clean.

# 12. Validation

Request validation is performed using **Zod** before business logic is executed.

## Responsibilities

- Validate request bodies.
- Validate route parameters.
- Prevent invalid data from reaching the service layer.

Validation middleware ensures consistent request handling and returns descriptive errors for invalid input.

# 13. API Reference

## Base URL

```
http://localhost:3000
```

---

# Authentication

## Register

**POST** `/auth/register`

Creates a new user account.

### Request

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

### Response

```json
{
  "success": true,
  "data": {
    "id": "user_id",
    "email": "user@example.com",
    "createdAt": "2026-08-04T12:00:00Z"
  }
}
```

---

## Login

**POST** `/auth/login`

Authenticates a user and returns a JWT.

### Request

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

### Response

```json
{
  "success": true,
  "data": {
    "token": "<JWT_TOKEN>"
  }
}
```

---

# Health

## Health Check

**GET** `/health`

Returns the server status.

### Response

```json
{
  "success": true,
  "message": "Server is running."
}
```

---

# Messages

## Send Message

**POST** `/messages`

Main endpoint for interacting with LegalBot.

This endpoint automatically:

- Creates a conversation (if required).
- Stores the user message.
- Runs the Information Checker.
- Asks follow-up questions until sufficient information is collected.
- (Future) Calls the RAG pipeline.

### Headers

```
Authorization: Bearer <JWT_TOKEN>
```

---

### New Conversation

#### Request

```json
{
  "message": "I bought a laptop."
}
```

---

### Existing Conversation

#### Request

```json
{
  "conversationId": "conversation_id",
  "message": "Flipkart"
}
```

---

### Response (Information Required)

```json
{
  "success": true,
  "data": {
    "conversationId": "conversation_id",
    "readyForRag": false,
    "reply": "Who sold the product or provided the service?"
  }
}
```

---

### Response (Ready For RAG)

```json
{
  "success": true,
  "data": {
    "conversationId": "conversation_id",
    "readyForRag": true,
    "reply": "✅ Enough information has been collected. RAG will be called next."
  }
}
```

---

# Authentication Header

All protected endpoints require:

```
Authorization: Bearer <JWT_TOKEN>
```

---

# Standard Response Format

## Success

```json
{
  "success": true,
  "data": {}
}
```

---

## Error

```json
{
  "success": false,
  "message": "Error message"
}
```

# Request Lifecycle

POST /messages

↓

Authentication Middleware

↓

Validation Middleware

↓

Controller

↓

Workflow Service

↓

Information Checker

↓

Knowledge Service

↓

Response
