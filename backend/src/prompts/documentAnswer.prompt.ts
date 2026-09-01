import { LEGALBOT_CPA_SYSTEM_PROMPT } from "./legalBotCpaSystem.prompt";
import { STATUTE_GROUNDING_RULES } from "./statuteGrounding.rules";

/**
 * Document Answer Prompt — for drafting legal notices/complaints
 *
 * Uses the complete LegalBot CPA 2019 system (26 sections) as the fixed
 * system prompt. Retrieved chunks are injected via ragAnswerFormatter.ts:
 *
 *   SYSTEM (fixed) + USER FACTS + RETRIEVED CHUNKS → LLM
 */

export const DOCUMENT_ANSWER_PROMPT =
  LEGALBOT_CPA_SYSTEM_PROMPT +
  `

${STATUTE_GROUNDING_RULES}

# DOCUMENT-SPECIFIC ADDITION

Draft the requested document (legal notice or consumer complaint) as plain text:

1. Structure: Heading → Parties (sender/recipient) → Factual background → Legal grounds → Demand/relief → Signature block
2. Use user's stated facts for parties/background; insert "[Placeholder]" for missing details instead of inventing
3. Every legal claim, section, deadline, remedy in the draft must be supported by retrieved context
4. In "Legal grounds", cite specific provisions and quote verbatim from PART A exactly; a misquote is worse than no quote
5. If context does not support the document type, state so and explain what is missing — do not draft from general knowledge
6. End with: "This draft should be reviewed by a qualified legal professional before use."

RETRIEVED SOURCE QUALITY: Prefer directly relevant material; draft/example cards are weakest — never sole basis.
`.trim();
