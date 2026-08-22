#!/usr/bin/env python3
"""
audit_gold_anchors.py — check RAG/eval/qa-full.json's `anchor` fields against the
authoritative section map, and optionally repair them.

Why this exists
---------------
The 150 gold anchors were hand-typed in `RAG/_tmp_build_questions.py`. Several are
wrong, and because the grader penalises an answer for citing anything outside the
anchor, correct answers were scored 0-41/100 for citing the *right* section. Any
retriever change measured against these labels is scored against faulty gold, so
improvement is indistinguishable from noise. Fix the ruler before measuring.

Derivation, strongest evidence first
------------------------------------
1. `explicit_citation` (high) - the question text itself names the section, e.g.
   "...recognised under Section 2(9)...". The question is its own ground truth;
   the map is used only to confirm the section exists in the Act.
2. `definition_term` (high) - a `definitions` question naming a term in quotes,
   resolved through the 47-clause s.2 index built from the Gazette PDF.
3. `definition_term_unquoted` (medium) - same, but the term appears unquoted
   ("What is an express warranty..."). Longest match wins so that
   "product liability" is not resolved as "product".
4. otherwise `unresolved` - reported for human review, never auto-changed.

Verdicts: AGREE / FIX (high confidence, differs) / REVIEW (medium or conflicting)
/ UNRESOLVED (no derivation).

Usage (from repo root):
    python legal-dataset/tools/audit_gold_anchors.py            # report only
    python legal-dataset/tools/audit_gold_anchors.py --apply    # rewrite FIX rows
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MAP = ROOT / "legal-dataset" / "acts" / "consumer-protection-act-2019" / "source" / "section-map.json"
QA = ROOT / "RAG" / "eval" / "qa-full.json"
OVERRIDES = Path(__file__).resolve().parent / "anchor-overrides.json"
REPORT = ROOT / "RAG" / "eval" / "anchor-audit.md"

ROMAN = {
    "i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5, "vi": 6, "vii": 7, "viii": 8,
    "ix": 9, "x": 10, "xi": 11, "xii": 12, "xiii": 13, "xiv": 14, "xv": 15,
}

# "Section 2(9)(ii)" / "section 35" / "s. 47(1)" / "Sections 38 and 39"
CITE = re.compile(
    r"\b(?:section|sections|sec\.?|s\.)\s*"
    r"(\d{1,3})"                                  # section
    r"(?:\s*\(\s*([0-9]{1,2})\s*\))?"             # subsection
    r"(?:\s*\(\s*([ivxlcd]{1,5}|[0-9]{1,2})\s*\))?",  # clause
    re.I,
)
QUOTED = re.compile(r"[\"'‘’“”]([^\"'‘’“”]{2,60})[\"'‘’“”]")

# A defined term is the *subject* of the question when it sits in one of these
# frames. This matters more than term length: in "A product works as promised
# but is that a defect?", "product" is the longer defined term but "defect" is
# what is being asked about.
SUBJECT_FRAMES = (
    r"what (?:is|are)(?: the definition of)?(?: a| an| the)?\s+{t}\b",
    r"what does(?: a| an| the)?\s+{t}\b\s*(?:include|mean|cover)",
    r"\bis (?:that|this|it)(?: a| an)?\s+{t}\b",
    r"\bcounts? as(?: a| an)?\s+{t}\b",
    r"\bdefine(?:s|d)?\s+{t}\b",
)

# Polar ("Does Section 106 provide...?") vs open ("What does Section 36 require?").
# A polar question may cite a section precisely because the premise is FALSE — the
# correct answer denies it and cites a different section. b088 asks "Does Section
# 106 provide the general exception for delayed consumer complaints?"; s.106 is
# "power to remove difficulties" and the real answer is s.69(2). So a citation
# inside a polar frame is a premise under test, not necessarily the gold anchor.
POLAR = re.compile(
    r"^\s*(?:does|do|did|is|are|was|were|can|could|may|must|should|shall|will|would|has|have|had)\b",
    re.I,
)


def polar_citation(question: str) -> bool:
    """True when a *sentence* that cites a section is polar. The frame is often not
    the first sentence: b142 opens with a scenario, then asks "Does Section
    2(41)(ii) require...". Checking only the question's first word misses it."""
    for sentence in re.split(r"(?<=[.?!])\s+", question):
        if CITE.search(sentence) and POLAR.match(sentence.strip()):
            return True
    return False


