# Dataset Guidelines

Rules for creating dataset entries. Follow these for **every** JSON you create —
in both the V1 node layer and the V2 knowledge-card layer.

## Core Rule

> One statutory statement = one V1 node.
> One knowledge item = one V2 card.

## V1 node classification

When reading a subsection from the source PDF, classify it into one of the
**currently used** `content_type` values (14). The value lives in the
`content_type` field; `node_type` is always `"section"`.

| content_type | Meaning | Example |
|---|---|---|
| `definition` | Defines a legal term (e.g. s.2 of the CPA 2019) | `CPA2019-CH1-S2-1` |
| `commencement` | Act's short title / commencement | `CPA2019-CH1-S1-3` |
| `general` | General/miscellaneous provision | `CPA2019-CH1-S1-1` |
| `authority` | Establishes/describes an authority or body | `CPA2019-CH3-S10-1` |
| `procedure` | Procedural rule (steps, service, appeals process) | `CPA2019-CH4-S38-2` |
| `penalty` | Penalty for an offence | `CPA2019-CH7-S90-1` |
| `offence` | Creates an offence | `CPA2019-CH7-S91-1` |
| `appeal` | Appeal rights/paths | `CPA2019-CH4-S41` |
| `jurisdiction` | Pecuniary/territorial jurisdiction | `CPA2019-CH4-S28-1` |
| `remedy` | Remedial orders / relief | `CPA2019-CH4-S39-1` |
| `timeline` | Time limits / prescribed periods | `CPA2019-CH4-S38-2` proviso |
| `exception` | Exception / saving clause | `CPA2019-CH4-S38-5` |
| `obligation` | A mandatory duty ("shall…") | `CPA2019-CH3-S13-1` |
| `rule_making` | Rule-making / delegated legislation powers | `CPA2019-CH8-S101-1` |

These are the 14 values **actually present** in
`acts/consumer-protection-act-2019/v1-statute/sections/`.
The schema enum also permits `evidence` (currently unused in V1).

## V2 (knowledge cards) classification

Each V2 card carries a `concept_type` (one of 16). Content shape is enforced
by type in `schema/v2.schema.json`.

| concept_type | Content fields (schema-required) | When to use |
|---|---|---|
| `definition` | `term`, `legal_definition`, `plain_language`, `examples`, `non_examples` | The core meaning of a term as the Act defines it |
| `right` | `right`, `conditions`, `limitations`, `exceptions` | Something a consumer/person is entitled to |
| `obligation` | `who`, `what`, `conditions`, `limitations` | A duty imposed by the Act ("X must …") |
| `procedure` | `steps` (`{order, step}` array), `authority`, `documents` | A step-by-step process (filing, service, appeal) |
| `authority` | `name`, `role`, `powers`, `jurisdiction` | An authority/body and what it does |
| `jurisdiction` | `authority`, `territorial`, `pecuniary`, `conditions` | Where/what a commission or court can hear |
| `remedy` | `remedy`, `available_when`, `conditions`, `limitations` | Relief the commissions can order |
| `penalty` | `offence`, `punishment`, `minimum`, `maximum`, `applicable_section` | Imprisonment/fine for a specific offence |
| `timeline` | `duration`, `trigger`, `exceptions` | A prescribed statutory period |
| `evidence` | `required_documents`, `purpose`, `mandatory` | Documents/evidence required in proceedings |
| `exception` | `general_rule`, `exception`, `conditions` | An exception/saving/disclaimer to a rule |
| `offence` | `offence`, `punishment`, `applicable_section` | A penal offence (and its punishment) |
| `example` | `scenario`, `outcome` | A synthetic illustration — **not real case law** |
| `intent` | `queries` | Natural-language question variants for retrieval |
| `alias` | `aliases` | Alternative names / search synonyms |
| `relationship` | `source`, `relationship`, `target` | A typed edge between two concept ids |

## Writing rules

1. **V1 `official_text` is verbatim** — a direct copy from the PDF. No
   corrections, no modernisation, no translation. Never paraphrase it.
2. **V2 is faithful paraphrase of its sources.** Every legal claim in a V2
   card must be traceable to the card's `derived_from` V1 node(s). Never
   invent legal rules not present in the source.
3. **Never invent information.** If the Act does not say it, use
   `"Not specified in the Act"` (strings) or `[]` / `["Not specified in the Act"]`
   (arrays) — never a substitute legal rule.
4. **`derived_from` is mandatory.** Every V2 card names the V1 node id(s)
   whose `official_text` it was built from. `related_concepts` should point to
   *content* cards (definitions, procedures, authorities, …), not to intents/aliases.
5. **Preserve punctuation** in V1 (`official_text`) exactly as printed.
6. **Fill every field.** Every key in the schema must be present. Fields that
   do not apply use `null` (V1) or the conventions above (V2).
7. **Consistent IDs.** V1 ids derive from position in the Act; V2 concept_ids
   from `{concept_type}.{name}`.
8. **Empty means empty.** An empty `references` (V1) or `user_queries` (V2)
   array means "no cross-references/query variants found" — never omit the key.

## References (V1)

Only add a `references` entry when the text explicitly refers to another
section of the same Act (e.g. "as defined in section 2(47)"). `target` is the
node id of the referenced entry.

Relation vocabulary:

- `refers_to` — the source node explicitly cites the target section.
- `defined_in` — a definition node whose `term` is defined in the target.
- `used_in` — this node's provision is used/applied by the target.

When a whole section is referred to, use the whole-section id
(e.g. `CPA2019-CH3-S10`) even if the file does not exist yet.

## Progress

After creating each entry, tick it off in
`acts/consumer-protection-act-2019/review/progress.md`.

## Verification

- V1: validate against `schema/v1.schema.json`; confirm
  `metadata.checksum` equals
  the SHA-256 of `official_text`.
- V2: validate against `schema/v2.schema.json` (0 errors);
  confirm `derived_from` resolves; confirm `review_status` is
  `draft | reviewed | approved`.