import { LEGALBOT_CPA_SYSTEM_PROMPT } from "./legalBotCpaSystem.prompt";
import { STATUTE_GROUNDING_RULES } from "./statuteGrounding.rules";
import { PLAIN_LANGUAGE_RULES } from "./plainLanguage.rules";

/**
 * General Answer Prompt — for informational questions
 *
 * Uses the complete LegalBot CPA 2019 system (26 sections) as the fixed
 * system prompt. Retrieved chunks are injected via ragAnswerFormatter.ts:
 *
 *   SYSTEM (fixed) + USER QUESTION + RETRIEVED CHUNKS (official_text) → LLM
 */

export const GENERAL_ANSWER_PROMPT =
  LEGALBOT_CPA_SYSTEM_PROMPT +
  `

${STATUTE_GROUNDING_RULES}

${PLAIN_LANGUAGE_RULES}

# GENERAL-SPECIFIC ADDITION

- If the question asks what a term means, explain it first in everyday words, then if the Act's wording adds something, quote the short phrase from PART A. Do not open with the statutory definition.
- If the question can be answered yes/no and context supports it, the first word is "Yes" or "No".
`.trim();
