# 1. Overview

## Purpose

This document explains how the frontend integrates with the LegalBot backend. It serves as a reference for implementing authentication, chat functionality, API communication, and conversation management.

---

## Frontend Responsibilities

The frontend is responsible for:

- User authentication (Register/Login)
- Managing the chat interface
- Sending user messages to the backend
- Displaying assistant responses
- Managing conversation state
- Handling loading and error states
- Persisting authentication tokens

---

## Backend Responsibilities

The backend is responsible for:

- User authentication and authorization
- Conversation and message management
- AI workflow orchestration
- Determining follow-up questions
- Calling the AI models
- (Future) Retrieval-Augmented Generation (RAG)
- Returning responses in a consistent format

---

## Communication Flow

```text
Frontend
    │
    ▼
REST API
    │
    ▼
Backend
    │
    ▼
Database
    │
    ▼
Gemini AI
```

The frontend communicates **only** with the backend. It never interacts directly with the database or AI provider.

---

## Integration Principle

The frontend should be treated as a presentation layer.

- The frontend **renders** data.
- The backend **makes decisions**.
- The frontend should never generate assistant messages or implement business logic.

All conversation flow and AI interactions are controlled by the backend.

# 2. Authentication

The backend uses **JWT (JSON Web Token)** for authentication. Every protected request must include a valid JWT in the `Authorization` header.

---

## Authentication Flow

```text
User
   │
   ▼
Register / Login
   │
   ▼
Backend
   │
   ▼
JWT Token
   │
   ▼
Frontend stores token
   │
   ▼
Authenticated Requests
```

---

## Register

### Endpoint

```http
POST /auth/register
```

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

### Endpoint

```http
POST /auth/login
```

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

## Token Storage

After a successful login:

- Store the JWT securely.
- Include it in every protected request.
- Clear it on logout.

---

## Authorization Header

All protected endpoints require:

```http
Authorization: Bearer <JWT_TOKEN>
```

Example:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Logout

The backend is stateless and does not provide a logout endpoint.

Logout is handled entirely on the frontend by:

1. Removing the stored JWT.
2. Clearing user-related state.
3. Redirecting the user to the login page.

---

## Authentication Errors

| Status | Meaning                             | Frontend Action            |
| ------ | ----------------------------------- | -------------------------- |
| 400    | Invalid request                     | Display validation error   |
| 401    | Invalid credentials / Expired token | Redirect to Login          |
| 500    | Server error                        | Show generic error message |

# 3. Conversation Lifecycle

Every chat with LegalBot belongs to a **Conversation**. The frontend is responsible for maintaining the `conversationId` returned by the backend.

---

## Starting a New Conversation

When the user sends the first message, **do not send a `conversationId`**.

### Request

```json
{
  "message": "I bought a laptop."
}
```

The backend will:

- Create a new conversation.
- Store the user's message.
- Process the AI workflow.
- Return a `conversationId`.

### Response

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

The frontend **must store the returned `conversationId`**.

---

## Continuing a Conversation

For every subsequent message, include the previously received `conversationId`.

### Request

```json
{
  "conversationId": "cmsesinwl00016br4qj0igq06",
  "message": "Flipkart"
}
```

The backend loads the existing conversation and continues the workflow.

---

## Conversation Flow

```text
User opens chat
        │
        ▼
No conversation exists
        │
        ▼
Send first message
        │
        ▼
Backend creates conversation
        │
        ▼
Receive conversationId
        │
        ▼
Frontend stores conversationId
        │
        ▼
All future messages use the same conversationId
```

---

## Conversation Persistence

The frontend should maintain:

- Current `conversationId`
- Complete message list
- Authentication token

If the page is refreshed, the frontend should restore the active conversation if supported by the application.

---

## Important Notes

- A conversation is created **only once**.
- Never generate a new `conversationId` on the frontend.
- Always send the latest `conversationId` received from the backend.
- All messages belonging to the same consultation must use the same `conversationId`.

