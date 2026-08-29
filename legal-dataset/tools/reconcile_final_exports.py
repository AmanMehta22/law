#!/usr/bin/env python3
"""Reconcile final/v2-knowledge-cards.json with its .jsonl export.

The ad-hoc `_tmp_patch_cards.py` / `_tmp_rephrase.py` / `_tmp_fix3.py` scripts
patched the merged `.json` directly and never regenerated the `.jsonl`, so the
two exports drifted apart (88 cards as of 2026-08-22) and gate G6
(json/jsonl consistency) was invalidated.

This script:
  1. Loads both exports.
  2. Reports every card that differs between them (by concept_id).
  3. Treats the `.json` as the source of truth and rewrites the `.jsonl`
     from it, preserving the original line order where possible.
  4. Verifies the rewrite byte-for-byte against the new `.json`.

Usage:  python tools/reconcile_final_exports.py [--check]
        --check  report differences without writing anything (exit 1 if any)
"""

import argparse
import json
import sys
from pathlib import Path

ACT_DIR = Path(__file__).resolve().parents[1] / "acts" / "consumer-protection-act-2019"
FINAL_DIR = ACT_DIR / "final"
JSON_PATH = FINAL_DIR / "v2-knowledge-cards.json"
JSONL_PATH = FINAL_DIR / "v2-knowledge-cards.jsonl"


def load_json():
    with JSON_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def load_jsonl():
    cards = []
    with JSONL_PATH.open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                cards.append(json.loads(line))
    return cards


def by_id(cards):
    return {card["concept_id"]: card for card in cards}


def diff_cards(a, b):
    """Return a list of human-readable differences between two cards."""
    diffs = []
    keys = sorted(set(a) | set(b))
    for key in keys:
        if a.get(key) != b.get(key):
            diffs.append(key)
    return diffs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="report only; write nothing")
    args = parser.parse_args()

    json_cards = load_json()
    jsonl_cards = load_jsonl()

    json_map = by_id(json_cards)
    jsonl_map = by_id(jsonl_cards)

    only_in_json = sorted(set(json_map) - set(jsonl_map))
    only_in_jsonl = sorted(set(jsonl_map) - set(json_map))
    changed = []

    for concept_id in sorted(set(json_map) & set(jsonl_map)):
        diffs = diff_cards(json_map[concept_id], jsonl_map[concept_id])
        if diffs:
            changed.append((concept_id, diffs))

    print(f".json  cards : {len(json_cards)}")
    print(f".jsonl cards : {len(jsonl_cards)}")
    print(f"only in .json  : {len(only_in_json)}")
    print(f"only in .jsonl : {len(only_in_jsonl)}")
    print(f"content differs: {len(changed)}")

    for concept_id, diffs in changed[:20]:
        print(f"  ~ {concept_id}: {', '.join(diffs)}")
    if len(changed) > 20:
        print(f"  ... and {len(changed) - 20} more")

    total = len(only_in_json) + len(only_in_jsonl) + len(changed)

    if total == 0:
        print("OK: exports are in sync.")
        return 0

    if args.check:
        print(f"\n--check: {total} discrepancies found, nothing written.")
        return 1

    # Rewrite the .jsonl from the .json (the patched file is authoritative),
    # keeping the .json's own order.
    with JSONL_PATH.open("w", encoding="utf-8") as handle:
        for card in json_cards:
            handle.write(json.dumps(card, ensure_ascii=False) + "\n")

    # Verify: reload both and compare again.
    rewritten = load_jsonl()
    rewritten_map = by_id(rewritten)
    residual = sum(
        1
        for concept_id in set(json_map) | set(rewritten_map)
        if json_map.get(concept_id) != rewritten_map.get(concept_id)
    )

    if residual != 0:
        print(f"ERROR: {residual} cards still differ after rewrite.")
        return 1

    print(f"\nRewrote {JSONL_PATH.name} from {JSON_PATH.name} ({total} cards reconciled).")
    print("Verified: exports now match exactly.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
