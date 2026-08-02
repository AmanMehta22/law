# LegalBot Dataset — Consumer Protection Act, 2019

A verified, structured legal knowledge base built to feed a RAG-based legal
chatbot. This document is the single source of truth for what exists, what's
been verified, and what's still open — written for a teammate who has never
seen this repo before.

---

## What this is

This dataset covers **1 of 10 planned legal domains** for the broader LegalBot
project (see `LegalBot_Project_Document_v2.docx` for full scope). It turns the
**Consumer Protection Act, 2019** into two layers of structured, machine-readable
data: the verbatim law, and a derived knowledge-card layer built on top of it.

This repo contains **data only** — no embedding code, no vector database, no
RAG pipeline. That's intentionally out of scope here; this dataset is designed
to be consumed as-is by whoever builds that next.

---

## The two data layers

### Layer 1 — V1: verbatim statutory text

- **Location:** `legal-node V1/sections_v1f/`
- **Schema:** `schema/v1f.json`
- **276 files**, one per statutory subsection (e.g. `CPA2019-CH1-S2-7.json`)
- Every file carries the exact `official_text` of the Act, plus a `content_type`
  tag (one of 14: definition, penalty, procedure, offence, timeline, authority,
  jurisdiction, obligation, remedy, exception, evidence, appeal, rule_making,
  commencement, general) and a `metadata.checksum` (SHA-256 of the text itself).
- **Status: verified.** All 276 files pass schema validation, all 276 checksums
  match their text exactly, and the transcription was independently cross-checked
  against the official India Code source chapter by chapter.

### Layer 2 — V2: derived knowledge cards

- **Location:** `knowlege-card V2/` (16 subfolders by concept type)
- **Schema:** `knowlege-card V2/v2Schema.json`
- **4,147 cards**, each with a `concept_id`, `content` (shape depends on
  `concept_type`), `derived_from` (provenance back to V1), `related_concepts`,
  and `metadata` (including `review_status` and `confidence`)
- **Status: verified structurally, reviewed where it matters most.**

| Category | Files | Role | Review status |
|---|---:|---|---|
| definitions | 48 | Term + meaning | ✅ Reviewed |
| penalties | 20 | Fines/punishments | ✅ Reviewed |
| offences | 9 | What constitutes an offence | ✅ Reviewed |
| procedures | 98 | Step-by-step processes | ✅ Reviewed |
| timelines | 20 | Statutory deadlines | ✅ Reviewed |
| authorities | 38 | Bodies with legal power | ✅ Reviewed |
| jurisdiction | 18 | Which authority, where | ✅ Reviewed |
| rights | 24 | Consumer rights | ✅ Reviewed |
| obligations | 207 | Duties on parties | ✅ Reviewed |
| remedies | 13 | Available relief | ✅ Reviewed |
| exceptions | 72 | Carve-outs/exclusions | ✅ Reviewed |
| evidence | 54 | What counts as proof | ✅ Reviewed |
| relationships | 494 | Concept graph edges | Draft (by design — not answer content) |
| examples | 621 | Synthetic scenarios | Draft — **not real case law, illustrative only** |
| intents | 1,820 | Sample user questions | Draft (by design — not answer content) |
| aliases | 591 | Synonyms/alternate phrasing | Draft (by design — not answer content) |

**621 of 4,147 cards (all of Tier A + Tier B above) are fully reviewed.** The
remaining 2,526 (relationships, examples, intents, aliases) are intentionally
left as drafts — they support search and query-expansion rather than stating
facts directly, so they carry lower risk if unreviewed.

---

## ⚠️ Data status — read before using this in production

- **All 621 reviewed cards were checked by two independent LLM passes**, with
  every flagged discrepancy manually triaged against the actual V1 statutory
  text before any correction was applied. 23 field-level corrections were made
  this way, sourced only from the Act — no invented content.
- **39 cards still carry an explicit "needs human review" flag** (73 field-level
  entries — see `docs/_review_state.json` and the table in `docs/progress.md`).
  These are not hidden or silently approved; they're specific, named, and
  waiting on a qualified person, not another model pass.
