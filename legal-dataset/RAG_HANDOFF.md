# RAG_HANDOFF.md
## LegalBot — Consumer Protection Act, 2019 → Embedding & Retrieval Handoff

This document is for whoever builds the RAG pipeline (embedding, vector DB,
retrieval, generation). It assumes zero prior context on this repo. Nothing
here requires reading `PROJECT_README.md` first, though it's good background.

---

## 1. Repository Overview

```
PMa/
├── docs/
│   └── LegalBot_Project_Document_v2.docx   ← full 10-domain project scope
│                                              (this dataset = domain 1 of 10)
└── legal-dataset/
    ├── README.md, PROJECT_README.md, LICENSE
    ├── schema/
    │   ├── v1.schema.json                  ← canonical schema, verbatim law
    │   └── v2.schema.json                  ← canonical schema, derived cards
    ├── docs/
    │   ├── naming-convention.md
    │   ├── json-rules.md
    │   ├── dataset-guidelines.md
    │   └── v2-prompt.txt                   ← how V2 cards were generated
    └── acts/
        └── consumer-protection-act-2019/
            ├── source/consumer-protection-act-2019.pdf   (raw source, not for embedding)
            ├── v1-statute/sections/        ← 276 files, verbatim law nodes
            ├── v2-knowledge-cards/         ← 4,147 files, derived cards, 3 tiers
            ├── review/                     ← audit trail, review-state.json
            └── final/                      ← MERGED outputs — start here
```

This repo contains **data only**. No embedding code, no vector DB, no
retrieval logic exists yet — that's what you're building. Everything below
tells you which files to consume and how.

**Two-layer model, this matters for retrieval design:**
- **V1** = the actual law, verbatim, immutable, ground truth.
- **V2** = AI-generated knowledge cards *derived from* V1 (definitions,
  procedures, penalties, etc.), each carrying a `derived_from` pointer back
  to the exact V1 node(s) it came from.

This is why the recommended retrieval pattern later in this doc is
**"retrieve V2 for the answer, resolve V2 to V1 for the citation"** — never
answer from V1 directly (too granular, too legalistic for a chat answer),
and never cite V2 as if it were the law (it's a derived summary, not the
statute).

---

## 2. Which Folders to Embed

**Embed these:**

| Folder | Files | Embed? |
|---|---:|---|
| `final/v1-statute.jsonl` | 276 | ✅ Yes — one embedding index, or one field-weighted section of a combined index |
| `final/v2-knowledge-cards.jsonl` | 4,147 | ✅ Yes — this is the primary retrieval target |

**Use for retrieval augmentation, not primary embedding:**

| Folder | Files | Role |
|---|---:|---|
| `final/search-augmentation.json` | 533 concept entries | Query-expansion / BM25 boosting — see §7 |

**Do NOT embed:**

| Folder | Why not |
|---|---|
| `source/*.pdf` | Raw source, superseded by the structured V1 nodes — embedding the PDF too would duplicate content and add OCR noise |
| `v1-statute/sections/*.json` (individual files) | Already merged into `final/v1-statute.jsonl` — embed the merge, not the loose files, to avoid drift between two copies |
| `v2-knowledge-cards/**/*.json` (individual files) | Same reason — `final/v2-knowledge-cards.jsonl` is the single source of truth merge |
| `review/*.json`, `review/*.md` | Internal QA artifacts (audit logs, progress tracker) — never user-facing content |
| `schema/*.json`, `docs/*.md`, `docs/v2-prompt.txt` | Documentation about the data, not data itself |

**On Tier C (aliases, examples, intents, relationships — 3,526 of the 4,147
V2 cards):** embed them, but **never let them be the sole source of an
answer.** They're `review_status: draft`, unreviewed, and two subtypes
(`alias`, `intent`) don't even contain answerable content — they contain
search-matching text. See §4 for exactly how to treat each concept_type.

---

## 3. Which JSON Fields Become Embedding Text

### V1 statute nodes — embed this field only:

| Field | Embed as text? |
|---|---|
| `official_text` | ✅ **Yes — this is the entire embedding text for a V1 node.** |
| everything else (`id`, `path`, `citations`, `metadata`, etc.) | ❌ Metadata only (§5) |

Do not prepend/append other fields into the embedded string for V1 — the
statute text should be embedded exactly as-is so similarity search reflects
the actual legal language, not a mix of legal language and structural
labels.

### V2 knowledge cards — embed a composed string, built per `concept_type`
because `content` shape varies. Recommended composition (concatenate with a
single newline, no extra formatting/markup):

