import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * In-memory index of the verbatim text of the Consumer Protection Act, 2019.
 *
 * WHY THIS EXISTS
 * ---------------
 * The retrieval service returns *knowledge cards* — interpretive summaries derived
 * from the Act. Before this module, the answer formatter rendered a card's content
 * under a heading like "Section 2(22) of the Consumer Protection Act, 2019:", which
 * made the card's paraphrase look like the statute's own words. The model had no way
 * to tell them apart, so it quoted card fields (examples, limitations, non_examples)
 * as though they were enacted law.
 *
 * The Act's actual wording lives in the dataset's `v1-statute.jsonl` (276 nodes,
 * each carrying a SHA-256 checksum of its `official_text`) and was simply never sent
 * to the model. This module loads it so the answer path can quote real law and keep
 * it visibly separate from interpretation.
 *
 * DESIGN NOTES
 * ------------
 * - Lazy, cached, synchronous. The file is ~276 lines; loading it once at first use
 *   costs a few milliseconds and avoids any async plumbing in the formatter.
 * - Fails soft. If the dataset cannot be found the bot degrades to its previous
 *   behaviour (cards only) rather than refusing to answer. A legal-information
 *   service should not go down because a data file moved; it warns once instead.
 * - Node ids look like `CPA2019-CH1-S2-22`. The chapter segment is NOT derivable
 *   from the section number (s.87 is CH6, s.90/91 are CH7, s.96 is CH8), so any
 *   pattern matching over ids must treat the chapter as a wildcard.
 */

export interface StatuteNode {
  id: string;
  section: string;
  subsection?: string;
  text: string;
  /** e.g. "Section 2(22) of the Consumer Protection Act, 2019" */
  citation: string;
  /** Clause markers present in the text, e.g. ["i", "ii", "iii"]. */
  clauses: string[];
}

const ACT_NAME = "the Consumer Protection Act, 2019";
const DATASET_RELATIVE = join(
  "legal-dataset",
  "acts",
  "consumer-protection-act-2019",
  "final",
  "v1-statute.jsonl",
);

let cache: Map<string, StatuteNode> | null = null;
let warned = false;

function locate(relative: string): string | null {
  // Walk up from this file and from the process cwd. Covers `tsx src/...` in dev
  // (__dirname = backend/src/utils) and `node dist/server.js` in production
  // (__dirname = backend/dist/utils), plus any cwd the service is started from.
  const starts = [__dirname, process.cwd()];

  for (const start of starts) {
    let current = resolve(start);

    for (let depth = 0; depth < 8; depth += 1) {
      const candidate = join(current, relative);

      if (existsSync(candidate)) {
        return candidate;
      }

      const parent = dirname(current);

      if (parent === current) {
        break;
      }

      current = parent;
    }
  }

  return null;
}

function locateDataset(): string | null {
  const override = process.env.STATUTE_DATA_PATH;

  if (override && existsSync(override)) {
    return override;
  }

  return locate(DATASET_RELATIVE);
}

export function extractClauseMarkers(text: string): string[] {
  // Clause markers as they appear in the Gazette: "(i)", "(ii)", "(a)", "(b)".
  // v1-statute.jsonl has no clause-level nodes — 2(9)(i)–(vi) all live inside the
  // single 2(9) node — so the markers must be read out of the text itself. This is
  // what lets an answer cite 2(9)(iii) without splitting the statute (splitting
  // would break the official_text checksums and dataset acceptance gate G2).
  const found: string[] = [];
  const pattern = /\(([ivxlcd]{1,5}|[a-z])\)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const marker = match[1];

    if (!found.includes(marker)) {
      found.push(marker);
    }
  }

  return found;
}

export function buildCitation(section: string, subsection?: string): string {
  const ref = subsection ? `Section ${section}(${subsection})` : `Section ${section}`;

  return `${ref} of ${ACT_NAME}`;
}

function load(): Map<string, StatuteNode> {
  if (cache) {
    return cache;
  }

  cache = new Map();

  const path = locateDataset();

  if (!path) {
    if (!warned) {
      warned = true;
      console.warn(
        `[statuteIndex] Could not locate ${DATASET_RELATIVE}. Answers will fall back ` +
          `to knowledge cards only, without verbatim statutory text. Set ` +
          `STATUTE_DATA_PATH to the file to restore full grounding.`,
      );
    }

    return cache;
  }

  try {
    const raw = readFileSync(path, "utf-8");

    for (const line of raw.split("\n")) {
      const trimmed = line.trim();

      if (!trimmed) {
        continue;
      }

      const row = JSON.parse(trimmed) as {
        id?: string;
        section_number?: string | number;
        subsection_number?: string;
        official_text?: string;
      };

      const id = row.id?.trim();
      const text = row.official_text?.trim();

      if (!id || !text) {
        continue;
      }

      const section = String(row.section_number ?? "").trim();
      const subsection = String(row.subsection_number ?? "")
        .trim()
        .replace(/^\(|\)$/g, "");

      cache.set(id, {
        id,
        section,
        subsection: subsection || undefined,
        text,
        citation: buildCitation(section, subsection || undefined),
        clauses: extractClauseMarkers(text),
      });
    }
  } catch (error) {
    if (!warned) {
      warned = true;
      console.warn(
        `[statuteIndex] Failed to read ${path}: ` +
          `${error instanceof Error ? error.message : "unknown error"}. ` +
          `Answers will fall back to knowledge cards only.`,
      );
    }
  }

  return cache;
}