# 4. Chat Workflow

The frontend communicates with the chatbot through a single endpoint:

```http
POST /messages
```

The backend manages the entire conversation workflow.

---

## Message Flow

```text
User sends a message
        │
        ▼
POST /messages
        │
        ▼
Backend stores the message
        │
        ▼
AI checks if enough information is available
        │
        ▼
┌─────────────────────────────┐
│ Information Complete?       │
└──────────────┬──────────────┘
               │
       No      │      Yes
               │
               ▼
      Ask Next Question
               │
               ▼
      Return Response
```

---

## Information Collection Phase

If additional information is required, the backend automatically returns the next follow-up question.

Example:

```text
User:
I bought a laptop.

↓

Assistant:
Who sold the product or provided the service?

↓

User:
Flipkart

↓

Assistant:
When did you purchase the product?

↓

User:
Three months ago

↓

...
```

The frontend simply displays the assistant's reply and waits for the next user message.

---

## RAG Phase

Once all required information has been collected:

```text
User sends final required information
        │
        ▼
Backend determines information is complete
        │
        ▼
(Future) RAG Pipeline
        │
        ▼
Legal Response
        │
        ▼
Frontend displays the response
```

The frontend does not need to know whether the backend asked a follow-up question or generated a legal answer. Both are handled identically.

---

## Frontend Responsibilities

For every user message:

1. Append the user's message to the chat.
2. Send the request to `POST /messages`.
3. Wait for the backend response.
4. Append the assistant's reply.
5. Update the stored `conversationId` if returned.

---

## Backend Responsibilities

The backend automatically:

- Stores every message.
- Maintains conversation history.
- Determines if more information is required.
- Selects the next follow-up question.
- Calls the AI models.
- (Future) Executes the RAG pipeline.

---

## Key Principle

The frontend is **not responsible** for deciding:

- What question to ask next.
- Whether enough information has been collected.
- When to call RAG.

These decisions are handled entirely by the backend.

# 5. API Reference

## Base URL

```text
http://localhost:3000
```

All responses follow a standard format:

### Success Response

```json
{
  "success": true,
  "data": {}
}
```

### Error Response

```json
{
  "success": false,
  "message": "Error message"
}
```

---

# Authentication APIs

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

Authenticates the user and returns a JWT.

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

# Chat API

## Send Message

**POST** `/messages`

Primary endpoint used by the chatbot.

### Headers

```http
Authorization: Bearer <JWT_TOKEN>
```

---

### Start a New Conversation

```json
{
  "message": "I bought a laptop."
}
```

---

### Continue an Existing Conversation

```json
{
  "conversationId": "cmsesinwl00016br4qj0igq06",
  "message": "Flipkart"
}
```

---

### Response

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

When all required information has been collected:

```json
{
  "success": true,
  "data": {
    "conversationId": "cmsesinwl00016br4qj0igq06",
    "readyForRag": true,
    "reply": "Legal response (Future RAG Response)"
  }
}
```

---

# Health Check

## Server Status

**GET** `/health`

Used to verify that the backend is running.

### Response

```json
{
  "success": true,
  "message": "Server is running."
}
```

---

# HTTP Status Codes

| Status | Meaning                              |
| ------ | ------------------------------------ |
| 200    | Request successful                   |
| 201    | Resource created successfully        |
| 400    | Invalid request or validation failed |
| 401    | Unauthorized / Invalid JWT           |
| 404    | Resource not found                   |
| 500    | Internal server error                |

---

# Authentication

All protected endpoints require the following header:

```http
Authorization: Bearer <JWT_TOKEN>
```

The frontend should automatically attach this header to every authenticated request.

# 6. Frontend State Management

The frontend should maintain a minimal and predictable application state throughout the chat session.

---

## Authentication State

Store:

- JWT Token
- User information (optional)
- Authentication status

Example:

```ts
isAuthenticated: boolean;
token: string | null;
```

---

## Conversation State

Store:

- Current `conversationId`
- Chat messages
- Current conversation status

Example:

```ts
conversationId: string | null;
messages: ChatMessage[];
```

---

## Loading State

Track API requests to provide a better user experience.

Example:

```ts
isSending: boolean;
isTyping: boolean;
```

Use these states to:

- Disable the send button.
- Show a typing indicator.
- Prevent duplicate requests.

---

## Error State

Capture API and network errors.

Example:

```ts
error: string | null;
```

Errors should be displayed to the user without breaking the chat experience.

---

## Suggested State Structure

```ts
{
  (token,
    isAuthenticated,
    conversationId,
    messages,
    isSending,
    isTyping,
    error);
}
```

---

## State Updates

### On Login

- Store JWT.
- Set authentication state.

---

### On First Message

- Store returned `conversationId`.
- Append user message.
- Append assistant reply.

---

### On Every Message

- Append user message.
- Send API request.
- Append backend reply.
- Update loading state.

---

## Best Practices

- Maintain a single active conversation.
- Keep messages ordered chronologically.
- Never manually modify assistant messages.
- Always use the backend response as the source of truth.

# 7. UI Behaviour & Response Handling

## Sending a Message

When the user sends a message:

1. Append the user's message to the chat.
2. Disable the send button.
3. Display a typing/loading indicator.
4. Send `POST /messages`.
5. Wait for the backend response.
6. Append the assistant's reply.
7. Enable the send button.

---

## Backend Responses

### Information Collection

```json
{
  "conversationId": "...",
  "readyForRag": false,
  "reply": "Who sold the product or provided the service?"
}
```

Frontend Action:

- Append the assistant message.
- Wait for the next user message.

---

### Legal Response (Future RAG)

```json
{
  "conversationId": "...",
  "readyForRag": true,
  "reply": "Legal advice..."
}
```

Frontend Action:

- Append the assistant response.
- Continue the conversation normally.

The frontend does **not** need different rendering logic for follow-up questions and legal responses.

---

## Loading States

Handle the following UI states:

- Idle
- Sending Message
- Waiting for Backend
- Rendering Response

Disable duplicate requests while waiting for the backend.

---

## Error Handling

Recommended behaviour:

| Status        | Action                     |
| ------------- | -------------------------- |
| 400           | Show validation message    |
| 401           | Redirect to Login          |
| 500           | Show generic error message |
| Network Error | Allow retry                |

Always restore the UI to a usable state after an error.

# 8. Recommended Project Structure

```text
src/
│
├── api/           # Backend API calls
├── components/    # Reusable UI components
├── pages/         # Application pages
├── hooks/         # Custom React hooks
├── store/         # State management
├── types/         # Shared interfaces
├── utils/         # Utility functions
└── assets/        # Static assets
```

## Suggested Components

```text
Chat/
├── ChatWindow
├── ChatInput
├── MessageBubble
├── TypingIndicator
└── ChatHeader
```

Separate UI components from API logic and state management.

# 9. Type Definitions & Integration Checklist

## Suggested Types

### Chat Message

```ts
interface ChatMessage {
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt?: string;
}
```

---

### Send Message Request

```ts
interface SendMessageRequest {
  conversationId?: string;
  message: string;
}
```

---

### Send Message Response

```ts
interface SendMessageResponse {
  success: boolean;
  data: {
    conversationId: string;
    readyForRag: boolean;
    reply: string;
  };
}
```

---

## Integration Checklist

### Authentication

- [ ] Register implemented
- [ ] Login implemented
- [ ] JWT stored securely
- [ ] Authorization header added

### Chat

- [ ] Send messages using `/messages`
- [ ] Store `conversationId`
- [ ] Render assistant replies
- [ ] Handle loading state
- [ ] Handle API errors

### Best Practices

- Always use backend responses.
- Never generate assistant messages on the frontend.
- Never hardcode follow-up questions.
- Always preserve the current `conversationId`.
- Treat the backend as the source of truth for conversation flow.
