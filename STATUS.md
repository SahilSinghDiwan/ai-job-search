# Status — India market retarget

**Last updated:** 2026-08-25
**Branch:** `india-market-support` (8 commits ahead of `master`, clean tree, nothing pushed)
**Fork:** `SahilSinghDiwan/ai-job-search`, upstream `MadsLorentzen/ai-job-search`

**Running the repo day to day? Read [PLAYBOOK.md](PLAYBOOK.md) first** — pipeline
state, the command loop, CV rules, and Docker compile commands. This file is the
scraper/branch record.

Read this first when resuming. It records what changed, what is still open, and the
traps that cost time to find.

---

## What this branch did

The repo was an upstream framework built for the **Danish** job market. It is now
retargeted to **India (Bengaluru) plus global-remote**, and the job-source roster was
rebuilt around **signal quality rather than volume**.

```
f1cc0c6  feat(portals): add ats-search, wellfound-search and wwr-search
71f3a3c  feat(apply): add referral outreach as a fourth artifact
62857d1  chore(scraper): select portal roster on signal quality
d468b82  docs(scraper): research report on job-source signal quality
e9f586b  feat(naukri): add browser-driven Naukri search skill
9fad5f0  feat(instahyre): recover posting dates via browser enrichment
48ccd68  fix(evaluation): flag country-tagged remote roles instead of failing them
465c9b5  feat: retarget job-search framework to the Indian market
```

---

## Portal roster

Cadence and priority live in `.claude/skills/job-scraper/search-queries.md`; the
on/off switch is each skill's `enabled` frontmatter key. `/scrape` has no priority
field, which is why the two live in different places.

| Portal | State | Why |
|---|---|---|
| `ats-search` | ON | Greenhouse/Ashby/Lever — employer's own feed, no board layer |
| `wellfound-search` | ON | 56% of listings publish salary; exact dates |
| `wwr-search` | ON | Global-remote, per-listing eligibility verified |
| `linkedin-search` | ON — primary | Broad coverage, trustworthy dates |
| `freehire-search` | ON | ~50 ATS platforms aggregated |
| `instahyre-search` | ON — demoted | Every 2nd run; never expires listings |
| `naukri-search` | **OFF** | Bulk-poster slop, zero salaries; on-demand escape hatch |
| 4 Danish portals | **OFF** | Wrong market; kept installed for clean upstream merges |

Nothing was deleted. `enabled: false` keeps a portal installed and re-selectable.

---

## Traps worth remembering

These each cost real time to find. Do not re-derive them.

**Wellfound silently widens unknown slugs.** `/role/l/ai-engineer/bangalore-india`
does not 404 — it **303s to the unfiltered global page and returns 200**. That is what
produced the original "Wellfound is thin for Bengaluru" conclusion; the real slug is
`bangalore`, with 225 AI-engineer roles. The CLI now refuses the redirect and verifies
the page served matches the page requested.

**Never substring-match "India".** A live WWR listing enumerates 76 countries
including 🇮🇩 Indo**nesia** and 🇮🇴 British **Indian** Ocean Territory — and does not
include India. Match on flag code points or exact country name. There is a regression
test.

**Lever has two hosts with opposite postures.** `api.lever.co` is open;
`jobs.lever.co` names `ClaudeBot` with `Disallow: /`. Adding a `jobs.lever.co` fetch
is a policy regression, not an optimisation.

**Instahyre never expires listings.** One page of Bangalore LLM results held postings
11, 35, 53, 61, 182, 378 and **649 days old, rendered identically**. Its API exposes no
date at all — dates come from JSON-LD via opt-in browser enrichment over a shortlist.
An un-enriched Instahyre result is "date unknown", never "fresh".

**`-q "AI"` matched "chennai"** with plain substring matching. Query matching is now
left-anchored at a word boundary: "LLM" still finds "LLMs", "AI" no longer finds
"chennai".

**WWR's search term matches narrowly.** `"AI engineer"` → 24 results, `"LLM"` → 0,
`"machine learning"` → 0. That is WWR's genuine empty set, not a parse failure. Use
broad terms.

