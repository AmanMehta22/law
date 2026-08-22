#!/usr/bin/env python3
"""
build_section_map.py — derive an authoritative section map from the source Gazette PDF.

The PDF at source/consumer-protection-act-2019.pdf is the arbiter for every
section-number question in this project. It has beaten the eval gold labels and
the review notes every time they disagreed, so anything that needs to know
"which section defines X" should consume this map rather than hard-coding.

Produces source/section-map.json:

    {
      "meta": {...},
      "definitions":      { "2(10)": "defect", ... },        # 47 clauses of s.2
      "definition_index": { "defect": "2(10)", ... },        # reverse, lowercased
      "sections":         [1, 2, ... 107],
      "subsections":      { "34": ["1","2"], ... }           # from v1-statute.jsonl
    }

Usage (from repo root):
    python legal-dataset/tools/build_section_map.py
    python legal-dataset/tools/build_section_map.py --check   # verify only, exit 1 on drift

Requires `pdftotext` (poppler-utils) on PATH.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

ACT_DIR = Path(__file__).resolve().parents[1] / "acts" / "consumer-protection-act-2019"
PDF = ACT_DIR / "source" / "consumer-protection-act-2019.pdf"
V1 = ACT_DIR / "final" / "v1-statute.jsonl"
OUT = ACT_DIR / "source" / "section-map.json"

TOTAL_SECTIONS = 107
TOTAL_DEFINITIONS = 47

# s.2 clause openers. The Act uses three different verbs, so one pattern is not
# enough: "means", "includes", and "in relation to X, means/includes".
DEF_STRICT = re.compile(
    r'\((\d{1,2})\)\s*["“”\']([^"“”\']{2,60})["“”\']\s*'
    r'(?:means|includes|in relation)',
    re.S,
)
DEF_LOOSE = re.compile(
    r'\((\d{1,2})\)\s*["“”\']([^"“”\']{2,60})["“”\']',
    re.S,
)


def extract_text(pdf: Path) -> str:
    """Plain (non-layout) extraction. Layout mode shifts section numbers off the
    line start for ~half the sections because of the marginal-note column, so
    plain mode is what reliably finds section boundaries."""
    try:
        return subprocess.run(
            ["pdftotext", str(pdf), "-"],
            capture_output=True,
            check=True,
            text=True,
            errors="replace",
        ).stdout
    except FileNotFoundError:
        sys.exit("pdftotext not found — install poppler-utils.")
    except subprocess.CalledProcessError as exc:
        sys.exit(f"pdftotext failed: {exc.stderr[:400]}")


def definitions_segment(raw: str) -> str:
    start = re.search(r"In this Act, unless the context otherwise requires", raw)
    if not start:
        sys.exit("could not locate the s.2 preamble in the PDF text")
    rest = raw[start.start():]
    end = re.search(r"CHAPTER\s+II\b", rest)
    if not end:
        sys.exit("could not locate CHAPTER II terminator for s.2")
    return rest[: end.start()]


def parse_definitions(seg: str) -> dict[int, str]:
    found: dict[int, str] = {}
    for pattern in (DEF_STRICT, DEF_LOOSE):
        for num, term in pattern.findall(seg):
            n = int(num)
            if 1 <= n <= TOTAL_DEFINITIONS and n not in found:
                found[n] = " ".join(term.split()).lower()
    return dict(sorted(found.items()))


def parse_sections(raw: str) -> list[int]:
    seen: list[int] = []
    for match in re.finditer(r"(?m)^\s*(\d{1,3})\.\s", raw):
        n = int(match.group(1))
        if 1 <= n <= TOTAL_SECTIONS and n not in seen:
            seen.append(n)
    return sorted(seen)


def parse_v1_subsections(path: Path) -> dict[str, list[str]]:
    """Read the explicit section_number/subsection_number fields, falling back to
    the `id`. Note the id's chapter prefix is NOT derivable from the section
    number (s.87 is CH6, s.90/91 are CH7, s.96 is CH8) — assuming otherwise is
    how an earlier review wrongly concluded four sections were missing. Any
    regex over ids must keep the chapter as a wildcard."""
    subs: dict[str, set[str]] = defaultdict(set)
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            sec = str(row.get("section_number") or "").strip()
            sub = str(row.get("subsection_number") or "").strip().strip("()")
            if not sec:
                match = re.match(r"CPA2019-CH\d+-S(\d+)(?:-(\d+))?$", row.get("id") or "")
                if not match:
                    continue
                sec, sub = match.group(1), match.group(2) or ""
            if not sec.isdigit():
                continue
            subs.setdefault(sec, set())
            if sub:
                subs[sec].add(sub)
    return {
        k: sorted(v, key=lambda s: (not s.isdigit(), int(s) if s.isdigit() else s))
        for k, v in sorted(subs.items(), key=lambda kv: int(kv[0]))
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="verify only; do not write")
    args = ap.parse_args()

    if not PDF.exists():
        sys.exit(f"source PDF not found at {PDF}")

    raw = extract_text(PDF)
    definitions = parse_definitions(definitions_segment(raw))
    sections = parse_sections(raw)
    subsections = parse_v1_subsections(V1)

    problems: list[str] = []

    if len(definitions) != TOTAL_DEFINITIONS:
        missing = [n for n in range(1, TOTAL_DEFINITIONS + 1) if n not in definitions]
        problems.append(f"parsed {len(definitions)}/{TOTAL_DEFINITIONS} definitions; missing {missing}")

    if len(sections) != TOTAL_SECTIONS:
        gaps = [n for n in range(1, TOTAL_SECTIONS + 1) if n not in sections]
        problems.append(f"parsed {len(sections)}/{TOTAL_SECTIONS} sections; gaps {gaps}")

    if subsections:
        absent = [n for n in range(1, TOTAL_SECTIONS + 1) if str(n) not in subsections]
        if absent:
            problems.append(f"sections in PDF but absent from v1-statute.jsonl: {absent}")

    reverse: dict[str, str] = {}
    collisions: list[str] = []
    for num, term in definitions.items():
        if term in reverse:
            collisions.append(term)
        reverse[term] = f"2({num})"
    if collisions:
        problems.append(f"duplicate defined terms: {collisions}")

    payload = {
        "meta": {
            "source_pdf": PDF.name,
            "act": "The Consumer Protection Act, 2019 (No. 35 of 2019)",
            "assented": "1919-08-09".replace("1919", "2019"),
            "total_sections": len(sections),
            "total_definitions": len(definitions),
            "note": (
                "Derived from the Gazette PDF, which is the project's arbiter for "
                "section numbering. Pecuniary limits in s.34/47/58 are the figures as "
                "enacted (one crore / one crore to ten crore / above ten crore). Each "
                "carries a proviso letting the Central Government prescribe some other "
                "value. A prescribed value is subordinate legislation, is not part of "
                "this Act, and is deliberately OUT OF SCOPE for this project - do not "
                "add one here from memory or from a secondary source."
            ),
        },
        "definitions": {f"2({n})": t for n, t in definitions.items()},
        "definition_index": reverse,
        "sections": sections,
        "subsections": subsections,
    }

    if problems:
        print("VALIDATION PROBLEMS:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)

    print(f"definitions : {len(definitions)}/{TOTAL_DEFINITIONS}")
    print(f"sections    : {len(sections)}/{TOTAL_SECTIONS}")
    print(f"v1 sections : {len(subsections)}")

    if args.check:
        return 1 if problems else 0

    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT}")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
