# LegalBot — live pipeline probe

Run: 2026-08-31T11:50:18.790Z  ·  backend `http://localhost:3000`  ·  RAG `http://localhost:8000`  ·  direct top_k=10
Mode: retrieval + chat

## Health

- **backend** — reachable, HTTP 200
- **rag** — reachable, HTTP 200

## Summary

| id | category | RAG docs | v1 leak | canonical in top5 | chat ms | provider | conf | oos | reply chars |
|---|---|---|---|---|---|---|---|---|---|
| jur1 | jurisdiction_currency | 10 | 0 | 5/5 | 2449 | groq | 0.9 | - | 1020 |
| def1 | definitions | 10 | 0 | 5/5 | 3802 | groq | 0.9 | - | 1384 |

`v1 leak` = retrieved docs with no concept_id (statute chunks that should be excluded from candidate generation).
`canonical in top5` = slots held by non-`example`/non-search-only cards. Low values mean example twins are crowding out canonical cards.

---

## jur1 — jurisdiction_currency

**Q:** My claim is worth Rs 80 lakh. Which consumer commission do I have to file in — District, State or National?

**Expected:** THE SINGLE MOST IMPORTANT PROBE — a wrong answer sends a real person to the wrong forum. Source PDF s.34(1) says 'does not exceed one crore rupees' BUT carries a proviso: 'Provided that where the Central Government deems it necessary so to do, it may prescribe such other value, as it deems fit.' The Government exercised that power in 2021, so the operative limits are District <= Rs 50 lakh, State Rs 50 lakh-2 crore, National > Rs 2 crore. Correct answer here: State Commission. A bare 'District, because the limit is 1 crore' is stale and harmful; quoting 1 crore WITHOUT the proviso is also wrong.

### Direct retrieval

10 docs in 843 ms

 1. `jurisdiction.state_commission_exceeds_rupees_one_crore_but_does_not_exceed_rupees_ten_crore_w` [jurisdiction] <= CPA2019-CH4-S47-1
    > Title: Pecuniary jurisdiction of State Commission Description: Subject to the other provisions of this Act Content: Authority: State Commission Territorial: within the State Pecuniary: exceeds rupees one crore but does n…
 2. `jurisdiction.district_commission_up_to_one_crore_rupees_where_the_opposite_party_resides_or_c` [jurisdiction] <= CPA2019-CH4-S34-1
    > Title: Pecuniary jurisdiction of District Commission Description: District Commission's jurisdiction to entertain complaints Content: Authority: District Commission Territorial: Not specified in the Act Pecuniary: Up to …
 3. `jurisdiction.national_commission_exceeds_ten_crore_rupees_no_territorial_limits_mentioned` [jurisdiction] <= CPA2019-CH4-S58-1
    > Title: Pecuniary jurisdiction of National Commission Description: ... Content: Authority: National Commission Territorial: No territorial limits mentioned Pecuniary: Exceeds ten crore rupees Conditions: - Complaint value…
 4. `procedure.filing_complaints_with_the_state_commission` [procedure] <= CPA2019-CH4-S47-1
    > Title: Filing complaints with the State Commission Description: Filing complaints with the State Commission where the value of goods or services exceeds rupees one crore but does not exceed rupees ten crore Content: Step…
 5. `jurisdiction.state_commission_other_value_of_goods_and_services` [jurisdiction] <= CPA2019-CH8-S101-2,CPA2019-CH4-S47-1
    > Title: Pecuniary jurisdiction of State Commission Description: State Commission jurisdiction Content: Authority: State Commission Territorial: within the State Pecuniary: complaints against unfair contracts where the val…
 6. `obligation.district_commission_shall_have_jurisdiction_to_entertain_com` [obligation] <= CPA2019-CH4-S34-1
 7. `jurisdiction.district_commission_other_value_of_goods_and_services` [jurisdiction] <= CPA2019-CH4-S34-1,CPA2019-CH8-S101-2
 8. `procedure.filing_of_complaints_and_appeals_with_the_national_commissio` [procedure] <= CPA2019-CH4-S58-1
 9. `obligation.state_commission_must_entertain_complaints_where_the_value_o` [obligation] <= CPA2019-CH4-S47-1
10. `exception.central_government_may_prescribe_a_different_value` [exception] <= CPA2019-CH4-S34-1

### Final answer

latency 2449 ms (first token 1943 ms) · provider groq · confidence 0.9 · review reviewed · readyForRag true · out_of_scope false · done frame true

Status frames: `Understanding your question…` -> `Searching the Consumer Protection Act…` -> `Writing your answer…`

Cards used (5):

- `jurisdiction.state_commission_exceeds_rupees_one_crore_but_does_not_exceed_rupees_ten_crore_w` [jurisdiction] reviewed
- `jurisdiction.district_commission_up_to_one_crore_rupees_where_the_opposite_party_resides_or_c` [jurisdiction] reviewed
- `jurisdiction.national_commission_exceeds_ten_crore_rupees_no_territorial_limits_mentioned` [jurisdiction] reviewed
- `procedure.filing_complaints_with_the_state_commission` [procedure] reviewed
- `jurisdiction.state_commission_other_value_of_goods_and_services` [jurisdiction] reviewed

Reply:

