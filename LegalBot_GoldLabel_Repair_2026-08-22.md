# Gold-label repair — CPA 2019 retrieval pipeline

**Date:** 2026-08-22
**Scope:** step one of the agreed sequencing (fix gold labels, then the retriever), working from the source Gazette PDF as the authority.

---

## What this changes

Fifteen of the 150 gold labels in `RAG/eval/qa-full.json` were wrong. They are now corrected, and the correction is reproducible from the source PDF rather than typed by hand.

This matters more than it sounds. The eval grader penalises an answer for citing anything outside its gold anchor, so a wrong anchor silently converts a correct answer into a failure. Seven answers scored **0 out of 100 on every axis while citing exactly the right section**:

| id | question | the bot cited | gold said | correct? |
| --- | --- | --- | --- | --- |
| b059 | What is 'harm' under the Act? | 2(22) | 2(29) | bot was right |
| b065 | What is an express warranty? | 2(20) | 2(18) | bot was right |
| b071 | What is the Central Consumer Protection Authority? | s.10 | 2(8) *(consumer dispute)* | bot was right |
| b079 | Can the Central Authority order recall of goods? | s.20 | s.10 | bot was right |
| b108 | Penalty for manufacturing or selling spurious goods? | s.91(1) | s.89 *(false advertising)* | bot was right |
| b067 | What is endorsement? | *(no citation)* | 2(13) → 2(18) | substance right, citation missing |
| b068 | What does 'establishment' include? | *(no citation)* | 2(16) → 2(19) | substance right, citation missing |

The 15 mislabelled questions averaged **49.3/100** against the other 123 questions' **82.7**. Repairing the labels lifts the headline mean from **79.0 to roughly 83.6 with no code change at all** — that ~4.6 points was never a model defect, it was a measurement defect.

One honest caveat: a wrong anchor did not *always* cause a penalty. b043, b045, b114 and b142 scored 100 despite wrong gold, which tells us the grader was inconsistent rather than strictly anchor-bound. That inconsistency is a separate problem, addressed below.

## The full anchor diff

Every change, with the pre-audit value on the left:

| id | category | was | now | basis |
| --- | --- | --- | --- | --- |
| b040 | definitions | S2-10 | **S2-6** | complaint is defined at 2(6) |
| b042 | definitions | S2-6 | **S2-8** | consumer dispute is 2(8) |
| b043 | definitions | S2-11 | **S2-10** | defect is 2(10) |
| b044 | definitions | S2-11 | **S2-10** | defect is 2(10) |
| b045 | definitions | S2-12 | **S2-11** | deficiency is 2(11) |
| b059 | definitions | S2-29 | **S2-22** | harm is 2(22); 2(29) is National Commission |
| b065 | definitions | S2-18 | **S2-20** | express warranty is 2(20) |
| b067 | definitions | S2-13 | **S2-18** | endorsement is 2(18) |
| b068 | definitions | S2-16 | **S2-19** | establishment is 2(19); 2(16) is e-commerce |
| b070 | definitions | S2-31 | **S2-13** | direct selling is 2(13); 2(31) is person |
| b142 | edge | S2-41 | **S2-41-2** | question is specifically about the tie-in clause 2(41)(ii) |
| b071 | authorities | S2-8 | **S10** | s.10 establishes the Central Authority; 2(8) is consumer dispute |
| b079 | authorities | S10 | **S20** | s.20(a) says verbatim "recalling of goods or withdrawal of services" |
| b108 | penalties | S89 | **S91** | s.91 covers spurious goods; s.89 is false advertising |
| b114 | penalties | S89 | **S72** | s.72(1) covers failure to comply with a Commission order |

## How it was done, and why it's trustworthy

Three stdlib-only tools now live in `legal-dataset/tools/`. They need no venv, no network and no running services, so they work in CI and on any machine.

`build_section_map.py` parses the Gazette PDF into `source/section-map.json` — all 47 defined terms in section 2 with a reverse index, all 107 section numbers, and each section's subsections. It validates 47/47 and 107/107 and exits non-zero on drift, so it doubles as a regression gate. Two things it had to work around: plain `pdftotext` finds all 107 sections but `-layout` mode finds only 54, because the Gazette's marginal-note column pushes section numbers off the line start; and section 2 needs two patterns because the Act defines terms with "means", with "includes", and with "in relation to X, means".

`audit_gold_anchors.py` derives each anchor from the strongest available evidence and only rewrites when it is confident. The strongest signal turned out to be that most questions *cite their own section* ("...recognised under Section 2(9)..."), which is better ground truth than any label. Failing that, it resolves the defined term the question is about.

