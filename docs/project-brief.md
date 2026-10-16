# Project Brief: AP Representative Performance Tracker
### A USAFacts-inspired, nonpartisan public-data site for Andhra Pradesh
*Paste-ready brief to hand to Claude (or any AI builder). Written October 2026.*

---

## 1. Mission

Give every voter in Andhra Pradesh a single, sourced, nonpartisan page showing what their elected representative actually did in office — legislative record, public money handled, personal disclosures — plus how public money is being spent in their area. Inspiration: Steve Ballmer's USAFacts (standardized government data, every number cited, zero editorializing).

**The product promise:** any voter can answer "what did my MP/MLA do after I voted for them?" in under two minutes, on a phone, in Telugu or English.

## 2. Scope discipline (important)

- **Phase 1: 25 Lok Sabha MPs of Andhra Pradesh.** Parliamentary data is the cleanest available (see sources below). Ship this first.
- **Phase 2: 175 AP Assembly MLAs.** Assembly attendance/question data is patchier — treat as a separate data-collection project, not a copy-paste.
- **Explicitly out of scope for v1:** Rajya Sabha MPs, MLCs, local-body representatives, predictions, rankings ("best/worst MLA"), and any editorial content.

## 3. Public data sources (all free, no login)

| Category | Source | What you get | URL |
|---|---|---|---|
| Legislative record (MPs) | PRS Legislative Research | Attendance %, questions asked, debates participated, private member bills, per MP per session | prsindia.org |
| Local-area funds (MPs) | MPLADS portal | Fund entitlement vs. actual utilization per MP, works recommended/completed | mplads.nic.in |
| Candidate disclosures | ADR / MyNeta | Assets & liabilities, criminal cases, education, per candidate per election | myneta.info |
| Election results | Election Commission of India | Vote share, winning margin, turnout per constituency | eci.gov.in |
| State budget | AP Budget portal | Scheme-wise allocations and expenditure, department budgets | budget.ap.gov.in |
| State audits | CAG of India | Audit findings on AP departments and schemes | cag.gov.in |
| Assembly records (MLAs, phase 2) | AP Legislature | Questions, debates, attendance | aplegislature.org |
| District outcomes | Census of India | Literacy, demographics (district-level) | censusindia.gov.in |
| District outcomes | NFHS (via IIPS) | Health indicators: IMR, institutional delivery, stunting (district-level) | rchiips.org |
| District outcomes | UDISE+ | School enrollment, dropout, pupil-teacher ratio (district-level) | udiseplus.gov.in |
| District outcomes | NITI Aayog SDG Index | Composite development scores (district-level) | sdgindiaindex.niti.gov.in |
| Scheme outcomes | MGNREGA MIS, PMAY-G, Jal Jeevan Mission dashboards | Person-days, houses built, tap connections (district/block-level) | nrega.nic.in, pmayg.nic.in, ejalshakti.gov.in |
| Open datasets | data.gov.in / AP open data | Supplementary datasets as available | data.gov.in |

**Collection rule:** prefer official bulk downloads, published reports, and documented APIs. Where scraping is the only option, respect robots.txt and terms of use, rate-limit politely, and keep a log of exactly which page each figure came from.

## 4. Data schema — one representative, one record

Every representative gets a single JSON record. Suggested fields:

```
identity:        name, photo (official portrait only), constituency,
                 house (Lok Sabha / Assembly), party, term start/end
legislative:     attendance_pct, questions_asked, debates_participated,
                 private_member_bills, sessions_covered, source_urls[]
funds:           mplads_entitlement_inr, mplads_utilized_inr,
                 utilization_pct, works_recommended, works_completed,
                 source_urls[]
disclosure:      assets_current_inr, assets_at_last_election_inr,
                 asset_growth_pct, criminal_cases_declared,
                 education, source_urls[]        # ADR affidavit
election:        vote_share_pct, winning_margin_votes,
                 margin_pct, turnout_pct, election_year, source_urls[]
district_context: districts_overlapping[],      # constituency→district mapping
                 indicators: { literacy_pct, imr, institutional_delivery_pct,
                   dropout_rate, sdg_index_score, mgnrega_persondays,
                   pmay_houses_completed, jjm_tap_connections },
                 indicator_year, source_urls[]
meta:            last_verified_date, data_confidence_notes
```

