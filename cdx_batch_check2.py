#!/usr/bin/env python3
"""
Batch-check domains using the Wayback Machine sparkline API.

One request per domain returns precomputed yearly snapshot counts for all years
at once. Unlike the CDX API, this never times out on popular domains.

Results accumulate in OUTPUT_FILE (CSV). Each run merges new results into it,
so you can Ctrl-C and restart without losing progress.

Usage:
    python cdx_batch_check2.py [start] [stop]

    start  first domain index, 0-based (default: 0)
    stop   last domain index, exclusive (default: end of file)

Examples:
    python cdx_batch_check2.py              # process all domains
    python cdx_batch_check2.py 0 500        # first 500
    python cdx_batch_check2.py 500 1000     # next 500, merges with existing CSV
"""

import argparse
import csv
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

# ── Config ────────────────────────────────────────────────────────────────────
INPUT_FILE      = "top-1m-filtered.csv"
OUTPUT_FILE     = "cdx_by_year2.csv"
JS_FILE         = "data.js"
REQUEST_TIMEOUT = 20        # seconds per request
SLEEP_BETWEEN   = 5         # seconds between domain requests
YEARS           = list(range(1995, datetime.now().year + 1))
# ─────────────────────────────────────────────────────────────────────────────

SPARKLINE_URL = "https://web.archive.org/__wb/sparkline"
HEADERS = {
    "User-Agent": "webguessr-research/1.0",
    "Referer":    "https://web.archive.org/",   # required — returns 498 without it
}


# ── Network ───────────────────────────────────────────────────────────────────

def fetch_sparkline(domain: str) -> tuple[dict[int, int], str]:
    """Returns ({year: 2xx_snapshot_count}, error_note)."""
    params = urllib.parse.urlencode({"output": "json", "url": domain, "collection": "web"})
    req = urllib.request.Request(f"{SPARKLINE_URL}?{params}", headers=HEADERS)

    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
                data = json.load(resp)

            years_data  = data.get("years", {})
            status_data = data.get("status", {})

            result: dict[int, int] = {}
            for year_str, monthly_counts in years_data.items():
                monthly_status = status_data.get(year_str, "")
                total = sum(
                    count
                    for i, count in enumerate(monthly_counts)
                    if i < len(monthly_status) and monthly_status[i] == "2"
                )
                if total > 0:
                    result[int(year_str)] = total

            return result, ""

        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(5 * (attempt + 1))
                continue
            return {}, f"HTTP {e.code}"
        except TimeoutError:
            if attempt == 2:
                return {}, "timeout"
            time.sleep(2)
        except Exception as e:
            return {}, str(e)

    return {}, "unknown error"


# ── I/O ───────────────────────────────────────────────────────────────────────

def load_csv() -> dict[str, dict]:
    """Load existing CSV into a dict keyed by domain."""
    accumulated: dict[str, dict] = {}
    if not os.path.exists(OUTPUT_FILE):
        return accumulated
    with open(OUTPUT_FILE, newline="") as f:
        for row in csv.DictReader(f):
            years = {int(y): int(row[str(y)]) for y in YEARS if row.get(str(y), "")}
            accumulated[row["domain"]] = {
                "domain": row["domain"],
                "years":  years,
                "error":  row.get("error", ""),
            }
    return accumulated


def save_outputs(all_domains: list[str], accumulated: dict[str, dict]) -> None:
    """Write CSV and data.js from accumulated results, in original top-1m order."""
    ordered = [accumulated[d] for d in all_domains if d in accumulated]

    # CSV
    fieldnames = ["domain"] + [str(y) for y in YEARS] + ["error"]
    with open(OUTPUT_FILE, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in ordered:
            row = {"domain": r["domain"], "error": r.get("error", "")}
            for y in YEARS:
                row[str(y)] = r["years"].get(y, "")
            writer.writerow(row)

    # data.js — sparse index format
    sites = [r["domain"] for r in ordered]
    counts: dict[str, list[int]] = {}
    for y in YEARS:
        indices = [i for i, r in enumerate(ordered) if y in r["years"]]
        if indices:
            counts[str(y)] = indices

    with open(JS_FILE, "w") as f:
        f.write(f"const sites={json.dumps(sites, separators=(',', ':'))};")
        f.write(f"const counts={json.dumps(counts, separators=(',', ':'))};")

    csv_size = os.path.getsize(OUTPUT_FILE)
    js_size  = os.path.getsize(JS_FILE)
    print(f"Saved {OUTPUT_FILE} ({csv_size//1024} KB)  +  {JS_FILE} ({js_size//1024} KB)"
          f"  —  {len(ordered)} domains total")


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Batch-check Wayback coverage by year")
    parser.add_argument("start", type=int, nargs="?", default=0,
                        help="First domain index, 0-based (default: 0)")
    parser.add_argument("stop",  type=int, nargs="?", default=None,
                        help="Last domain index, exclusive (default: all)")
    args = parser.parse_args()

    with open(INPUT_FILE) as f:
        all_domains = [line.strip() for line in f if line.strip()]

    stop = args.stop if args.stop is not None else len(all_domains)
    fetch_domains = all_domains[args.start:stop]

    accumulated = load_csv()
    if accumulated:
        print(f"Loaded {len(accumulated)} existing results from {OUTPUT_FILE}")

    print(f"Fetching     : domains[{args.start}:{stop}]  ({len(fetch_domains)} domains)")
    print(f"Sleep        : {SLEEP_BETWEEN}s between requests\n")

    try:
        for i, domain in enumerate(fetch_domains):
            years, error = fetch_sparkline(domain)
            accumulated[domain] = {"domain": domain, "years": years, "error": error}

            found = sorted(years)
            if error:
                span = f"ERROR: {error}"
            elif found:
                total = sum(years.values())
                span = f"{found[0]}–{found[-1]}  ({len(found)} years, {total:,} snapshots)"
            else:
                span = "no snapshots found"
            print(f"[{args.start + i + 1:>4}/{len(all_domains)}] {domain:<45} {span}")

            if i < len(fetch_domains) - 1:
                time.sleep(SLEEP_BETWEEN)

    except KeyboardInterrupt:
        print(f"\nInterrupted — saving progress...")

    save_outputs(all_domains, accumulated)


if __name__ == "__main__":
    main()
