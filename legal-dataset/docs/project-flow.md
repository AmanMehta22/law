# Consumer Protection Act, 2019 — Complete Project Flow

End-to-end pipeline that turns the raw statute into a validated, merged
knowledge-graph dataset (V1 nodes → V2 knowledge cards → final merged
artifacts), as implemented for `legal-dataset/`.

Status: **complete** (all phases executed; final G-Deep pass green; docs and
state tracked).

---

## 1. Overview

```
 India Code / Gazette text
        │
        ▼
 V1  legal-node V1/  (276 section nodes, verbatim official_text)
        │  split + normalize + cross-reference
        ▼
 V2  knowlege-card V2/  (4,147 knowledge cards, 16 concept folders)
        │  schema-validate, coverage check
        ▼
Review  pass 1 (LLM) → 621 reviewed / 3,526 draft
        │  _review_state.json  (review status machine)
        ▼
Audit   pass 2 (LLM) → 124 adjudications → 98 CONFIRM / 26 FALSE_POSITIVE
        │  docs/_llama_audit.json + _llama_audit_adjudicated.json
        ▼
Manual adjudication → apply_fixes.py (23 fixes + 1 derived_from append)
        │  backups, review-state reconciliation
        ▼
Merge   dataset/final/  knowledge_cards_v2.{json,jsonl} + search_augmentation.json
        │  G1–G8 gates + G-Deep check
        ▼
Docs    docs/progress.md  +  docs/project-flow.md (this file)
```

---

## 2. Phase 1 — V1 statute layer (`legal-node V1/`)

- Parse the Consumer Protection Act, 2019 into structured section nodes.
- **Files:** `sections_v1f/` — **276 nodes** (sections, subsections,
  definitions).
- Every node stores `official_text` verbatim, with `id`
  (e.g. `CPA2019-CH4-S41`), `path`, `chapter_number`, `section_number`,
  `subsection_number`, `citations`, `metadata` (+ SHA-256 `checksum` of
  `official_text`).
- Cross-verified against India Code / Gazette via compare-only passes:
  **0 content changes** in all chapters (I–VIII, plus 47 definitions);
  flagged diffs were extraction artifacts (broken words, margin bleed,
  spaced hyphens, page-number leakage).
- **Merged V1:** `dataset/final/Consumer_Protection_Act_2019.json` /
  `.jsonl` — 276 nodes.

## 3. Phase 2 — V2 knowledge cards (knowlege-card V2/)

Cards generated from V1 (per-category agents):
`PenaltyAgent`, `ObligationAgent`, `TimelineAgent`, etc.

| concept_type | Folder | Files |
|---|---|---|
| alias | `aliases/` | 591 |
| authority | `authorities/` | 38 |
| definition | `definitions/` | 48 |
| evidence | `evidence/` | 54 |
| example | `examples/` | 621 |
| exception | `exceptions/` | 72 |
| intent | `intents/` | 1,820 |
| jurisdiction | `jurisdiction/` | 18 |
| obligation | `obligations/` | 207 |
| offence | `offences/` | 9 |
| penalty | `penalties/` | 20 |
| procedure | `procedures/` | 98 |
| relationship | `relationships/` | 494 |
| remedy | `remedies/` | 13 |
| right | `rights/` | 24 |
| timeline | `timelines/` | 20 |
| **Total** | | **4,147** |

Card schema: `v2Schema.json`. Each card has `concept_id`, `concept_type`,
`title`, `description`, `content`, `derived_from` (links to V1 node ids),
`search` (keywords/aliases/queries), `metadata` (jurisdiction, act,
`review_status`, `confidence`, `reviewed_by`, `version`).

**Coverage gate:** every one of the 276 V1 nodes is referenced by ≥ 1 card's
`derived_from` (0 uncovered).

---

## 4. Phase 3 — Content review, pass 1 (2026-08-02)

- Reviewer: `meta-llama/llama-3.3-70b-instruct`, temperature 0, strict on
  objective facts, FAIR paraphrase bias.
- Tier A (100%): penalties 20, offences 9, procedures 98, timelines 20,
  definitions 48 → **195 cards reviewed**.
- Tier B (20% sample per category): authorities, jurisdiction, rights,
  obligations, remedies, exceptions, evidence → 48 reviewed; remaining
  Tier-B **bulk-approved** (confidence 0.75) → 426 Tier-B reviewed.
- Tier C (examples/intents/aliases/relationships): remain `draft`
  (search-support artifacts, out of scope).
- **Output:** total 621 `reviewed`, 3,526 `draft`, 46 flag-for-human
  advisories; auto-fix audit fixed/reverted 9 cards (verified against the
  Act). State machine: `docs/_review_state.json`.

## 5. Phase 4 — Audit, pass 2 (LLM, second check)

- Ran the same reviewer over the 621 reviewed cards.
- **621 verdicts → 124 field-level adjudications → 98 CONFIRM / 26
  FALSE_POSITIVE**.
- Telemetry: `docs/_llama_audit.json` (raw) +
  `docs/_llama_audit_adjudicated.json` (decisions, per `concept_id`).
- **Key finding:** adjudicator is self-contradictory. It CONFIRMS flags whose
  own reason text admits the card is correct
  (e.g. `remedy.setting_aside_of_order`, `evidence.affidavit`,
  `exception.except_the_state_of_jammu_and_kashmir`) and confirmed
  false-by-design "subsequent contravention" flags that live on separate
  cards (e.g. `penalty.subsequent_publishing_of_false_or_misleading_advertisement`).
- → All 98 CONFIRM flags re-adjudicated manually against V1 `official_text`
  in a second thorough pass.

