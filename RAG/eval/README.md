# Consumer Law Evaluation Set

100-question retrieval benchmark for the RAG knowledge base (v2 knowledge cards
from the Consumer Protection Act, 2019).

## Files

- `consumer-eval-set.jsonl` — questions with expected `concept_id`s, verified
  alternative cards, category, and a grounded ideal answer.
- `run_eval.py` — runs the benchmark and writes `eval-report.json`.
- `sweep_configs.py` — quick fusion-config sweep (dense candidates, RRF
  constants) for retriever tuning.

## Run

```bash
cd RAG
uv run python eval/run_eval.py
```

## Metrics

- **Strict recall@5** — the expected card appears in the top-5.
- **Content recall@5** — the expected card or a verified same-content card
  (e.g. the `example.*` twin of an `obligation.*` card) appears in the top-5.

## Current Results (k=5)

| metric            | score |
| ----------------- | ----- |
| Content recall@5  | 99/100 (99%) |
| Strict recall@5   | 74/100 (74%) |

Category breakdown is printed by the runner and stored in `eval-report.json`.

## Citation Audit (2026-08)

Every `Section N(...)` citation in the ideal answers was cross-checked against
the V1 statute files (`legal-dataset/.../v1-statute/sections/`) and verified
by Groq (llama-3.3-70b-versatile, 3 API keys, unanimous agreement on 19/20
claims; the 20th, S.22(3), was confirmed directly against the file text).
19 entries were corrected; the most important were:

- **State Commission jurisdiction `S.42(1)(a)` → `S.47(1)(a)`** — S.42(1) is
  establishment, S.47(1)(a) is the jurisdiction clause (also fixed in
  `backend/src/services/calculators.service.ts`,
  `backend/src/templates/documentTemplates.ts` and the calculator tests).
- **Definition numbers** — direct selling `2(15)`→`2(13)`, express warranty
  `2(22)`→`2(20)`, harm `2(26)`→`2(22)`, manufacturer `2(29)`→`2(24)`,
  restrictive trade practice `2(40)`→`2(41)`.
- **Disposal timelines `S.38(3)` → `S.38(7)`** (3/5-month clauses), appeal
  `S.50` → `S.51`, settlement recording `S.79` → `S.81(1)`, transfer/consolidation
  `S.34(3)/42(3)/58(3)` → `S.48/62`, seized-document return `S.22` → `S.22(3)`.
- **Offences** — CCPA direction `S.95`→`S.88`, adulterated products `S.86`→`S.90`,
  DG search/seizure `S.94`→`S.93`; product liability `S.85`/`S.86` swapped
  (S.85 = service provider, S.86 = seller); corrective advertisement
  `S.21(2)` → `S.39(1)(l)`; multi-consumer payment `S.88(3)` → `S.39(1)(k)`;
  compounding rephrased without a section number (see limitation 5).

## Known Limitations

1. **ev-067 (appeal to Supreme Court)** — the card
   `procedure.filing_an_appeal_to_the_supreme_court` is not retrievable: its
   structured `Steps: - Order: N Step:` text embeds poorly with the current
   embedding model (not in dense top-40) and ranks ~29 in BM25 behind
   higher-overlap appeal cards. Needs a better embedding model or dataset
   formatting pass.
2. **Exception cards are terse** — canonical `exception.*` cards (e.g. the
   commercial-purpose consumer exclusion) are so short that BM25 and dense
   both prefer their `example.*` twins or `definition.consumer`. Strict recall
   for the exceptions category is 0% while content recall is 100%.
3. **Jurisdiction value figures are inconsistent in the dataset** — the
   canonical `jurisdiction.*_other_value_of_goods_and_services` cards say only
   "other value of goods and services / as prescribed" (no figures), while some
   `example.*` and `obligation.*` cards carry the pre-2021 limits ("exceeds one
   crore... ten crore"). The 2021-amended limits (District ≤ ₹50L, State
   ₹50L–₹2Cr, National > ₹2Cr) are not consistently reflected. The V1 statute
   text itself (`S34-1`, `S47-1`, `S58-1`) still shows the pre-2021 figures;
   section numbers are unchanged by the amendment, so citations remain valid.
   Fixing the dataset is future work; the eval accepts any
   State-commission-value card as content-correct for ev-052.
4. **V1 statute chunks (476) are excluded from retrieval** — they remain in the
   collection for the future citation feature but no longer pollute hybrid
   ranking (their identical `Section X of the Consumer Protection Act, 2019`
   headers had poisoned both BM25 and dense results).
5. **Dataset numbering drifts from the real Act** (future cleanup) — the V1
   statute files: label the State Commission review power `S.50` (the appeal to
   the National Commission is `S.51`); end Chapter VII at `S.93` with no
   S.94–96 and **no compounding section** (compounding of the S.88/89 offences
   is mentioned only in a v2 penalty card, so ideal answers avoid a section
   number for it); and the `penalty.payment_for_loss_to_multiple_consumers`
   card mis-cites "Section 38(k)" (the clause is `S.39(1)(k)` — its own
   `derived_from` points at `CPA2019-CH4-S39-1`). These were worked around in
   the ideal answers rather than editing the dataset.