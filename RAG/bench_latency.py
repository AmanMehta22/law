"""Measure /query latency against a running RAG server.

Prerequisite: start the server in another terminal first, e.g.

    uv run uvicorn src.api:app          # http://localhost:8000

Then, in a second terminal:

    uv run python bench_latency.py
    uv run python bench_latency.py --n 40 --url http://localhost:8000

What to look for
----------------
* "first call after startup" should NOT show a multi-second cold spike.
  The server now warms the BM25 index and the embedding model at startup
  (see src/api.py lifespan -> retriever.warm()), so the first real user
  query already pays a warm price.
* median / p95 are the steady-state numbers that matter in production.

Uses only the standard library, so no extra dependencies are needed.
"""

import argparse
import json
import statistics
import time
import urllib.request

# A spread of query shapes: definition, fact-pattern, procedure, remedy,
# limitation. Rotated through so no single Chroma cache path dominates.
QUERIES = [
    "who is a consumer and what are my rights",
    "the shopkeeper sold me a defective phone and refuses to refund",
    "how do I file a consumer complaint and where do I file it",
    "what compensation can I claim for a deficient service",
    "is there a time limit to file a consumer complaint",
]


def one_call(url: str, query: str, top_k: int = 5) -> float:
    """POST one /query and return the round-trip time in milliseconds."""
    body = json.dumps({"query": query, "top_k": top_k}).encode("utf-8")
    req = urllib.request.Request(
        url + "/query",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    start = time.perf_counter()
    with urllib.request.urlopen(req) as resp:
        resp.read()
    return (time.perf_counter() - start) * 1000.0


def percentile(sorted_samples, pct: float) -> float:
    if not sorted_samples:
        return 0.0
    idx = max(0, min(len(sorted_samples) - 1, round(pct * len(sorted_samples)) - 1))
    return sorted_samples[idx]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://localhost:8000")
    parser.add_argument("--n", type=int, default=25, help="number of warm calls")
    args = parser.parse_args()

    url = args.url.rstrip("/")

    first = one_call(url, QUERIES[0])
    print(f"first call after startup : {first:7.1f} ms")

    samples = []
    for i in range(args.n):
        samples.append(one_call(url, QUERIES[i % len(QUERIES)]))

    samples.sort()
    print(f"warm calls (n={len(samples)}):")
    print(f"  min    : {samples[0]:7.1f} ms")
    print(f"  median : {statistics.median(samples):7.1f} ms")
    print(f"  p95    : {percentile(samples, 0.95):7.1f} ms")
    print(f"  max    : {samples[-1]:7.1f} ms")


if __name__ == "__main__":
    main()