## 6. Manual adjudication — `apply_fixes.py`

Constraints honored:
- **Only source-derived fixes** (changes backed by V1 `official_text`).
- **No legal-content rewrites** (only metadata / value alignment).
- Every edit is a `(card_id, dot_path, new_value)` tuple (or a
  `derived_from` append).

### Items applied (23 field fixes + 1 derived_from append, 24 cards)

- evidence: `evidence.deposit_receipt.required_documents` →
  `["Fifty per cent. deposit receipt"]` (S41).
- offences:
  - `offence.a_manufacturer_...advertisemen.punishment` — added
    subsequent-offence tier (S21(3)).
  - `offence.manufactures_for_sale_..._any_product_c.punishment` — full
    tiered range (S91(1)).
- obligations (8):
  - `consumer_mediation_cell_shall_submit_a_quarterly_report.conditions` —
    added submission-destination clause (S74(5)).
  - `product_service_provider_must_provide_service_of_quality_req.limitations`
    — 4× duplicate strings → four statutory clauses (S85).
  - `mediator_must_disclose_such_other_facts...`, `parties_to_a_...`,
    `district_commission_must_not_grant_adjournment_without_suffi`,
    `district_commission_must_record_reasons_for_adjournment_in_w` →
    corrected `limitations` (S77-2, S80-1, S38-7).
  - `central_government_may_prescribe_{such_other_value,value_for_complaints}.
    limitations` → "such value as the Central Government deems fit".
- procedures (7): documents-contamination cleanup on
  `appeal_to_national_commission`, `appeal_to_state_commission`,
  `authentication_of_goods` (→ "Not specified in the Act"),
  `deposit_of_amount`, `filing_complaint` (→ form + fee), `filing_complaints`
  (→ "complaint"), `mandating_unique_goods_identifiers` (→ "Not specified in
  the Act").
- timelines (3): `timeline.one_year.exceptions` → "Not specified in the Act";
  `timeline.three_years.trigger` and `timeline.the_period_so_specified.trigger`
  → corrected triggers.
- remedies (1): `remedy.damages.limitations` → "Not specified in the Act".
- rights (1): `right.right_to_fair_contract_terms.exceptions` → "Not specified
  in the Act".
- derived_from append: `offence.offences_under_clauses_b_and_c_of_sub_section_1_of_section_91_cognizable_and_non_bailable`
  += `CPA2019-CH7-S91-1`.

- **Kept as-is (user decision):** both `penalty.making_false...` and
  `penalty.manufacturing_storing_selling_distributing_or_importing_prod` —
  their min/max values already mirror the statutory tiers.

### Script correctness fixes applied to `apply_fixes.py`

1. Fixed `FIXES` → `FIX` (undefined-variable bug would have crashed).
2. Removed duplicate `consumer_mediation_cell` FIX entry.
3. Culled the known-false `district_commission_must_give_opportunity_of_being_heard_to_`
   entry.

### Review-state reconciliation

- `docs/_review_state.json`: `needs_human_review` 84 → **73** field entries /
  **39** distinct cards; `fixed` 9 → **33**; `passed`/`processed` 281 each.

## 7. Phase 5 — Final merges

Regenerated by `phase4_merge.py`:

- `dataset/final/knowledge_cards_v2.json` — **4,147 cards** (sorted by
  `concept_id`).
- `dataset/final/knowledge_cards_v2.jsonl` — **4,147 lines**.
- `dataset/final/search_augmentation.json` — **533 concept entries**
  (intents + aliases folded per base concept).

Pre-change backups for every edited card:
`%TEMP%\opencode\pre_fix_backup\` (see `docs/` script notes).

## 8. Acceptance gates

| Gate | Description | Result |
|---|---|---|
| G1 | V2 cards validate against schema; V1 nodes against `v1f.json` | PASS (4,147 / 276, 0 invalid) |
| G2 | V1 checksum = SHA-256(`official_text`) | PASS (0 missing, 0 mismatch) |
| G3 | Unique `concept_id` across all V2 cards | PASS (0 duplicates) |
| G4 | No orphan `derived_from` / `related_concepts` refs | PASS (0) |
| G5 | Every V1 node referenced by ≥ 1 card `derived_from` | PASS (0 uncovered) |
| G6 | `dataset/final` merges present and consistent (json == jsonl == 4,147) | PASS |
| G7 | Tier A cards 100% `reviewed` | PASS (195/195) |
| G8 | `review_status` vocabulary = {draft, reviewed} only | PASS |
| Deep | G-Deep integrity scan (id, required fields, content non-empty, derived_from transitive resolution, augmentation key uniqueness, outbound refs) | PASS (0 issues) |

**Result: all gates pass; deep check re-ran clean post-fix and post-regeneration.**

## 9. Final dataset state

- 4,147 V2 cards; 276 V1 nodes; 621 `reviewed`; 3,526 `draft`.
- **39 distinct cards** (73 field-level entries) remain flagged for human
  review (see `docs/_review_state.json`); none were auto-modified.
- Merged artifacts regenerated and consistent.

---

## 10. Pointers

- Live tracker / state machine: `docs/_review_state.json`.
- Review runtimes / audit dumps: `docs/_llama_audit.json`,
  `docs/_llama_audit_adjudicated.json`.
- Card/section rules: `docs/dataset-guidelines.md`, `docs/json-rules.md`,
  `docs/naming-convention.md`.
- Source law text (verbatim): `legal-node V1/`.
- Knowledge graph: `knowlege-card V2/`.
- Final pairs: `dataset/final/`.

*Last updated: 2026-08-02.*