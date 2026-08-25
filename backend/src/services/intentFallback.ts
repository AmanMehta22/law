import { Intent, IntentResult } from "../types/intent.types";

/**
 * Deterministic, zero-network intent classifier.
 *
 * This is a DEGRADED FALLBACK, not a replacement for the model. It exists
 * because the LLM router sits in front of everything else: when every
 * provider was down, classification threw and the whole message failed
 * before retrieval or generation was ever attempted. A slightly wrong route
 * still produces a useful, cited answer; a thrown error produces nothing.
 *
 * The rules below mirror INTENT_ROUTER_PROMPT, including its most important
 * subtlety: a user describing their own situation but ASKING about status,
 * eligibility or rights is GENERAL, not CASE.
 */

/** Verbs that ask us to produce a document rather than explain one. */
const DOCUMENT_VERBS =
  /\b(draft|write|prepare|generate|create|compose|type)\b/;

const DOCUMENT_NOUNS =
  /\b(legal notice|notice|complaint|letter|application|affidavit|petition|reply|rejoinder)\b/;

/**
 * Softeners that mark an imperative request even when a question word is
 * present ("can you draft..." is a request; "how do I draft..." is a
 * procedure question).
 */
const POLITE_REQUEST =
  /\b(can you|could you|would you|please|i want|i need|i'd like|i would like|help me)\b/;

/** Interrogative openers: the user wants information. */
const QUESTION_OPENER =
  /\b(what|how|who|whom|whose|when|where|why|which|explain|define|meaning of|difference between|tell me|list)\b/;

/**
 * Status / eligibility / entitlement phrasing. Per the router prompt these
 * are GENERAL even when wrapped in a personal story.
 */
const ELIGIBILITY =
  /\b(am i|are we|can i|can we|do i|do we|does the act|is it|is there|are there|should i|may i|will i|covered under|applicable to me)\b|\b(?:qualif|eligib|entitl)\w*/;

/**
 * First-person dispute narrative: something happened to the user.
 *
 * Note the deliberate absence of a trailing `\b` on the stem group. Word
 * stems like "damag" must be allowed to run into their own suffixes -
 * `\bdamag\b` can never match "damaged", because the boundary requires a
 * non-word character right after "damag". An earlier version of this
 * pattern had that bug and silently routed "Amazon delivered a damaged
 * phone" to GENERAL.
 */
const CASE_MARKER = new RegExp(
  [
    "\\bi (?:bought|purchased|ordered|paid|booked|hired|received|got|gave|sent|filed|complained)\\b",
    "\\bthey (?:refused|denied|rejected|ignored|cancelled)\\b",
    "\\b(?:seller|shopkeeper|vendor|dealer|retailer)\\b",
    "\\b(?:not working|stopped working|broken|expired|no response|never arrived|never delivered|never received)\\b",
    "\\b(?:refus|reject|deni|defect|damag|faulty|overcharg|cheat|fraud|scam)\\w*",
  ].join("|"),
);

export interface HeuristicIntent extends IntentResult {
  /**
   * True when a rule matched outright. A low-confidence result is still
   * returned (defaulting to GENERAL) but is worth logging loudly.
   */
  confident: boolean;
}

export function classifyIntentByHeuristic(message: string): HeuristicIntent {
  const text = message.toLowerCase();

  // A question mark is its own interrogative signal. Without it, phrasings
  // that open with a verb ("Is a seller liable for a damaged product?")
  // match no opener, and their dispute nouns drag them into CASE.
  const asksQuestion =
    QUESTION_OPENER.test(text) || ELIGIBILITY.test(text) || text.includes("?");

  // Checked first, but only when the phrasing is a request rather than a
  // question about procedure.
  const wantsDocument =
    DOCUMENT_VERBS.test(text) &&
    DOCUMENT_NOUNS.test(text) &&
    (!QUESTION_OPENER.test(text) || POLITE_REQUEST.test(text));

  if (wantsDocument) {
    return { intent: Intent.DOCUMENT, confident: true };
  }

  // Information questions win over dispute narrative: "my phone is defective,
  // am I a consumer?" is a legal question, not a case intake.
  if (asksQuestion) {
    return { intent: Intent.GENERAL, confident: true };
  }

  if (CASE_MARKER.test(text)) {
    return { intent: Intent.CASE, confident: true };
  }

  // Default to GENERAL rather than CASE. A wrong GENERAL answers the user
  // immediately from the Act; a wrong CASE starts an intake interview and
  // asks for details they may not owe us.
  return { intent: Intent.GENERAL, confident: false };
}
