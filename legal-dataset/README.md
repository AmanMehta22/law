# Legal Dataset

A curated, verbatim legal dataset of Indian statutes, built in **two layers**:

- **V1 — legal nodes**: one JSON per statutory subsection, transcribed verbatim
  from the official Gazette/PDF. The ground truth.
- **V2 — knowledge cards**: queryable, reviewable knowledge units derived from
  V1, each tagged with concept type, source-provenance (`derived_from`) and
  review metadata.

Official source documents stay untouched as the base of truth. Everything else
is built on top of them and carries traceable provenance back to the statute.

---

## ⚠️ Data Status

| Layer | Items | Status |
|---|---|---|
| V1 nodes | 276 files | All `status = "active"`, all checksum-verified (checksum = SHA-256 of `official_text`) |
| V2 cards | 4,147 files | **621 of 4,147 reviewed** (Tier A + Tier B; 42 carry human-review advisories); tracker in `acts/consumer-protection-act-2019/review/progress.md` |

**V1 is the verified ground truth.** `official_text` is the verbatim Act.

**V2 is under content review.** As of 2026-08-02, the 621 substantive V2
cards (penalty/offence/procedure/timeline/definition and the other Tier-B
types) are `reviewed`; examples/intents/aliases/relationships remain `draft`
(search-support artifacts, not yet reviewed). A card with `confidence = 0.0`
simply means "not yet individually reviewed". Individual card status and the
42 human-review flags are tracked in
`acts/consumer-protection-act-2019/review/progress.md`. Do **not** treat any
V2 card as verified law until its status is `reviewed`/`approved`. V2
illustrations (examples) are synthetic scenarios derived from the Act — never
real case law.

---

## Layout (current, matches reality)

```
legal-dataset/
│
├── schema/                      Canonical JSON schemas (shared across all domains)
│   ├── v1.schema.json           V1 node schema
│   └── v2.schema.json           Canonical V2 schema (source of truth)
├── docs/                        Shared rules & conventions for every domain (no code)
├── acts/                        One folder per legal domain
│   └── consumer-protection-act-2019/
│       ├── source/              Original, unmodified official PDF (consumer-protection-act-2019.pdf)
│       ├── v1-statute/          V1 legal nodes (the verbatim statute)
│       │   ├── sections/        One JSON per section/subsection (276 files)
│       │   └── v1Format.json    V1 node format reference
│       ├── v2-knowledge-cards/  V2 knowledge cards (4,147 files, 16 concept types)
│       │   ├── tier-a-reviewed/  definitions/ penalties/ offences/ procedures/ timelines/
│       │   ├── tier-b-reviewed/  authorities/ jurisdiction/ rights/ obligations/ remedies/ exceptions/ evidence/
│       │   └── tier-c-support/   relationships/ examples/ intents/ aliases/
│       ├── review/              This act's review tracker, audit logs, project flow
│       │   ├── progress.md      Per-act progress tracker
│       │   ├── project-flow.md  This act's generation pipeline
│       │   ├── review-state.json
│       │   ├── llm-audit.json
│       │   └── llm-audit-adjudicated.json
│       └── final/               Merged, validated complete datasets (JSON + JSONL)
│           ├── v1-statute.json / .jsonl
│           ├── v2-knowledge-cards.json / .jsonl
│           └── search-augmentation.json
├── README.md
└── LICENSE
```

- `schema/` — the canonical schemas, shared by every act. Never modified.
- `acts/<domain>/source/` — the originals. Never modified.
- `acts/<domain>/v1-statute/` — the V1 ground-truth layer (276 nodes for the
  CPA 2019).
- `acts/<domain>/v2-knowledge-cards/` — the V2 knowledge layer. Each card has a
  unique `concept_id`, a `derived_from` list pointing to V1 `id`s, and
  `metadata` (`review_status`, `confidence`, `reviewed_by`).
- `acts/<domain>/final/` — merged, validated complete datasets for downstream
  use.
- `schema/v1.schema.json` + `schema/v2.schema.json` — canonical schemas; every
  JSON must validate against them.

---

## Workflow

```
Official PDF
    ↓
Read one section/subsection       (V1 node)
    ↓
Create one V1 JSON  →  validate against schema/v1.schema.json
    ↓
Derive V2 knowledge cards  →  validate against schema/v2.schema.json
    ↓
Optional per-node human review  (V2 review_status: draft → reviewed → approved)
    ↓
Tick off in acts/<domain>/review/progress.md
    ↓
Merge into acts/<domain>/final/
```

---

## Naming conventions

- V1: `{ACT_ID}-CH{CHAPTER}-S{SECTION}-{SUBSECTION}`, e.g. `CPA2019-CH1-S2-1`.
- V2: `{concept_type}.{slug}`, e.g. `definition.consumer`, `penalty.negligence`,
  `timeline.thirty_days`. See `docs/naming-convention.md`.

Filenames equal the node/card `id` plus `.json`.

---

## Dataset rules

1. One V1 legal subsection/definition = one JSON document.
2. Never paraphrase `official_text` — preserve it verbatim.
3. Never invent information in either layer.
4. V2 content must trace to the Act via `derived_from`; unverifiable claims
   are flagged for human review, never auto-invented.
5. Follow the canonical schemas exactly (`schema/v1.schema.json`,
   `schema/v2.schema.json`); no extra or missing required fields.
6. Use UTF-8, valid JSON, 2-space indentation.
7. Keep documentation updated as the dataset grows.

## JSON rules

- Valid JSON; UTF-8; double quotes; 2-space indentation.
- V1 `official_text` is verbatim statutory text, punctuation preserved.
- V2 `content.*` hold the distilled knowledge; `metadata.review_status` is one
  of `draft | reviewed | approved`.
- See `docs/json-rules.md` for the complete, layer-specific list.

## Contribution guidelines

1. Read `docs/naming-convention.md`, `docs/dataset-guidelines.md` and
   `docs/json-rules.md` before editing.
2. Work from `acts/<domain>/source/` PDFs or the verified V1 layer — never
   memory or third-party summaries for `official_text`.
3. Validate every file against its canonical schema; document validation in
   `docs/json-rules.md` and run it before commit.
4. Update `acts/<domain>/review/progress.md` with every change.

## Future expansion

- More Acts: Indian Contract Act, 1872; RTI Act, 2005; BNS, 2023; etc.
- Multi-language entries (Hindi gazette text).
- Cross-act reference validation.
- Verified `acts/<domain>/final/` merges per Act, in JSON and JSONL (V1 and V2
  now both present).
- Resolving the 42 human-review advisories and the Tier C (draft) review.

Nothing here changes the dataset schema; consumers build around it.