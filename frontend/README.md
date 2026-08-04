# LegalBot CPA 2019 Assistant — API & Backend Integration Guide

LegalBot CPA 2019 is a specialized Consumer Protection Act, 2019 legal assistant built with **React**, **TypeScript**, **Vite**, **Tailwind CSS**, and **TanStack Query**.

It comes pre-configured with a resilient API client in `src/api/mockApi.ts`. When connected to an external backend server, it routes requests to your API. If your backend is offline or returning errors, it gracefully falls back to local grounded CPA 2019 legal datasets.

---

## Quick Setup: Connecting an External Backend

### 1. Configure Environment Variables

Create a `.env` or `.env.local` file in the project root:

```env
# Frontend API Base URL (optional - routes requests to external backend)
VITE_API_BASE_URL=http://localhost:3000

# Backend PostgreSQL Database Connection
DATABASE_URL="postgresql://postgres:aman@localhost:5432/legalbot"

# Backend Authentication & JWT Configuration
JWT_SECRET="yolo-chip"
JWT_EXPIRES_IN="1d"
```

*If `VITE_API_BASE_URL` is omitted or empty, the frontend makes requests relative to the current origin (e.g., `/api/v1/...`).*

---

## API Specification

All backend requests include an automatically generated session header:
`X-Session-Id: <client-uuid>`

---

### 1. Start Conversation
**`POST /api/v1/conversations`**

Creates a new legal consultation session.

#### Request Headers:
```http
Content-Type: application/json
X-Session-Id: 550e8400-e29b-41d4-a716-446655440000
```

#### Response (201 Created / 200 OK):
```json
{
  "conversation_id": "conv_8f92a10b",
  "created_at": "2026-08-04T12:00:00.000Z"
}
```

---

### 2. Send Message / Process Query
**`POST /api/v1/conversations/:id/messages`**

Submits a user complaint or query to your backend logic/LLM pipeline.

#### Request Body:
```json
{
  "message": "I bought a defective LED TV from a seller and they refused to refund or repair it.",
  "context": {
    "forum_level": "district",
    "monetary_value": 45000,
    "purchase_date": "2024-02-10"
  }
}
```

#### Response (200 OK):
```json
{
  "message_id": "msg_901234",
  "conversation_id": "conv_8f92a10b",
  "sender": "bot",
  "answer_format": "document_draft",
  "answer_text": "Under Section 2(34) and Section 84 of the Consumer Protection Act, 2019, manufacturers and sellers are liable for product defects. Here is a formal legal notice draft to serve to the seller.",
  "overall_review_status": "reviewed",
  "overall_confidence": 0.96,
  "cards_used": [
    {
      "concept_id": "cpa_product_liability",
      "title": "Product Liability (Section 84)",
      "derived_from": ["node_sec_84"],
      "content": {
        "summary": "Manufacturers and sellers are liable for harm caused by defective products.",
        "key_points": [
          "Defective product includes design or manufacturing flaws.",
          "Claimant can seek replacement, repair, or full refund plus compensation."
        ]
      },
      "metadata": {
        "review_status": "reviewed",
        "last_verified_by": "Legal Audit Panel"
      }
    }
  ],
  "document_draft": {
    "id": "draft_sec84_notice",
    "type": "notice",
    "body": "STATUTORY LEGAL NOTICE UNDER CONSUMER PROTECTION ACT, 2019\n\nTo:\n[Seller Name & Address]\n\nSUBJECT: DEMAND FOR REFUND FOR DEFECTIVE LED TV\n...",
    "is_editable": true
  },
  "quick_replies": [
    "How to serve this notice via Registered Post?",
    "What if the seller doesn't reply in 15 days?",
    "How to file on e-Daakhil portal?"
  ],
  "disclaimer": "This draft notice is generated for informational guidance under CPA 2019. Review before sending.",
  "created_at": "2026-08-04T12:00:05.000Z"
}
```

##### Supported `answer_format` Values:
- `"text"`: General legal guidance & statute explanations.
- `"checklist"`: Step-by-step procedural guides (e.g., e-Daakhil filing, District Commission procedure).
- `"document_draft"`: Ready-to-edit legal notice or petition draft.