**The mapping problem (design around it, don't hide it):** constituencies don't map 1:1 to districts, and most outcome data is district-level. Store the constituency→district overlap explicitly, show district context in a visually separate "Your area" panel, and never present a district outcome as the representative's achievement. Suggested disclaimer text: *"District figures describe the area, not the representative's personal record."*

## 5. The report card — what each profile page shows

1. **At a glance:** photo, name, constituency, party, term, and five headline numbers (attendance, questions, debates, MPLADS utilization, asset growth).
2. **In the House:** attendance vs. house average, questions asked (with topic breakdown if available), debates, bills introduced. Always show the state/national average beside the individual's number — context is what makes a number meaningful.
3. **Public money:** MPLADS entitlement vs. utilized, works completed; plus a plain-language explainer of what MPLADS is (most voters don't know MPs get ₹5 crore/year).
4. **Disclosures:** asset growth since last affidavit, criminal cases declared, education — presented factually, no adjectives.
5. **Their election:** vote share, margin, turnout — reminds voters how decisive (or narrow) the mandate was.
6. **Your area:** district-level outcome indicators with trend arrows where two time points exist.
7. **Sources:** every number links to its source. This section is the product's backbone, not a footnote.

**Site-wide views:** a state dashboard (totals: MPLADS utilization across AP, average attendance of AP MPs vs. national average, scheme spending vs. budget), and a compare view (any two representatives, same metrics, side by side).

## 6. Nonpartisan rules (hard requirements, non-negotiable)

1. Every number carries a source link and retrieval date. No exceptions.
2. No adjectives about people — "low attendance" is banned; "attendance 43% vs. house average 78%" is required.
3. Identical layout, metrics, and visual weight for every party. No leaderboards, no "top 10 / bottom 10."
4. A public methodology page explaining where each metric comes from and its limits.
5. Corrections policy: sourced corrections applied visibly with a changelog.

## 7. Design requirements

- **Mobile-first.** The audience is on phones, not desktops.
- **Telugu + English toggle**, full parity — not a summarized translation. This is the single biggest reach multiplier.
- Numbers in Indian formatting (₹1.2 cr, not ₹12,000,000).
- Fast and light: static-site generation from the JSON records is preferable to a heavy app; the data updates on a schedule, not in real time.
- Accessibility: readable contrast, large tap targets, works on low-end devices.

## 8. Refresh cadence

| Data | Refresh trigger |
|---|---|
| Legislative record | After each parliament/assembly session |
| MPLADS utilization | Annual (with provisional mid-year note) |
| Affidavits / disclosures | Each election |
| Election results | Each election |
| District outcome indicators | When source surveys release (NFHS, UDISE+, SDG index) |
| State budget figures | Each budget presentation |

Each record shows "last verified: <date>". Stale data displayed as fresh destroys trust faster than missing data.

## 9. Suggested build phases (paste these as sequential prompts)

**Prompt 1 — Source inventory:** "For each source in section 3, determine the exact pages, files, or endpoints holding the Phase 1 fields in section 4 for AP's 25 Lok Sabha MPs. Report back a table: field → source → exact location → format → access constraints. Flag anything you cannot locate."

**Prompt 2 — Schema & pipeline:** "Design the ETL pipeline that produces one JSON record per MP per the schema in section 4. Write the scrapers/parsers, the constituency→district mapping table, and a validation script that fails the build if any required field lacks a source URL. Run it for all 25 AP MPs."

**Prompt 3 — Frontend:** "Build the site per sections 5 and 7: representative profile pages, compare view, state dashboard, methodology page, sources section. Mobile-first, Telugu/English toggle with full parity, Indian number formatting, static generation from the JSON records."

**Prompt 4 — Trust hardening:** "Apply the nonpartisan rules in section 6 as automated checks: every rendered number must resolve to a source URL; add the district-context disclaimer; add 'last verified' dates; build the corrections changelog. Then audit the whole site against section 6 and report violations."

**Prompt 5 — Operations:** "Set up the refresh workflow from section 8: a checklist and scripts per data type so one person can update the site in a day. Document it."

## 10. Watchouts

- **Do not** present district outcomes as caused by the representative. Correlation is not the product; transparency is.
- **Do not** rank representatives. Comparison views are fine; verdicts are not.
- Election-adjacent timing (Model Code of Conduct periods) may restrict what a site like this can publish — check with a media-law professional before any election-season push.
- Keep the project unmonetized and volunteer-run; that keeps it clean legally and reputationally.
- Start collecting now even before the site is built — the dataset is the moat, not the design.
