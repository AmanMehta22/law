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
   ₹50L–₹2Cr, National > ₹2Cr) are not consistently reflected. Fixing the
   dataset is future work; the eval accepts any State-commission-value card as
   content-correct for ev-052.
4. **V1 statute chunks (476) are excluded from retrieval** — they remain in the
   collection for the future citation feature but no longer pollute hybrid
   ranking (their identical `Section X of the Consumer Protection Act, 2019`
   headers had poisoned both BM25 and dense results).