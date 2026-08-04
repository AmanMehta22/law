import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { processUserQuery, mockStatuteNodes, mockKnowledgeCards } from './src/data/index.js';

const __dirname = path.resolve();

async function startServer() {
  const app = express();
  const PORT = 5173;

  app.use(express.json());

  // Initialize Gemini if key is provided
  let ai: GoogleGenAI | null = null;
  if (process.env.GEMINI_API_KEY) {
    try {
      ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    } catch (err) {
      console.warn('Gemini client init warning:', err);
    }
  }

  // --- API ROUTES ---

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', domain: 'LegalBot Consumer Protection Act MVP' });
  });

  // Start conversation
  app.post('/api/v1/conversations', (req, res) => {
    const conversationId = 'conv_' + Math.random().toString(36).substring(2, 10);
    res.json({
      conversation_id: conversationId,
      created_at: new Date().toISOString(),
    });
  });

  // Send message
  app.post('/api/v1/conversations/:conversationId/messages', async (req, res) => {
    const { conversationId } = req.params;
    const { message, context } = req.body || {};

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'The message text field is required.',
      });
    }

    const lowerMsg = message.toLowerCase();

    // Out of scope check
    if (
      lowerMsg.includes('divorce') ||
      lowerMsg.includes('murder') ||
      lowerMsg.includes('bail') ||
      lowerMsg.includes('income tax') ||
      lowerMsg.includes('property registration')
    ) {
      return res.status(422).json({
        error: 'out_of_scope',
        message:
          'This question falls outside Consumer Protection Act coverage. LegalBot CPA specializes in consumer dispute remedies under CPA 2019.',
        suggested_domain: 'family_law',
      });
    }

    // Process using legal knowledge fixtures & rules engine
    const responseMsg = processUserQuery(conversationId, message, context);

    // Optional dynamic enhancement if Gemini is active
    if (ai && !responseMsg.is_out_of_scope && responseMsg.answer_format === 'text') {
      try {
        const geminiRes = await ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: `You are LegalBot CPA, an expert AI legal assistant for the Consumer Protection Act, 2019 (India).
User question: "${message}"
Context details: ${JSON.stringify(context || {})}

Provide a grounded, concise answer in 2-3 short paragraphs explaining the consumer's rights under CPA 2019. Keep the tone empathetic, professional, and clear for an 8th grader. State clearly that claims up to ₹50 Lakhs go to the District Commission under Section 34 and filing is done on e-Daakhil.`,
          config: {
            temperature: 0.3,
          },
        });

        if (geminiRes.text) {
          responseMsg.answer_text = geminiRes.text;
        }
      } catch (geminiErr) {
        console.warn('Gemini enhancement fallback to fixture answer:', geminiErr);
      }
    }

    res.json(responseMsg);
  });

  // Get citation node by ID
  app.get('/api/v1/citations/:v1NodeId', (req, res) => {
    const { v1NodeId } = req.params;
    const node = mockStatuteNodes.find((n) => n.id === v1NodeId);
    if (!node) {
      return res.status(404).json({
        error: 'citation_not_found',
        message: `Statute citation node ${v1NodeId} not found.`,
      });
    }
    res.json(node);
  });

  // Search knowledge cards
  app.get('/api/v1/knowledge-cards', (req, res) => {
    const search = ((req.query.search as string) || '').toLowerCase();
    const conceptType = req.query.concept_type as string;

    let items = mockKnowledgeCards;
    if (conceptType) {
      items = items.filter((c) => c.concept_type === conceptType);
    }
    if (search) {
      items = items.filter(
        (c) =>
          c.title.toLowerCase().includes(search) ||
          c.description.toLowerCase().includes(search) ||
          c.search.keywords.some((k) => k.toLowerCase().includes(search))
      );
    }

    res.json({
      items,
      pagination: {
        page: 1,
        page_size: 20,
        total_items: items.length,
        total_pages: 1,
      },
    });
  });

  // --- VITE MIDDLEWARE / STATIC SERVING ---
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LegalBot CPA Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
