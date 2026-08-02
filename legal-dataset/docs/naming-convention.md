# Naming Convention

Every JSON entry has a unique ID and a filename derived from that ID. There are
two layers: **V1 nodes** (`legal-node V1/`) and **V2 knowledge cards**
(`knowlege-card V2/`).

> Note: older docs referenced `dataset/sections/` and `dataset/definitions/`.
> Those folders no longer exist — V1 nodes live in `legal-node V1/sections_v1f/`,
> and V2 cards live in `knowlege-card V2/{concept_type}/`.

## V1 node ID structure

```
{ACT_ID}-CH{CHAPTER}-S{SECTION}-{SUBSECTION}
```

Example: `CPA2019-CH1-S2-10`

| Part | Rule | Example |
|---|---|---|
| Act ID | Uppercase letters + year, no spaces | `CPA2019` |
| Chapter | `CH` followed by the chapter number (no leading zero) | `CH1` |
| Section | `S` followed by the section number | `S2` |
| Subsection | The subsection number, no parentheses | `10` |

Regex (from `schema/v1f.json`): `^[A-Z0-9]+-CH[0-9]+-S[0-9]+(-[0-9]+)?$`

### Citation chapter format

Chapter numbers in the `id` use Arabic numerals (`CH1`, `CH2`, ...). The
`citations` array uses Roman numerals (`I`, `II`, ...), matching the Act.

### Whole-section IDs

When one JSON represents an entire section with no single subsection, omit the
subsection part: `CPA2019-CH1-S1`.

### Definition nodes

Definition nodes (V1 `content_type = "definition"`) use the same structure —
the subsection always refers to the clause where the term is defined.

```
CPA2019-CH1-S2-1      -> s.2(1) "advertisement"
CPA2019-CH1-S2-7      -> s.2(7) "consumer"
```

## V2 concept_id

Every V2 card uses a `{concept_type}.{name}` id.

```
{concept_type}.{name}
```

Regex (from `knowlege-card V2/v2Schema.json`):
`^[a-z]+\.([a-z0-9_]+\.[a-z0-9_]+|[a-z0-9_]+)$`
(the whole id is lowercase letters/digits/underscores; the name may be
one or two segments, e.g. `definition.consumer`)

Examples per concept_type (real cards that exist in this repo):

| concept_type | Example `concept_id` |
|---|---|
| definition | `definition.advertisement` |
| right | `right.right_to_access_to_variety_of_goods` |
| obligation | `obligation.additional_director_general_director_joint_director_deputy_d` |
| procedure | `procedure.adjournment_cost_imposition_by_district_commission` |
| authority | `authority.additional_director_general` |
| jurisdiction | `jurisdiction.district_collector_within_his_jurisdiction` |
| remedy | `remedy.compensation` |
| penalty | `penalty.failing_to_comply_with_direction_of_central_authority` |
| timeline | `timeline.a_period` |
| evidence | `evidence.accounts_audit_report` |
| exception | `exception.a_bench_may_be_constituted_by_the_president_with_one_or_more` |
| offence | `offence.a_manufacturer_or_service_provider_who_causes_a_false_or_misleading_advertisemen` |
| example | `example.advertisement` |
| intent | `intent.accounts_and_audit_reports` |
| alias | `alias.accounts_and_audit_reports` |
| relationship | `relationship.central_authority_references_misleading_advertisement` |

Notes:

1. Different concept types may share a similar stem (e.g. `definition.advertisement`
   and `example.advertisement`), but every `concept_id` on disk is unique — there
   are no duplicate concept_ids across the dataset.
2. Many V2 concept_ids are auto-truncated during generation to keep filenames
   within OS path-length limits (e.g. `..._advertisemen`). The truncated form is
   still the canonical id; do not re-expand it to a different string or
   references to it will break.
3. The `concept_id` pattern also permits a dotted form (e.g.
   `a.b.c`); prefer a single dotted segment (`type.name`) and reserve dotted
   names for future sub-grouping.