/** Verbatim node for a dataset id such as `CPA2019-CH1-S2-22`, if present. */
export function getStatuteNode(id: string): StatuteNode | undefined {
  return load().get(id.trim());
}

const CLAUSE_TAIL = /^(CPA2019-CH\d+-S\d+-\d+)-.+$/;

/**
 * Resolve a `derived_from` id to a verbatim node, falling back to the parent
 * subsection when the id names a clause.
 *
 * Some ids name a clause such as `CPA2019-CH1-S2-9-3` (i.e. 2(9)(iii)), but the
 * corpus has no clause-level nodes — 2(9)(i) through (vi) all live inside the single
 * `CPA2019-CH1-S2-9` node. Returning the parent is correct rather than lossy: the
 * clause's wording is physically present in the parent's text, so the model can still
 * quote and cite the clause exactly. No card currently uses this shape, but the eval
 * gold anchors do, so keep the fallback.
 */
export function resolveStatuteNode(id: string): StatuteNode | undefined {
  const key = id.trim();
  const index = load();
  const exact = index.get(key);

  if (exact) {
    return exact;
  }

  const parent = CLAUSE_TAIL.exec(key);

  return parent ? index.get(parent[1]) : undefined;
}

/* ------------------------------------------------------------------------- *
 * Concept -> statute resolution
 *
 * A card's `derived_from` holds a MIX of two kinds of id: statute node ids
 * (`CPA2019-CH1-S2-9`) and other cards' concept ids (`definition.consumer`).
 * Measured over the 4,147-card corpus: 8,370 references, of which 4,963 are
 * statute ids and 3,407 are concept ids.
 *
 * That matters far more than it sounds. 3,063 cards reach the statute directly,
 * but 726 reach it ONLY through another card — and **all 621 `example` cards are
 * in that group**. Example cards were therefore the one card type that arrived at
 * the model with no statutory text and no citation beside it, which is precisely
 * why their illustrative wording got quoted back to users as though it were the
 * Act. Following the reference one hop fixes the worst-behaved card type.
 *
 * One hop only, deliberately: it is enough for every case in the corpus, and it
 * cannot loop or drag in loosely-related law the way a transitive walk would.
 * ------------------------------------------------------------------------- */

const CARDS_RELATIVE = join(
  "legal-dataset",
  "acts",
  "consumer-protection-act-2019",
  "final",
  "v2-knowledge-cards.jsonl",
);

let conceptCache: Map<string, string[]> | null = null;

function loadConceptRefs(): Map<string, string[]> {
  if (conceptCache) {
    return conceptCache;
  }

  conceptCache = new Map();

  const override = process.env.KNOWLEDGE_CARDS_PATH;
  const path =
    override && existsSync(override) ? override : locate(CARDS_RELATIVE);

  if (!path) {
    // Degrade to direct grounding only. Worth a warning: example cards lose their
    // statutory text when this file is missing.
    console.warn(
      `[statuteIndex] Could not locate ${CARDS_RELATIVE}. Cards that reach the ` +
        `statute only through another card (all example cards) will be shown ` +
        `without verbatim statutory text.`,
    );

    return conceptCache;
  }

  try {
    const raw = readFileSync(path, "utf-8");

    for (const line of raw.split("\n")) {
      const trimmed = line.trim();

      if (!trimmed) {
        continue;
      }

      const row = JSON.parse(trimmed) as {
        concept_id?: string;
        derived_from?: string[] | string;
      };

      const id = row.concept_id?.trim();

      if (!id) {
        continue;
      }

      const refs = Array.isArray(row.derived_from)
        ? row.derived_from
        : row.derived_from
          ? [row.derived_from]
          : [];

      conceptCache.set(
        id,
        refs.map((ref) => String(ref).trim()).filter(Boolean),
      );
    }
  } catch (error) {
    console.warn(
      `[statuteIndex] Failed to read ${path}: ` +
        `${error instanceof Error ? error.message : "unknown error"}.`,
    );
  }

  return conceptCache;
}

/**
 * Expand a card's `derived_from` list into verbatim statute nodes.
 *
 * De-duplicated, and ordered by section then subsection so the model reads the Act
 * in its natural order rather than in retrieval order.
 */
export function getStatuteNodes(refs: string[]): StatuteNode[] {
  const seen = new Set<string>();
  const nodes: StatuteNode[] = [];

  const add = (ref: string): boolean => {
    const node = resolveStatuteNode(ref);

    if (!node) {
      return false;
    }

    if (!seen.has(node.id)) {
      seen.add(node.id);
      nodes.push(node);
    }

    return true;
  };

  const indirect: string[] = [];

  for (const ref of refs) {
    if (!add(ref)) {
      indirect.push(ref.trim());
    }
  }

  if (indirect.length > 0) {
    const concepts = loadConceptRefs();

    for (const ref of indirect) {
      for (const parentRef of concepts.get(ref) ?? []) {
        add(parentRef);
      }
    }
  }

  return nodes.sort((a, b) => {
    const section = Number(a.section) - Number(b.section);

    if (section !== 0) {
      return section;
    }

    return Number(a.subsection ?? 0) - Number(b.subsection ?? 0);
  });
}

/** True when the verbatim Act text is available. Useful for health checks. */
export function statuteIndexSize(): number {
  return load().size;
}