| concept_type | Fields to concatenate into embedding text |
|---|---|
| `definition` | `title` + `content.legal_definition` + `content.plain_language` |
| `right` | `title` + `content.description` |
| `obligation` | `title` + `content.description` (or equivalent narrative field) |
| `procedure` | `title` + each `content.steps[].step` joined by ". " |
| `penalty` | `title` + `content.offence` + `content.punishment` |
| `offence` | `title` + `content.offence` |
| `timeline` | `title` + `content.duration` + `content.trigger`/`content.exceptions` if present |
| `authority` | `title` + `content.powers` (or description) |
| `jurisdiction` | `title` + description of scope/threshold |
| `remedy` | `title` + `content.description` |
| `exception` | `title` + `content.description`/`content.general_rule` |
| `evidence` | `title` + `content.required_documents` joined |
| `example` | `content.scenario` + `content.outcome` |
| `relationship` | `description` only (already a readable sentence, e.g. "Consumer Rights --defines--> Right to be Heard") |
| `alias` | `content.aliases[]` joined — this card has no narrative content, only synonym strings |
| `intent` | `content.queries[]` joined — same, no narrative content, sample questions only |

`description` is always a short one-line summary and is safe to include as
a prefix (`"{title}. {description}. {content...}"`) for every concept_type
if you want one uniform embedding-text builder rather than 16 branches —
either approach works; the per-type table above is for maximum retrieval
quality, the uniform version is for implementation speed. Pick one and be
consistent.

---

## 4. Which Fields Are Metadata Only (never embedded, always retrieved alongside the match)

Store these as structured metadata on every vector, not as embedding text:

**From V1 nodes:**
```
id, parent_id, path, order, node_type, content_type, term,
act_id, chapter_number, section_number, subsection_number,
citations[], relationships[], document{page, paragraph},
metadata.{jurisdiction, language, status, effective_from, effective_to,
          checksum, token_count}
```

**From V2 cards:**
```
concept_id, concept_type, derived_from[], related_concepts[],
search.{keywords[], aliases[], user_queries[]},
metadata.{jurisdiction, act, language, review_status, confidence,
          created_by, reviewed_by, version}
```

**Critically important metadata fields for retrieval logic — flag these as
first-class filterable fields, not buried JSON:**

| Field | Why it matters at retrieval time |
|---|---|
| `metadata.review_status` | `draft` vs `reviewed` — **this must gate what the LLM is allowed to state as fact.** See §9. |
| `metadata.confidence` | Use to rank/deprioritize low-confidence matches, and to set the UI's "Verified"/"Under review" badge (already speced on the frontend side) |
| `concept_type` | Lets you filter retrieval by intent — e.g. a "what's the penalty" query should weight `penalty`/`offence` types higher |
| `derived_from` | The mechanism for resolving a V2 match back to its V1 citation — **required for every answer**, not optional |
| `act_id` / `metadata.act` | Currently always `CPA2019` / `"Consumer Protection Act, 2019"` — becomes essential once more Acts are added (§10) |

---

## 5. Recommended Chunking Strategy

**1 JSON object = 1 chunk. No further splitting.**

Rationale:
- V1 nodes are already split at the subsection level (276 nodes for one
  Act) — that's the correct legal citation granularity. Splitting further
  (e.g. by sentence) would produce chunks too small to cite meaningfully
  and would break the checksum/provenance guarantee the dataset already
  provides.
- V2 cards are already atomic, single-concept units by design (one
  definition, one procedure, one penalty per file). They were built this
  way specifically to be retrieval units — don't re-chunk them.