Two guards in it earned their place by catching my own mistakes, and should not be removed:

The **polar-question guard.** b088 asks "Does Section 106 provide the general exception for delayed consumer complaints?" My first pass confidently "fixed" the anchor from s.69 to s.106. That was wrong — s.106 is *power to remove difficulties*, and the real answer is s.69(2). The question cites a section precisely because the premise is false. So a yes/no question citing a *different* section than the existing anchor is now flagged for review, never auto-applied. The original s.69 was right.

**Subject position beats term length.** b044 asks "A product works exactly as promised but I do not like its colour. Is that a defect?" Matching the longest defined term picked `product` (2(33)); the question is about `defect` (2(10)). Anchors now resolve the term in grammatical subject position.

Corrections that no rule can derive — the penalties and authorities ones — live in `anchor-overrides.json`, each with the statutory evidence and the reason, guarded by a `was` field so re-running never double-applies or overwrites an edited row. Nothing is magic; every change is reviewable in one file.

`check_anchor_plausibility.py` proposes nothing. It reports anchors pointing at no statute node (now zero), clause-level anchors the corpus cannot represent, and anchors lexically unrelated to their question. Its lexical ranker is deliberately labelled weak in its own report, because it is: it ranked b033's *correct* anchor 189th. It is triage, not a verdict.

## Two findings that change what to do next

**The eval demands a citation granularity the dataset cannot produce.** Thirty-two anchors are clause-level (`S2-9-3` for 2(9)(iii)), but `v1-statute.jsonl` contains **no clause-level nodes at all** — the smallest unit is the subsection, so 2(9)(i) through (vi) all live inside a single node. Retrieval can therefore never return 2(9)(iii) as a unit, which explains why 22 of 145 grades scored zero on the subsection axis. The good news: the clause *wording* is present inside the parent node in all 32 cases. So the fix belongs in the answer prompt — cite the clause you quote — and **not** in splitting the statute, which would break the `official_text` checksums and acceptance gate G2.

**The `penalties` category is systemically mislabelled.** Its anchors sit at a median rank of 261 out of 332 statute nodes against their own questions. All eight were then read by hand: two were plainly wrong (now fixed), two are unanchorable in the current schema, and one appears to rest on a false premise.

## What still needs your decision

Seven questions are flagged in `anchor-overrides.json` under `review` and were deliberately left untouched.

Three are cases where **one anchor is the wrong data model**: b050 asks the difference between 2(41)(i) and 2(41)(ii), b054 the difference between unfair and restrictive trade practice, and b113 whether penalties are civil or criminal (s.21 is civil, Chapter VII is criminal). A single-anchor schema penalises a correct answer for citing the other half of the comparison. These need a `anchors: []` list rather than a scalar.

Two need a judgement call: b111 ("who adjudicates offences and penalties") is currently anchored to s.90, which is adulterant penalties and clearly wrong — the answer spans s.92, s.21 and s.72(2), and I'd suggest s.92 if a single anchor is required. b077 asks the "role" of the District Commission, anchored to s.28 which merely establishes it; its role is s.34–s.39.

One looks like a **defective question**: b110 asks the penalty for obstructing the Director General. No such offence appears in the Act. s.93 is the only DG-specific penalty and it runs the opposite way — it punishes the DG for searching without reasonable grounds. Either re-anchor to s.93 or reword the question.

And the standing item from earlier, still open: I could not verify the **2021 prescribed pecuniary limits** (District up to ₹50 lakh, State ₹50 lakh–₹2 crore, National above ₹2 crore) from any source available here. They are subordinate legislation, absent from the Act PDF by definition, and web access is blocked in this environment. The Act's own proviso in s.34(1)/47(1)/58(1) expressly lets the Central Government prescribe other values, so supplying them alongside the verbatim text breaks nothing — but please confirm the figures, and whether anything changed after May 2025, before they reach users.

## Before the next measurement

The 15 corrected questions must be re-graded before any retriever change is evaluated, or the label fix and the retriever change will be confounded in the same number. That also requires the grader gap to be closed: **no grader script exists in the repo**, so `qa-full-grades.jsonl` has no reproducible producer and its rubric cannot be inspected — and grader identity currently predicts the score (means of 77.7, 84.1 and 51.4 across three graders), so "79.0" was never a single measurement.

Recoverability note: `qa-full.json` is not tracked by git, so a pristine pre-audit copy was reconstructed at `RAG/eval/qa-full.pre-audit.json` from the anchor fields preserved in the answers and grades files. It independently confirms exactly 15 anchors changed and no others.