---

### 3. Get Statutory Citation
**`GET /api/v1/citations/:v1NodeId`**

Fetches verbatim official gazette statute section text.

#### Response (200 OK):
```json
{
  "id": "node_sec_2_7",
  "title": "Section 2(7) - Definition of Consumer",
  "statute_type": "cpa_2019",
  "chapter_number": "I",
  "section_number": "2(7)",
  "official_text": "Section 2(7): 'consumer' means any person who buys any goods for a consideration which has been paid or promised or partly paid and partly promised...",
  "citations": [
    {
      "act": "The Consumer Protection Act, 2019",
      "number": "Act No. 35 of 2019"
    }
  ]
}
```

---

### 4. Search Knowledge Base
**`GET /api/v1/knowledge-cards?search=defective`**

Searches structured CPA 2019 knowledge cards.

#### Response (200 OK):
```json
{
  "items": [
    {
      "concept_id": "cpa_defective_goods",
      "title": "Defective Goods & Product Liability",
      "derived_from": ["node_sec_2_10"],
      "content": {
        "summary": "Any fault, imperfection or shortcoming in quality, quantity, potency or purity of goods."
      },
      "metadata": {
        "review_status": "reviewed"
      }
    }
  ]
}
```

---

## Example Backend Implementations

### Option A: Node.js / Express Server

```javascript
// server.js
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Start conversation
app.post('/api/v1/conversations', (req, res) => {
  res.status(201).json({
    conversation_id: `conv_${Date.now()}`,
    created_at: new Date().toISOString()
  });
});

// Process query / send message
app.post('/api/v1/conversations/:id/messages', (req, res) => {
  const { message } = req.body;
  const conversationId = req.params.id;

  // Integrate your LLM / AI pipeline here (e.g. Gemini API, LangChain, RAG)
  res.json({
    message_id: `msg_${Date.now()}`,
    conversation_id: conversationId,
    sender: 'bot',
    answer_format: 'text',
    answer_text: `Received query: "${message}". Under Section 2(7) of CPA 2019, consumers purchasing goods or services online or offline are protected against unfair trade practices.`,
    overall_review_status: 'reviewed',
    overall_confidence: 0.95,
    cards_used: [],
    quick_replies: [
      "Draft a Legal Notice",
      "Check District Forum Jurisdiction"
    ],
    disclaimer: "Legal guidance based on CPA 2019.",
    created_at: new Date().toISOString()
  });
});

app.listen(5000, () => {
  console.log('LegalBot Backend running on http://localhost:5000');
});
```

---

### Option B: Python / FastAPI Server

```python
# main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import time

app = FastAPI(title="LegalBot CPA 2019 Backend API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class MessageRequest(BaseModel):
    message: str
    context: dict = None

@app.post("/api/v1/conversations")
def start_conversation():
    return {
        "conversation_id": f"conv_{int(time.time())}",
        "created_at": "2026-08-04T12:00:00Z"
    }

@app.post("/api/v1/conversations/{conversation_id}/messages")
def send_message(conversation_id: str, payload: MessageRequest):
    return {
        "message_id": f"msg_{int(time.time())}",
        "conversation_id": conversation_id,
        "sender": "bot",
        "answer_format": "text",
        "answer_text": f"Analyzing: {payload.message}. Under CPA 2019, consumer rights are guaranteed.",
        "overall_review_status": "reviewed",
        "overall_confidence": 0.95,
        "cards_used": [],
        "quick_replies": ["Draft Legal Notice", "Filing Procedure"],
        "disclaimer": "Grounded legal information.",
        "created_at": "2026-08-04T12:00:00Z"
    }
```

Run with:
```bash
pip install fastapi uvicorn
uvicorn main:app --reload --port 5000
```

---

## Development Commands

```bash
# Install dependencies
npm install

# Start Vite frontend dev server (runs on port 3000)
npm run dev

# Check TypeScript types and lint
npm run lint

# Build production bundle
npm run build
```