def section_of(anchor: str) -> str:
    return anchor.split("-", 1)[0] if anchor else ""


def subject_terms(question: str, index: dict[str, str]) -> list[str]:
    """Defined terms occupying subject position. Nested terms collapse to the
    longest ('consumer' inside 'consumer dispute' yields only the latter)."""
    lowered = question.lower()
    found = [
        term
        for term in index
        if any(
            re.search(frame.format(t=re.escape(term)), lowered)
            for frame in SUBJECT_FRAMES
        )
    ]
    return [t for t in found if not any(t != o and t in o for o in found)]


def to_int(token: str | None) -> int | None:
    if not token:
        return None
    token = token.strip().lower()
    if token.isdigit():
        return int(token)
    return ROMAN.get(token)


def anchor_of(section: int, sub: int | None = None, clause: int | None = None) -> str:
    parts = [f"S{section}"]
    if sub is not None:
        parts.append(str(sub))
        if clause is not None:
            parts.append(str(clause))
    return "-".join(parts)


def derive(row: dict, index: dict[str, str], sections: set[int]) -> tuple[str | None, str, list[str]]:
    """Return (anchor, method, notes)."""
    question = row.get("question") or ""
    notes: list[str] = []

    # --- 1. explicit citation in the question text -------------------------
    hits = []
    for match in CITE.finditer(question):
        sec = int(match.group(1))
        if sec in sections:
            hits.append(anchor_of(sec, to_int(match.group(2)), to_int(match.group(3))))
    if hits:
        distinct = sorted(set(hits))
        if len(distinct) > 1:
            # e.g. "difference between Section 2(41)(i) and Section 2(41)(ii)" —
            # picking one clause loses the comparison the question is making.
            notes.append(f"question cites {len(distinct)} anchors ({', '.join(distinct)}); used the first")
        if polar_citation(question) and section_of(hits[0]) != section_of(str(row.get("anchor") or "")):
            # Jumping to a different section under a polar frame is the false-premise
            # signature. Refining within the same section (S2-41 -> S2-41-2) is safe.
            notes.append(
                "polar question citing a different section than the existing anchor — "
                "the citation may be a false premise under test; verify against the "
                "statute text before changing"
            )
        return hits[0], "explicit_citation", notes

    # --- 2/3/4. defined term (definitions questions) -----------------------
    if row.get("category") == "definitions":
        subjects = subject_terms(question, index)
        if len(subjects) == 1:
            return "S2-" + index[subjects[0]][2:-1], "definition_subject", notes
        if len(subjects) > 1:
            notes.append(f"multiple subject terms {sorted(subjects)}")

        for quoted in QUOTED.findall(question):
            term = " ".join(quoted.split()).lower().strip(".,;:?")
            if term in index:
                return "S2-" + index[term][2:-1], "definition_term", notes
            notes.append(f'quoted term "{term}" is not a defined term in s.2')

        lowered = question.lower()
        candidates = [t for t in index if re.search(rf"\b{re.escape(t)}\b", lowered)]
        if candidates:
            best = max(candidates, key=len)
            if len(candidates) > 1:
                notes.append(f"unquoted term candidates {sorted(candidates)}; chose longest")
            return "S2-" + index[best][2:-1], "definition_term_unquoted", notes

    return None, "unresolved", notes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="rewrite FIX rows in qa-full.json")
    args = ap.parse_args()

    for path in (MAP, QA):
        if not path.exists():
            sys.exit(f"missing {path} (run build_section_map.py first)")

    section_map = json.loads(MAP.read_text(encoding="utf-8"))
    index: dict[str, str] = section_map["definition_index"]
    sections = set(section_map["sections"])
    rows = json.loads(QA.read_text(encoding="utf-8"))

    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8")) if OVERRIDES.exists() else {}
    corrections: dict = overrides.get("corrections", {})
    review: dict = overrides.get("review", {})
    stale: list[str] = []

    results = []
    for row in rows:
        current = str(row.get("anchor") or "")
        qid = row.get("id")

        # Hand-verified overrides outrank derivation: they encode a reading of the
        # statute that no regex can reach. Guarded by `was` so an already-applied or
        # since-edited row is never silently overwritten.
        if qid in corrections:
            entry = corrections[qid]
            if current == entry["was"]:
                results.append({
                    "id": qid, "category": row.get("category"), "question": row.get("question"),
                    "current": current, "derived": entry["anchor"], "method": "override",
                    "verdict": "FIX", "notes": [entry["reason"]],
                })
                continue
            if current != entry["anchor"]:
                stale.append(f"{qid}: override expects was={entry['was']} but file has {current}")

        derived, method, notes = derive(row, index, sections)
        high = method in ("explicit_citation", "definition_term", "definition_subject")

        if qid in review:
            verdict = "REVIEW"
            derived = derived or review[qid].get("keep")
            notes = notes + [review[qid]["issue"]]
        elif derived is None:
            verdict = "UNRESOLVED"
        elif derived == current:
            verdict = "AGREE"
        elif high and not notes:
            verdict = "FIX"
        else:
            verdict = "REVIEW"

        results.append(
            {
                "id": qid,
                "category": row.get("category"),
                "question": row.get("question"),
                "current": current,
                "derived": derived,
                "method": method,
                "verdict": verdict,
                "notes": notes,
            }
        )

    counts: dict[str, int] = {}
    for r in results:
        counts[r["verdict"]] = counts.get(r["verdict"], 0) + 1

    lines = [
        "# Gold anchor audit — RAG/eval/qa-full.json",
        "",
        "Anchors derived from the Gazette PDF section map, strongest evidence first:",
        "the section the question itself cites, else the s.2 defined term it names.",
        "`FIX` = high-confidence disagreement. `REVIEW` = needs a human. Nothing in",
        "`REVIEW`/`UNRESOLVED` is ever changed automatically.",
        "",
        "| verdict | count |",
        "| --- | --- |",
    ]
    for verdict in ("AGREE", "FIX", "REVIEW", "UNRESOLVED"):
        lines.append(f"| {verdict} | {counts.get(verdict, 0)} |")

    for verdict in ("FIX", "REVIEW", "UNRESOLVED"):
        subset = [r for r in results if r["verdict"] == verdict]
        if not subset:
            continue
        lines += [
            "",
            f"## {verdict} ({len(subset)})",
            "",
            "| id | cat | current | derived | method | question | notes |",
            "| --- | --- | --- | --- | --- | --- | --- |",
        ]
        for r in subset:
            q = (r["question"] or "").replace("|", "\\|")
            q = q if len(q) <= 90 else q[:87] + "..."
            lines.append(
                f"| {r['id']} | {r['category']} | `{r['current']}` | "
                f"`{r['derived'] or '-'}` | {r['method']} | {q} | "
                f"{'; '.join(r['notes'])} |"
            )

    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"total {len(results)}  " + "  ".join(f"{k}={counts.get(k,0)}" for k in ("AGREE", "FIX", "REVIEW", "UNRESOLVED")))
    print(f"report -> {REPORT.relative_to(ROOT)}")

    if stale:
        print("\nSTALE OVERRIDES (expected `was` no longer matches — reconcile by hand):")
        for s in stale:
            print(f"  {s}")

    fixes = [r for r in results if r["verdict"] == "FIX"]
    if fixes:
        print(f"\n{len(fixes)} high-confidence corrections:")
        for r in fixes:
            print(f"  {r['id']} {r['category']:16s} {r['current']:10s} -> {r['derived']:10s} ({r['method']})")

    if args.apply and fixes:
        shutil.copy2(QA, QA.with_suffix(".json.bak"))
        by_id = {r["id"]: r["derived"] for r in fixes}
        for row in rows:
            if row.get("id") in by_id:
                row["anchor"] = by_id[row["id"]]
        QA.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"\napplied {len(fixes)} fixes; backup at {QA.name}.bak")
    elif fixes:
        print("\ndry run — re-run with --apply to write these")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
