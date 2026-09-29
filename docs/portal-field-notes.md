# Portal field notes

Hard-won facts about the job sources this repo talks to. Each one cost real time to
find. Do not re-derive them, and do not "optimise" them away without re-checking the
evidence.

Companion documents: `.claude/skills/job-scraper/portal-research.md` (the original
signal-quality research pass, with the live API verifications) and each skill's own
`url-reference.md` (per-portal URL shapes and response anatomy).

---

## The roster this repo ships

`/scrape` discovers every portal skill under `.agents/skills/*/SKILL.md`. Each skill's
`enabled:` frontmatter key is its on/off switch; run order and cadence live in
`.claude/skills/job-scraper/search-queries.md`, because `/scrape` has no priority field.

| Portal | Default | Why |
|---|---|---|
| `ats-search` | ON | Greenhouse/Ashby/Lever — the employer's own feed, no board layer, real dates |
| `wellfound-search` | ON | Startups; a majority of listings publish salary, and dates are exact |
| `wwr-search` | ON | Global-remote, with per-listing eligibility actually verified |
| `linkedin-search` | ON — primary | Broadest coverage, trustworthy posting dates |
| `freehire-search` | ON | Aggregates ~50 ATS platforms; real `posted_at` |
| `instahyre-search` | ON — demoted | India tech/startup; every 2nd run (see the staleness trap) |
| `naukri-search` | **OFF** | India's largest index, but bulk-poster dominated and salary-free; an on-demand escape hatch. Its `SKILL.md` explains the call |

Changing the roster is a supported edit: flip `enabled:`, and update the roster table
in `search-queries.md` so the cadence note stays true.

---

## Traps

**Wellfound silently widens an unknown slug.** `/role/l/ai-engineer/bangalore-india`
does not 404 — it **303s to the unfiltered global page and returns 200**. That single
behaviour produced a false "Wellfound is thin for this city" conclusion; the working
slug was `bangalore`. The CLI now refuses the redirect and verifies that the page
served matches the page requested. Any new location-slug portal needs the same check.

**Never substring-match a country name.** One live WWR listing enumerates 76 countries
including 🇮🇩 Indo**nesia** and 🇮🇴 British **Indian** Ocean Territory — while *not*
including India. Match on flag code points or exact country names. There is a
regression test; keep it.

**Lever has two hosts with opposite postures.** `api.lever.co` is open;
`jobs.lever.co` names `ClaudeBot` with `Disallow: /`. Adding a `jobs.lever.co` fetch
is a policy regression, not an optimisation.

**Instahyre never expires listings.** One page of results held postings 11, 35, 53,
61, 182, 378 and **649 days old, rendered identically**. Its API exposes no date at
all; dates come from JSON-LD via opt-in browser enrichment over a shortlist. An
un-enriched Instahyre result is "date unknown", never "fresh" — and its result count
is never a volume signal.

**Left-anchor query matching.** With plain substring matching, `-q "AI"` matched
"chenn**ai**". Matching is now anchored at a word boundary: "LLM" still finds "LLMs",
"AI" no longer finds "chennai".

**WWR's search matches narrowly.** `"AI engineer"` → 24 results, `"LLM"` → 0,
`"machine learning"` → 0. That is WWR's genuine empty set, not a parse failure. Use
broad terms there.

**Do not trust any board's own location filter.** One board's India filter returned
~20 results of which 2 were actually India-eligible. Every remote skill re-parses the
per-listing eligibility line instead of believing the facet.

---

## Sources deliberately not built

Access policy, not capability. A working endpoint that a site's robots.txt closes to
Claude stays closed — see SECURITY.md.

| Source | Reason |
|---|---|
| Naukri over HTTP | robots.txt names `Claude-User`/`claudebot` with `Disallow: /` on job paths. The browser-driven skill exists instead, running on the user's own login |
| RemoteOK, Foundit | Same explicit `ClaudeBot` disallow. RemoteOK's free API is tempting and still off-limits |
| Careerjet | robots.txt blocks the job-detail paths outright |
| Himalayas | robots.txt is open, but every job-bearing path serves a Cloudflare challenge while the homepage does not |
| Getro / Consider VC boards (Accel, Blume, Peak XV, Lightspeed) | robots.txt is a plain-text request to use their paid API rather than scrape. A manual weekly browse is the honest substitute |
| Cutshort | Its public API is employer-side (it searches candidates); useless for job-seeking |
| Otta | Defunct — folded into Welcome to the Jungle |
| SmartRecruiters | Works and returns real dates, but robots.txt blanket-disallows everything except LinkedInBot. Left to the operator's judgement |
| Zoho Recruit, Workable, Recruitee, ai-jobs.net | Permissive robots, but every guessed endpoint 404'd. These need real endpoint discovery before any build — guessing an API shape and shipping it is the failure mode to avoid |

If you unlock one of these legitimately (an official API, an account you own, a
published feed), `/add-portal` will scaffold the skill.
