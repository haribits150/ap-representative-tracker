#!/usr/bin/env python3
"""Validate data/mps.json: every non-null metric value must carry a source URL.
Fails the build otherwise. Run: python3 scripts/validate.py"""
import json, sys

def metric_ok(m):
    if not isinstance(m, dict):
        return m is None  # raw null ok; raw values rejected (need source)
    v = m.get("value")
    if v is None:
        return True
    return bool(m.get("source") or m.get("source_url"))

def main():
    data = json.load(open("data/mps.json"))
    mps = data.get("mps", [])
    errors = []
    if len(mps) != 25:
        errors.append(f"expected 25 MP records, found {len(mps)}")
    for mp in mps:
        name = mp.get("name", "?")
        for group in ("legislative", "funds", "disclosure", "election"):
            g = mp.get(group) or {}
            for k, v in g.items():
                if k in ("sessions_covered", "period", "year", "data_period", "fy", "group_notes"):
                    continue
                if not metric_ok(v):
                    errors.append(f"{name}: {group}.{k} has value without source")
    if errors:
        print("VALIDATION FAILED:")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    print(f"OK: {len(mps)} records, all sourced.")

if __name__ == "__main__":
    main()
