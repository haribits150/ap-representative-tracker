# AP Representative Tracker

A nonpartisan, USAFacts-inspired civic-data site: performance metrics of Andhra Pradesh's elected representatives, from public data only — so voters can see what their representatives actually did once in power, and how public money is spent.

**Live site:** *(enable GitHub Pages → Settings → Pages → Source: GitHub Actions, then the URL appears here)*

## What's here

- `site/` — the static website (mobile-first, Telugu + English, zero build step)
- `data/mps.json` — the canonical dataset: one verified record per MP
- `data/schema.json` — the record schema
- `scripts/validate.py` — fails the build if any number lacks a source URL
- `docs/` — project brief and methodology

## Nonpartisan rules (non-negotiable)

1. Every number carries a source link. No exceptions.
2. No adjectives about people — only numbers with context.
3. Identical layout for every party. No leaderboards, no verdicts.
4. District figures describe the area, never the representative's record.

## Data status

Phase 1 (25 AP Lok Sabha MPs) is being collected from PRS Legislative Research, the MPLADS portal, ADR/MyNeta affidavits, and ECI 2024 results. Unverifiable fields stay `null` — never estimated.

## Refresh cadence

Legislative data after each parliament session · MPLADS annually · affidavits and results each election · district indicators when source surveys release.
