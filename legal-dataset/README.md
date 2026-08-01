# Legal Dataset

A curated, manually built dataset of Indian statutes in JSON format.

## Overview

This project's **only** purpose is to create and maintain a clean,
standardized, high-quality legal dataset by manually transcribing official
Acts into JSON, one statutory subsection or definition per document.

No RAG, embeddings, vector databases, APIs, machine learning, frontend or
backend code lives here. Future components will consume this dataset as-is,
without requiring any changes to its structure.

## Purpose

- Build a reliable, verbatim legal knowledge base from official sources.
- Keep original documents untouched (source of truth).
- Enforce strict, consistent JSON structure via canonical schemas.
- Document every rule so any contributor produces identical output.

## Folder explanation

```
legal-dataset/
│
├── source/               Original, unmodified official PDFs (one per Act)
├── dataset/              Every manually created JSON (primary working area)
│   ├── sections/         JSON files with node_type = "section"
│   ├── definitions/      JSON files with node_type = "definition"
│   └── final/            Merged complete datasets (final output only)
├── schema/               Canonical JSON schemas (section.json, definition.json)
├── docs/                 Project documentation (no code)
├── README.md
└── LICENSE
```

- `source/` — the originals. Never modified. One PDF per Act.
- `dataset/sections/` — one JSON per statutory subsection (e.g. `CPA2019-CH1-S1-1.json`).
- `dataset/definitions/` — one JSON per legal definition (e.g. `CPA2019-CH1-S2-1.json`).
- `dataset/final/` — merged, validated datasets (e.g. `Consumer_Protection_Act_2019.json`).
- `schema/` — reference-only; defines exactly how every JSON must look.
- `docs/` — rules and tracking; no code.

## Workflow

```
Official PDF
    ↓
Read one subsection
    ↓
Identify type: Section  or  Definition
    ↓
Create one JSON
    ↓
Validate against schema (schema/section.json or schema/definition.json)
    ↓
Save in the correct folder (dataset/sections/ or dataset/definitions/)
    ↓
Tick off in docs/progress.md
    ↓
(Repeat)
    ↓
Merge into dataset/final/
```

## Naming conventions

`{ACT_ID}-CH{CHAPTER}-S{SECTION}-{SUBSECTION}`

Example: `CPA2019-CH1-S2-1` (Consumer Protection Act, 2019 — Chapter I — Section 2 — subsection (1)).

Filenames equal the node `id` plus `.json`. See `docs/naming-convention.md`.

## Dataset rules

1. One legal subsection = one JSON document.
2. One legal definition = one JSON document.
3. Preserve the official statutory wording — verbatim.
4. Never paraphrase.
5. Never invent information.
6. Follow the schema exactly.
7. Keep field order identical to the schema.
8. Do not add extra fields.
9. Do not remove required fields.
10. Maintain consistent IDs.
11. Use UTF-8 encoding.
12. Use meaningful filenames (`{id}.json`).
13. Keep the original PDFs unchanged.
14. Keep documentation updated as the dataset grows.

## JSON rules

- Valid JSON only; UTF-8; double quotes; 2-space indentation.
- `official_text` is the verbatim statutory text, punctuation preserved.
- `term`/`definition` are non-empty for definitions, `null` for sections.
- `citations` use Roman chapter numerals and parenthesised subsections.
- Empty `references` is `[]`; never omit the key.
- See `docs/json-rules.md` for the complete list.

## Contribution guidelines

1. Read `docs/naming-convention.md`, `docs/dataset-guidelines.md` and `docs/json-rules.md` first.
2. Always work from `source/` PDFs — never from memory or third-party sites.
3. Create one JSON per subsection/definition; validate against the schema.
4. Never edit another contributor's finished entries; create issues instead.
5. Update `docs/progress.md` with every new entry.
6. Keep the dataset folders clean: no drafts, no duplicate files, no merged output inside `sections/` or `definitions/`.
7. Commit in small, atomic units (one Act, one chapter).

## Future expansion

- Add more Acts: Indian Contract Act, 1872; RTI Act, 2005; BNS, 2023; etc.
- Multi-language entries (Hindi official gazette text).
- Cross-act reference validation.
- A verified `final/` merge per Act, in JSON and JSONL.

Nothing here will change the dataset schema; consumers of the dataset are expected to build around it.