- The longest V1 nodes (whole-section entries with no subsections, e.g.
  `CPA2019-CH4-S38` with 12 subsections merged... actually check: most
  granular nodes are already subsection-level, so token counts stay
  reasonable — see `metadata.token_count` on each node to confirm before
  assuming any node needs splitting. If a small number of outlier nodes
  exceed your embedding model's practical context (unlikely, but check),
  split only those specific nodes at a natural paragraph boundary and
  preserve the original `id` as a parent reference — do not silently
  re-chunk the whole corpus.

**No overlap/sliding-window chunking needed** — that technique compensates
for arbitrary chunk boundaries in unstructured text; this corpus already
has legally meaningful boundaries (a subsection, a defined concept), so
overlap would only introduce redundant near-duplicate vectors.

---

## 6. Suggested Vector Database Schema

Two collections/indexes, not one merged index — V1 and V2 serve different
retrieval purposes (see §1) and benefit from independent tuning.

### Collection: `statute_nodes` (from `v1-statute.jsonl`, 276 vectors)
```
{
  "id": "CPA2019-CH1-S2-7",              // primary key, matches source id
  "vector": [...],                        // embedding of official_text
  "text": "official_text (verbatim)",     // stored for citation display
  "metadata": {
    "act_id": "CPA2019",
    "chapter_number": 1,
    "section_number": "2",
    "subsection_number": "(7)",
    "content_type": "definition",
    "term": "consumer",                   // null if not a definition node
    "path": ["CPA2019","CH1","S2","(7)"],
    "jurisdiction": "India",
    "status": "active",
    "checksum": "70d061e...",
    "token_count": 253
  }
}
```

### Collection: `knowledge_cards` (from `v2-knowledge-cards.jsonl`, 4,147 vectors)
```
{
  "id": "definition.consumer",            // = concept_id
  "vector": [...],                        // embedding per §3 composition rules
  "text": "composed embedding text (for debugging/inspection)",
  "content": { ... },                     // full original content{} object, stored not embedded
  "metadata": {
    "concept_type": "definition",
    "derived_from": ["CPA2019-CH1-S2-7"],
    "related_concepts": ["exception.does_not_include..."],
    "review_status": "reviewed",
    "confidence": 1.0,
    "act": "Consumer Protection Act, 2019",
    "jurisdiction": "India",
    "keywords": ["consumer","goods","services"],
    "user_queries": ["What is a consumer?"]
  }
}
```

**Index choice:** any vector DB with metadata filtering support works
(Qdrant, Weaviate, pgvector, Pinecone) — the requirement isn't a specific
engine, it's that **metadata filtering must be a pre-filter on the ANN
search, not a post-filter on results**, since `review_status` and
`concept_type` filters (§9) need to actually reduce the candidate set, not
just annotate it after the fact.

---

## 7. Hybrid Retrieval Recommendation (Vector + BM25)

**Use hybrid retrieval, not vector-only.** Legal queries frequently include
exact terms that matter more than semantic similarity — section numbers,
defined terms, statutory phrases ("two years," "District Commission").
Pure vector search can miss an exact-term match if the surrounding
phrasing differs; BM25 catches it, vector search catches paraphrased/
natural-language queries BM25 would miss.

**Recommended split:**
- **Vector search** over `knowledge_cards.text` (the composed embedding
  text from §3) — handles natural language, paraphrase, "what happens if
  my order never arrives" style queries.
- **BM25/keyword search** over `search.keywords[]` + `search.aliases[]` +
  `search.user_queries[]` on each V2 card, **plus the entirety of
  `final/search-augmentation.json`** (533 concept entries of intents +
  aliases, keyed by `concept_id`) — this file exists specifically to feed
  keyword/BM25 boosting, use it exactly for that rather than embedding it.
- **Fusion:** reciprocal rank fusion (RRF) or a weighted score combination
  (e.g. 0.6 vector + 0.4 BM25 as a starting point, tune empirically) rather
  than picking one method's top-k and discarding the other.
- **Exact-match short-circuit:** if a query contains a recognizable section
  reference (regex for patterns like "Section 2(7)", "S.69", "sec 34") or
  an exact `concept_id`, retrieve that node/card directly rather than
  running it through the fusion ranker — it's a certain match, don't let
  semantic search second-guess it.

---

## 8. Citation Format

Every answer must resolve to a citation the user can verify. The chain is
always: **V2 card retrieved → `derived_from` → V1 node(s) → citation.**

**Canonical citation string, built from a V1 node's own fields:**
```
{metadata.act || act_id spelled out} — Chapter {chapter_number} ({as roman
numeral if matching source convention}), Section {section_number}
{subsection_number if present}
```
Example: `Consumer Protection Act, 2019 — Chapter I, Section 2(7)`

**Machine-readable citation object (for the frontend, matches the API
contract already speced for the chat UI):**
```json
{
  "act": "Consumer Protection Act, 2019",
  "chapter": "I",
  "section": "2",
  "subsection": "(7)",
  "node_id": "CPA2019-CH1-S2-7",
  "official_text": "...verbatim text, for the citation drawer..."
}
```
This maps directly to a V1 node's `citations[]` array — do not construct
citation strings by hand from V2 card titles, always resolve through
`derived_from` back to the real V1 `citations[]` field, since that's the
one guaranteed-accurate source (V1 is checksum-verified, V2 titles are not).

**Multi-source citations:** a V2 card can have multiple entries in
`derived_from` (e.g. a procedure card built from several statute
subsections) — render all of them as separate citation chips, don't
collapse to just the first one.

---

## 9. Metadata Filters (required at query time)

These aren't optional nice-to-haves — they're the mechanism that keeps
unreviewed content from being presented as fact.

| Filter | Values | When to apply |
|---|---|---|
| `review_status` | `draft`, `reviewed`, `approved` | **Always exclude `draft` V2 cards from being the primary answer source.** Draft cards (all of `aliases`, `intents`, and any flagged card) may inform retrieval matching but must never be the sole basis of a stated answer — if the top result is `draft`, either fall back to a `reviewed` card or explicitly surface lower confidence to the user (matches the frontend's amber "Under review" badge design). |
| `concept_type` | 16 values (§4) | Route by query intent — e.g. classify "what's the penalty for X" toward `concept_type: penalty` / `offence`; "how do I file" toward `procedure`; "am I still in time" toward `timeline`. Improves precision over unfiltered top-k. |
| `confidence` | 0.0–1.0 | Soft-rank rather than hard filter — deprioritize sub-0.8 matches rather than excluding them outright, unless combined with `draft` status above |
| `act_id` / `act` | currently only `CPA2019` | Will become a hard filter once more Acts are loaded (§10) — build this filter now even though it's a no-op today, so it's not a retrofit later |
| `jurisdiction` | currently only `India` | Same as above — build now, no-op today |
| `derived_from` (as a lookup, not a filter) | V1 node id(s) | Used to resolve citations (§8), not to filter search results |

**Concrete rule to hard-code in the retrieval layer:** if the highest-scoring
result for a user query is a `concept_type` of `alias`, `intent`, or
`relationship`, **do not answer from it directly** — use it only to
re-route the search (e.g. an `alias` match tells you which `definition`/
`procedure` card to actually retrieve next). Only `definition`, `right`,
`obligation`, `procedure`, `authority`, `jurisdiction`, `remedy`, `penalty`,
`timeline`, `evidence`, `offence`, `exception` should ever be the card an
answer is generated from.

---

## 10. Future Extensibility (additional Acts / domains)

This dataset is domain 1 of the 10 planned in the wider LegalBot project
(`docs/LegalBot_Project_Document_v2.docx`). The pipeline should be built
assuming more Acts arrive, not as a single-Act special case:

- **Namespace everything by `act_id` from day one**, even though today
  there's only `CPA2019` — vector DB collections should be a single
  `statute_nodes` / `knowledge_cards` index with `act_id` as a filterable
  field, **not** a new collection per Act. A new Act should mean "more
  rows," not "a new index the retrieval layer has to know about."
- **`id`/`concept_id` prefixing already supports this** — `CPA2019-CH1-S2-7`
  and `definition.consumer` are both scoped by convention
  (`naming-convention.md`); a second Act will use its own prefix
  (e.g. `MVA1988-...` for the Motor Vehicles Act), so no ID collisions are
  expected, but **do add a uniqueness check across Acts at ingest time**
  rather than assuming it.
- **Cross-Act relationships will eventually exist** (e.g. a consumer
  e-commerce dispute might touch both CPA 2019 and IT Rules) — the
  `relationship` concept_type and `related_concepts[]` field already
  support cross-referencing by `concept_id`, so no schema change is needed,
  but retrieval logic should not assume all results share one `act_id`.
- **Review status tracking scales as-is** — `review_status`/`confidence`
  are per-card, so a newly ingested Act simply starts all its cards at
  `draft` and follows the same Tier A/B/C review process already proven
  here; no new schema needed, same pipeline (`docs/v2-prompt.txt` +
  the Tier review prompts already built for this Act) is reusable
  per-Act, only the source PDF changes.
- **Schema stability:** `schema/v1.schema.json` and `schema/v2.schema.json`
  are already written to be Act-agnostic (no CPA2019-specific fields) —
  confirm this holds before ingesting a second Act rather than assuming it.

---

## Quick-reference: what to embed, in one table

| Source | Embed? | Index | Notes |
|---|---|---|---|
| `final/v1-statute.jsonl` | ✅ | `statute_nodes` | `official_text` only |
| `final/v2-knowledge-cards.jsonl` | ✅ | `knowledge_cards` | composed text per §3, all concept_types included but gated by `review_status` at query time (§9) |
| `final/search-augmentation.json` | ❌ (BM25 index instead) | keyword index | not a vector embedding target |
| `source/*.pdf` | ❌ | — | superseded by V1 |
| `review/*` | ❌ | — | internal QA only |
| `schema/*`, `docs/*` | ❌ | — | documentation, not content |