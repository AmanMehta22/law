#!/usr/bin/env python3
"""
check_anchor_plausibility.py — sanity-check gold anchors that cannot be derived
mechanically, and report anchors the corpus cannot actually represent.

`audit_gold_anchors.py` repairs anchors it can derive from hard evidence (a
section the question cites, or a defined term resolved through the s.2 index).
That leaves ~92 questions whose anchor is a judgement call. This tool does not
guess a replacement — it answers two narrower questions that need no judgement:

  1. RESOLVABILITY — does the anchor point at a statute node that exists?
     Clause-level anchors are the interesting case. v1-statute.jsonl has no
     clause nodes at all: 2(9)(i)-(vi) live inside a single `CPA2019-CH1-S2-9`
     node. So an anchor of `S2-9-3` demands a citation granularity the corpus
     cannot return, and the grader penalising an answer for citing 2(9) rather
     than 2(9)(iii) is asking for something retrieval cannot supply. Reported as
     CLAUSE_NOT_A_NODE, with a check of whether the clause text at least exists
     inside the parent node.

  2. PLAUSIBILITY — is the anchor lexically related to the question at all?
     Every node is scored against the question by IDF-weighted term overlap
     (stdlib only, no embeddings, so this runs with no services up). If the
     anchored node ranks far down that list, the anchor is worth a human look.
     A low rank is a smell, not a verdict: scenario questions legitimately share
     little vocabulary with the statute.

Usage (from repo root):
    python legal-dataset/tools/check_anchor_plausibility.py
    python legal-dataset/tools/check_anchor_plausibility.py --rank-threshold 15
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ACT = ROOT / "legal-dataset" / "acts" / "consumer-protection-act-2019"
V1 = ACT / "final" / "v1-statute.jsonl"
QA = ROOT / "RAG" / "eval" / "qa-full.json"
REPORT = ROOT / "RAG" / "eval" / "anchor-plausibility.md"

# Function words only. Domain words are deliberately NOT filtered: "consumer",
# "person", "goods", "complaint" and friends are the most discriminative tokens
# in a statute about consumers, and IDF already down-weights whatever is
# ubiquitous. An earlier version stoplisted them and buried correct anchors —
# b037 ("Does every person who uses someone else's product become a consumer?")
# ranked 113th with almost every content word thrown away.
STOP = {
    "the", "and", "for", "are", "any", "such", "that", "this", "with", "under",
    "shall", "may", "not", "but", "his", "her", "its", "from", "have", "has",
    "been", "was", "were", "will", "would", "can", "could", "which", "who",
    "whom", "what", "when", "where", "how", "why", "does", "did", "other",
    "otherwise", "same", "than", "there", "them", "then", "they", "their",
    "these", "those", "into", "also", "being", "upon", "said", "one", "two",
}
ROMAN = ["", "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x",
         "xi", "xii", "xiii", "xiv", "xv"]


def tokens(text: str) -> list[str]:
    return [w for w in re.findall(r"[a-z]{3,}", text.lower()) if w not in STOP]


def load_nodes() -> dict[str, str]:
    """anchor-form key -> official_text, e.g. 'S2-9' and 'S36'.

    Section-level aggregates are added for every section, because a section-level
    anchor like `S36` has no bare node of its own — s.36 exists only as S36-1,
    S36-2, ... so resolving `S36` needs the union of its subsections."""
    nodes: dict[str, list[str]] = defaultdict(list)
    sections: dict[str, list[str]] = defaultdict(list)
    with V1.open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            sec = str(row.get("section_number") or "").strip()
            sub = str(row.get("subsection_number") or "").strip().strip("()")
            text = (row.get("official_text") or "").strip()
            if not sec or not text:
                continue
            nodes[f"S{sec}-{sub}" if sub else f"S{sec}"].append(text)
            sections[f"S{sec}"].append(text)
    merged = {k: " ".join(v) for k, v in nodes.items()}
    for key, texts in sections.items():
        merged.setdefault(key, " ".join(texts))
    return merged


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rank-threshold", type=int, default=10,
                    help="flag anchors ranking worse than this (default 10)")
    args = ap.parse_args()

    for path in (V1, QA):
        if not path.exists():
            sys.exit(f"missing {path}")

    nodes = load_nodes()
    rows = json.loads(QA.read_text(encoding="utf-8"))

    # IDF over statute nodes.
    doc_tokens = {k: tokens(v) for k, v in nodes.items()}
    df: Counter[str] = Counter()
    for toks in doc_tokens.values():
        df.update(set(toks))
    total = len(doc_tokens)
    idf = {w: math.log(total / c) for w, c in df.items()}
    norms = {k: math.sqrt(len(set(t))) or 1.0 for k, t in doc_tokens.items()}
    doc_sets = {k: set(t) for k, t in doc_tokens.items()}

    def rank_nodes(question: str) -> list[tuple[str, float]]:
        q = set(tokens(question))
        scored = [
            (key, sum(idf.get(w, 0.0) for w in q & doc_sets[key]) / norms[key])
            for key in doc_sets
        ]
        return sorted(scored, key=lambda kv: -kv[1])

    unresolvable: list[dict] = []
    clause_issues: list[dict] = []
    suspicious: list[dict] = []

    for row in rows:
        anchor = str(row.get("anchor") or "")
        question = row.get("question") or ""
        parts = anchor.split("-")
        base = "-".join(parts[:2]) if len(parts) >= 2 else anchor
        clause = parts[2] if len(parts) >= 3 else None

        target = anchor if anchor in nodes else (base if base in nodes else None)
        if target is None:
            single = parts[0]
            target = single if single in nodes else None
        if target is None:
            unresolvable.append({"id": row.get("id"), "anchor": anchor, "question": question})
            continue

        if clause is not None:
            roman = ROMAN[int(clause)] if clause.isdigit() and int(clause) < len(ROMAN) else clause
            present = f"({roman})" in nodes[target]
            clause_issues.append({
                "id": row.get("id"),
                "anchor": anchor,
                "node": target,
                "clause": f"({roman})",
                "text_present": present,
            })

        ranked = rank_nodes(question)
        position = next((i + 1 for i, (k, _) in enumerate(ranked) if k == target), None)
        if position is None or position > args.rank_threshold:
            suspicious.append({
                "id": row.get("id"),
                "category": row.get("category"),
                "anchor": anchor,
                "node": target,
                "rank": position,
                "question": question,
                "top": [k for k, _ in ranked[:3]],
            })

    lines = [
        "# Anchor plausibility — RAG/eval/qa-full.json",
        "",
        f"Statute nodes indexed: **{len(nodes)}** from `v1-statute.jsonl`. "
        f"Questions checked: **{len(rows)}**.",
        "",
        "This complements `anchor-audit.md`. It proposes no replacements — it only "
        "flags anchors the corpus cannot represent, and anchors that look lexically "
        "unrelated to their question.",
        "",
        "| check | count |",
        "| --- | --- |",
        f"| anchor resolves to no statute node | {len(unresolvable)} |",
        f"| clause-level anchor (no clause nodes exist) | {len(clause_issues)} |",
        f"| anchor ranks worse than {args.rank_threshold} lexically | {len(suspicious)} |",
    ]

    if clause_issues:
        missing_text = [c for c in clause_issues if not c["text_present"]]
        lines += [
            "",
            f"## Clause-level anchors ({len(clause_issues)})",
            "",
            "`v1-statute.jsonl` contains **no clause-level nodes** — the smallest unit "
            "is the subsection. Every anchor below therefore asks for a citation "
            "granularity the retriever cannot return; the closest retrievable unit is "
            "the parent node. Where `clause text present` is yes, the clause wording "
            "*is* inside the parent node, so the fix is to have the answer cite the "
            "clause it quotes rather than to split the statute (which would break the "
            "`official_text` checksums and acceptance gate G2).",
            "",
            f"Clause wording missing from the parent node entirely: **{len(missing_text)}**"
            + (f" ({', '.join(c['id'] for c in missing_text)})" if missing_text else ""),
            "",
            "| id | anchor | parent node | clause | clause text present |",
            "| --- | --- | --- | --- | --- |",
        ]
        for c in clause_issues:
            lines.append(
                f"| {c['id']} | `{c['anchor']}` | `{c['node']}` | {c['clause']} | "
                f"{'yes' if c['text_present'] else '**NO**'} |"
            )

    if unresolvable:
        lines += [
            "",
            f"## Anchors resolving to no statute node ({len(unresolvable)})",
            "",
            "| id | anchor | question |",
            "| --- | --- | --- |",
        ]
        for u in unresolvable:
            q = (u["question"] or "").replace("|", "\\|")[:90]
            lines.append(f"| {u['id']} | `{u['anchor']}` | {q} |")

    if suspicious:
        lines += [
            "",
            f"## Lexically weak anchors ({len(suspicious)})",
            "",
            "Ranked by IDF-weighted overlap between the question and each statute node. "
            "A weak rank is a smell, not a verdict — scenario questions describe facts "
            "in everyday words the statute never uses, so they rank low legitimately. "
            "Read these before trusting the category-level scores they feed.",
            "",
            "| id | cat | anchor | rank | top lexical matches | question |",
            "| --- | --- | --- | --- | --- | --- |",
        ]
        for s in sorted(suspicious, key=lambda x: (x["rank"] is not None, x["rank"] or 0), reverse=True):
            q = (s["question"] or "").replace("|", "\\|")
            q = q if len(q) <= 80 else q[:77] + "..."
            lines.append(
                f"| {s['id']} | {s['category']} | `{s['anchor']}` | "
                f"{s['rank'] if s['rank'] is not None else 'n/a'} | "
                f"{', '.join('`'+t+'`' for t in s['top'])} | {q} |"
            )

    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"statute nodes      : {len(nodes)}")
    print(f"unresolvable       : {len(unresolvable)}")
    print(f"clause-level anchors: {len(clause_issues)}"
          + (f" ({sum(1 for c in clause_issues if not c['text_present'])} with clause text absent)"
             if clause_issues else ""))
    print(f"lexically weak     : {len(suspicious)} (threshold {args.rank_threshold})")
    print(f"report -> {REPORT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