- **The `examples` cards are synthetic, AI-generated hypothetical scenarios.**
  If used in a chatbot, they must be clearly labeled as illustrative — never
  presented as real case law or precedent.
- **`intents` and `aliases` contain no answers.** They're natural-language
  question variants and synonym lists meant to support keyword/BM25 search and
  query expansion — not standalone facts to embed or cite.

---

## Folder structure

```
PMa/
├── LegalBot_Project_Document_v2.docx      Full 10-domain project scope
└── legal-dataset/
    ├── README.md                          This file
    ├── LICENSE
    ├── source/
    │   └── Consumer Protection Act, 2019.pdf
    ├── legal-node V1/
    │   ├── sections_v1f/                  276 V1 files
    │   └── v1Format.json
    ├── knowlege-card V2/
    │   ├── v2Schema.json
    │   ├── v2Promt.txt
    │   └── {16 category folders}          4,147 V2 files
    ├── schema/
    │   └── v1f.json
    ├── docs/
    │   ├── dataset-guidelines.md          What belongs in V1 vs V2
    │   ├── json-rules.md                  Formatting rules, schema pointers
    │   ├── naming-convention.md           ID conventions for both layers
    │   ├── progress.md                    Full build + review tracker
    │   ├── _review_state.json             Machine-readable review detail
    │   ├── _llama_audit.json              Second-pass LLM audit output
    │   └── _llama_audit_adjudicated.json  Manual triage of that audit
    └── dataset/final/                     Merged, ready-to-load outputs
        ├── Consumer_Protection_Act_2019.json / .jsonl
        ├── knowledge_cards_v2.json / .jsonl
        └── search_augmentation.json       intents+aliases folded into their
                                            related concept, for keyword search
```

---

## Using `dataset/final/` — the actual embedding inputs

| File | Contents | Use for |
|---|---|---|
| `Consumer_Protection_Act_2019.json(l)` | 276 V1 nodes | Grounding / verbatim citation |
| `knowledge_cards_v2.json(l)` | All 4,147 V2 cards, tagged by category | Vector index — filter or weight by `metadata.review_status` before trusting |
| `search_augmentation.json` | 533 concepts' worth of keywords/aliases/sample questions | BM25/keyword search boosting, query training data — **not** vector embeddings |

**Recommended embedding split:** embed V1 + the 621 reviewed V2 cards + the 621
`examples` (clearly flagged) as your primary vector index; use
`search_augmentation.json` for hybrid keyword search instead of embedding
`intents`/`aliases` directly; treat `relationships` as graph data for reranking,
not as retrievable text.

---

## Verified integrity, at a glance

- ✅ 276/276 V1 files: schema-valid, checksum-verified
- ✅ 4,147/4,147 V2 files: schema-valid, 0 duplicate `concept_id`s, 0 broken `related_concepts` links
- ✅ 100% of V1 nodes are referenced by at least one V2 card (full provenance coverage, no orphans either direction)
- ✅ 621/621 Tier A+B cards reviewed; 39 explicitly flagged for human follow-up
- ✅ Merged `dataset/final/` outputs verified identical to their source files, JSON and JSONL in sync

---

## What's NOT done (so nobody assumes otherwise)

- The 39 flagged cards have not yet had human (non-LLM) review.
- No embedding, vector database, or retrieval pipeline exists yet — this repo
  is the data layer only.
- 9 of the 10 planned legal domains have no data yet.

---

## Questions this document should answer

**"Can I start embedding this?"** Yes for V1 and the 621 reviewed V2 cards.
Treat `examples` as flagged illustrative content. Don't embed `intents`/`aliases`
as standalone knowledge — use `search_augmentation.json` instead.

**"Is anything in here unverified?"** The 2,526 Tier C cards (relationships,
examples, intents, aliases) and the 39 explicitly flagged Tier A/B cards. Every
other card has passed schema validation, provenance checks, and a two-pass
review.

**"Where do I find X?"** See the folder structure above — every path listed
there exists exactly as written, verified against the live repo.