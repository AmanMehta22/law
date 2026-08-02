# JSON Rules

Formatting and structural rules for every JSON file in the dataset — V1 nodes
(`legal-node V1/`) and V2 cards (`knowlege-card V2/`).

## Canonical schemas

| Layer | Schema file |
|---|---|
| V1 nodes | `schema/v1f.json` |
| V2 cards | `knowlege-card V2/v2Schema.json` |

These are the **only** schemas. There is no `schema/section.json` or
`schema/definition.json`; older docs that reference them are stale.

## Formatting (both layers)

1. **Valid JSON only.** Every file must parse (no trailing commas, no comments, no unquoted keys).
2. **UTF-8 encoding**, no BOM.
3. **Double quotes only.**
4. **Preserve punctuation** — statutory text keeps its original punctuation, including the trailing semicolon `;` (V1 `official_text`).
5. **2-space indentation.**
6. **No HTML or markdown** inside string values.
7. **Do not add, remove or rename fields.** `additionalProperties: false`
   rejects extras; required keys are always present.

## V1 — structure and type discipline

8. Field order follows `schema/v1f.json` — the canonical ordering.
9. `node_type` is **always** `"section"` (const). The node kind is carried by
   `content_type` (14 currently used values — see `docs/dataset-guidelines.md`).
10. `chapter_number` is an integer (`1`); `section_number` is a string
    (`"2"`); `subsection_number` is `""` for whole-section nodes, else `"(1)"`.
11. `official_text` is the verbatim statutory wording.
12. `term` is present only on `content_type = "definition"` nodes.
13. `metadata.checksum` must equal the SHA-256 hex digest of `official_text`
    (UTF-8). This is how V1 integrity is verified.
14. `citations`, `relationships` and `metadata` (jurisdiction, language,
    status, effective_from, effective_to, checksum, token_count) are always present.

## V2 — structure (`v2Schema`)

15. Field order follows `knowlege-card V2/v2Schema.json` — the canonical ordering.
16. `concept_id` matches the regex
    `^[a-z]+\.[a-z0-9_]+(\.[a-z0-9_]+)?$` — e.g. `definition.consumer`,
    `procedure.complaint`. The filename is `{concept_id}.json`.
17. `concept_type` is one of the 16 enum values; `content` is validated
    against the matching per-type object schema (see
    `docs/dataset-guidelines.md` for fields).
18. `derived_from` names actual V1 node id(s). Every entry must resolve to a
    file in `legal-node V1/sections_v1f/`.
19. `related_concepts` must point to existing cards; content-only targets
    (definitions, procedures, authorities, …) are preferred over
    intent/alias links.
20. `metadata.review_status` is `draft | reviewed | approved`; when
    `reviewed`/`approved`, `confidence` is a number in `[0, 1]` and
    `reviewed_by` names the reviewer.
21. `search` object always has `keywords`, `aliases` and `user_queries`;
    empty means `[]`, never an omitted key.

## Filenames

22. Filename equals the node id / concept id plus `.json`.
23. The `id` inside the file must match the filename, e.g.
    `CPA2019-CH1-S2-1.json` contains `"id": "CPA2019-CH1-S2-1"` and
    `definition.consumer.json` contains `"concept_id": "definition.consumer"`.

## Validation

24. Validate every V1 file against `schema/v1f.json` and every V2 file
    against `knowlege-card V2/v2Schema.json`.
25. A file that does not validate is **not** part of the dataset.