**Do not trust any board's location filter.** Himalayas' India filter returned ~20
results of which only 2 were actually India-eligible. Every remote skill re-parses the
per-listing eligibility line instead.

---

## Sources deliberately not built

| Source | Reason |
|---|---|
| Naukri (HTTP) | robots.txt names `Claude-User`/`claudebot` with `Disallow: /` on job paths. Browser skill exists instead, on Sahil's own login |
| RemoteOK, Foundit | Same explicit `ClaudeBot` disallow. RemoteOK's free API is tempting and still off-limits |
| Careerjet | robots.txt blocks the job-detail paths outright |
| Himalayas | robots.txt still open, but **every job-bearing path now serves a Cloudflare challenge** while the homepage does not. Evidence in `wwr-search/url-reference.md` |
| Getro/Consider VC boards (Accel, Blume, Peak XV, Lightspeed) | robots.txt is a plain-text request to use their paid API instead of scraping. Manual weekly browse recommended |
| Cutshort | Its public API is employer-side (searches candidates); useless for job-seeking |
| Otta | Defunct — folded into Welcome to the Jungle |
| SmartRecruiters | Works, but robots.txt blanket-disallows all but LinkedInBot. **Undecided — Sahil's call** |
| Zoho Recruit, Workable, Recruitee, ai-jobs.net | Permissive robots, but every guessed endpoint 404'd. Need real endpoint discovery before any build |

---

## Open work

1. **Browser-unlock pass** — Sahil asked to open these one at a time in `ego-browser`
   so he can log in manually: **Zoho Recruit** (SPA, his own pick), **Hirist/iimjobs**
   (JS-rendered, robots clean), **ai-jobs.net** (find the real endpoint),
   **Workable/Recruitee** (same), **Remotive** (Cloudflare wall). Not started — held
   because three build agents were mid-run and browser contention broke two earlier
   sessions.
2. **Naukri unverified anchors** — `sort`, `wfhType`, `ctcFilter`, pagination,
   applicant count, and detail-page anchors are marked NOT VERIFIED inline in its
   `url-reference.md`. Needs one uninterrupted round of ~5 page loads. `jobAge` and
   `experience` are verified working.
3. **SmartRecruiters decision** — build or drop (see table above).
4. **Nothing is pushed.** Branch is local only.

---

## Open decisions for Sahil

- **The `0`-in-current-CTC question.** `08-application-forms.md` recommends a
  three-step ladder for a mandatory numeric current-CTC field: find a text escape →
  enter `0` as a "not disclosed" marker → otherwise enter the true figure and
  neutralise the anchor verbally. The arguable step is `0`, which can trip a
  minimum-CTC filter and drop the application silently. Say the word to make step 3
  the default.
- **Current CTC is deliberately not stored** in `01-candidate-profile.md` or
  `CLAUDE.md`; the agent must ask. Change that if you would rather record it once.

---

## Verify the tree is healthy

```bash
uv run --with pyyaml python tools/lint_skills.py    # expect: OK (14 skills, 12 commands)
python3 tools/security_guards.py                    # expect: OK
python3 -m unittest discover -s tests -t .          # expect: 200 tests OK (skipped=5)
for d in ats wellfound wwr instahyre; do (cd .agents/skills/$d-search/cli && bun test); done
```

`python3 tools/lint_skills.py` fails on the system interpreter with
`requires PyYAML` — an environment gap, not a repo problem. Use the `uv run` form, or
install PyYAML into the conda env.

`tools/check_framework_version.py` is gated to the upstream repo in CI and does not
run on this fork, so unbumped `framework_version` keys on personalised profile files
will not fail the build.

---

## Try it

```bash
# Employer ATS feeds — 40 companies, real dates
bun run .agents/skills/ats-search/cli/src/cli.ts search -q "AI" --jobage 21 --format table

# Bengaluru roles that actually publish salary
bun run .agents/skills/wellfound-search/cli/src/cli.ts search -q ai-engineer -l bangalore --has-salary --jobage 14 --format table

# Are the 40 ATS slugs still alive?
bun run .agents/skills/ats-search/cli/src/cli.ts check --format table
```