```
**Short answer**  
You should file your complaint with the District Commission because the claim value of Rs 80 lakh is below the one‑crore‑rupee limit.

**Why**  
The Act gives the District Commission authority to hear cases where the amount paid does not exceed one crore rupees. Your claim of Rs 80 lakh (eight hundred thousand rupees) falls within that range, so a higher‑level commission is not required.

**What you can do now**  
1. Collect all proof of purchase, invoices, and any communication with the seller.  
2. Write a clear complaint stating the amount (Rs 80 lakh) and the problem you faced.  
3. Submit the complaint and supporting documents to the District Commission that has jurisdiction over the seller’s location.  
4. Keep a dated copy of everything you file and note the receipt or acknowledgment you receive.  
5. Follow up with the Commission if you do not hear back within a reasonable time.

**The law behind this**  
- Section 34(1) – District Commission jurisdiction up to one crore rupees.
```

Follow-ups: "Tell me more about Pecuniary jurisdiction of State Commission", "Tell me more about Pecuniary jurisdiction of District Commission", "Tell me more about Pecuniary jurisdiction of National Commission"

---

## def1 — definitions

**Q:** What counts as an unfair trade practice, and how is it different from a restrictive trade practice?

**Expected:** UTP s.2(47), RTP s.2(41). Definitions score 100% strict recall — this is the CONTROL probe. If this one is also weak, the problem is generation, not retrieval.

### Direct retrieval

10 docs in 132 ms

 1. `definition.restrictive_trade_practice` [definition] <= CPA2019-CH1-S2-41
    > Title: Restrictive Trade Practice Description: A trade practice that manipulates price, delivery conditions, or supply flow, imposing unjustified costs or restrictions on consumers. Content: Term: restrictive trade pract…
 2. `definition.unfair_trade_practice` [definition] <= CPA2019-CH1-S2-47
    > Title: Unfair Trade Practice Description: Definition of Unfair Trade Practice under the Consumer Protection Act, 2019 Content: Term: unfair trade practice Legal Definition: a trade practice which, for the purpose of prom…
 3. `remedy.redressal` [remedy] <= CPA2019-CH1-S2-9
    > Title: Redressal against unfair trade practice Description: right to seek redressal against unfair trade practice or restrictive trade practices or unscrupulous exploitation of consumers Content: Remedy: Redressal Availa…
 4. `timeline.a_period` [timeline] <= CPA2019-CH1-S2-47
    > Title: Refund time limit Description: refund the consideration within the period stipulated in the bill or cash memo or receipt or in the absence of such stipulation, within a period Content: Duration: a period Trigger: …
 5. `obligation.trader_must_supply_goods_or_services_within_the_agreed_perio` [obligation] <= CPA2019-CH1-S2-41
    > Title: Trader must supply goods or services within agreed period Description: A trader must supply goods or services within the agreed period to avoid delay that may lead to a rise in price Content: Who: Trader What: mus…
 6. `evidence.test_results_records_of_testing` [evidence] <= CPA2019-CH1-S2-47
 7. `right.right_to_redressal` [right] <= CPA2019-CH1-S2-9
 8. `remedy.discontinuation_of_unfair_practices` [remedy] <= CPA2019-CH3-S20
 9. `example.restrictive_trade_practice` [example] <= definition.restrictive_trade_practice
10. `exception.except_such_contest_lottery_game_of_chance_or_skill_as_may_b` [exception] <= CPA2019-CH1-S2-47

### Final answer

latency 3802 ms (first token 3187 ms) · provider groq · confidence 0.9 · review reviewed · readyForRag true · out_of_scope false · done frame true

Status frames: `Understanding your question…` -> `Searching the Consumer Protection Act…` -> `Writing your answer…`

Cards used (5):

- `definition.restrictive_trade_practice` [definition] reviewed
- `definition.unfair_trade_practice` [definition] reviewed
- `remedy.redressal` [remedy] reviewed
- `timeline.a_period` [timeline] reviewed
- `obligation.trader_must_supply_goods_or_services_within_the_agreed_perio` [obligation] reviewed

Reply:

```
**Short answer**  
The Act does not give a definition of “unfair trade practice” in the sections provided, but it does define “restrictive trade practice” as a practice that manipulates price, delivery or supply, including (i) unreasonable delay that can raise price and (ii) forcing a purchase of one product or service as a condition for another.

**Why**  
You asked what counts as an unfair trade practice and how it differs from a restrictive one. The Act mentions unfair trade practices in the list of consumer rights but does not spell out what they are. It does, however, spell out the meaning of restrictive trade practice, which is a specific type of unfair behavior that harms consumers by controlling price, delivery timing, or supply flow.

**What you can do now**  
1. Review the full Consumer Protection Act, 2019 to see if a definition of “unfair trade practice” appears elsewhere.  
2. Look for rules or regulations made under the Act that list specific unfair practices.  
3. Keep records of any suspected practice (advertisements, contracts, receipts).  
4. If you believe a practice is unfair or restrictive, write to the seller describing the issue and what remedy you seek.  

**The law behind this**  
- Section 2(9) – mentions unfair trade practice in consumer rights list.  
- Section 2(41) – defines “restrictive trade practice” and lists its two main forms.
```

Follow-ups: "Tell me more about Restrictive Trade Practice", "Tell me more about Unfair Trade Practice", "Tell me more about Redressal against unfair trade practice"

---
