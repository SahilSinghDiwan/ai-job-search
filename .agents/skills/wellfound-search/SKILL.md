---
name: wellfound-search
version: 1.0.0
description: >
  Use this skill to browse Wellfound (formerly AngelList Talent) for startup
  engineering roles — AI/GenAI, machine learning, backend, data, full-stack —
  in Bengaluru/Bangalore, elsewhere in India, and on its global remote board.
  Wellfound is the rare board that publishes real salary ranges (₹ and $) and
  exact posting dates, so reach for it whenever the question involves
  compensation. Trigger phrases: Wellfound, AngelList, angel list jobs,
  startup jobs, startup salary, jobs with salary, equity, AI startup jobs
  Bangalore, funded startup jobs India, remote startup jobs, YC-style startup
  roles, salary transparent job board.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/wellfound-search/cli/src/cli.ts *)
---

# Wellfound Search Skill

Browse **Wellfound** (formerly AngelList Talent) startup job listings from its
public, server-rendered role/location pages. No authentication, no API key,
**zero runtime dependencies** — it runs with just `bun`.

## Why this portal earns its place

**It publishes pay.** Measured live on 2026-08-25 across
`/role/l/ai-engineer/bangalore` pages 1-3: **61 of 109 listings (56.0%) carried a
real compensation range** — `₹30L – ₹47L • 0.02% – 0.05%`, `₹20L – ₹30L • No
equity`, `$112k – $140k`. Naukri published salary on 0 of 20 cards. For a search
anchored on a fixed-pay band, a source that states the number up front is
disproportionately valuable, so this CLI treats salary as a first-class field:
amount, currency, and whether equity was mentioned are parsed into structured
fields, not left in a display string.

**Its dates are exact.** The page renders "7 days ago", but the underlying data
carries a Unix epoch. Every result gets a real ISO timestamp and a true `ageDays`
— not a floor, not an estimate. `/rank` can sort on it directly.

**The volume is there.** 225 AI-engineer jobs for Bengaluru, 250 data-engineer,
190 software-engineer. (An earlier research note called Wellfound "thin for
Bengaluru" — that was a bad location slug silently widening the query. See
"The slug trap" below.)

## Access posture — read this before changing anything

`wellfound.com/robots.txt` is **recorded verbatim in `url-reference.md`** as fetched
on 2026-08-25. Summary:

- It **names no AI bot** — no ClaudeBot, GPTBot, CCBot rule anywhere. Different
  posture from Naukri, Foundit and RemoteOK, all excluded from this repo for
  naming Claude explicitly.
- It **disallows `/search`**, the `?jobId=` / `?jobSlug=` / `?role=` / `?preview=`
  / `?inFrame=` / `?after_sign_in=` query patterns, `/re/`, `/u/`, `/projects/`,
  `/auth/`, `/recruit/dashboard`, `/jobs/applications`, `/jobs/signup` and others.
- It **permits** the static browse pages this skill uses: `/role/{slug}`,
  `/role/l/{slug}/{location}`, `/role/r/{slug}`, `/jobs/{id}-{slug}`, and `?page=`.

**This is enforced in code, not just documented.** `assertRobotsAllowed()` checks
every URL before it is requested and raises `ROBOTS_DISALLOWED` on a violation;
`tests/robots.test.ts` locks the rule set down so a future edit cannot quietly
reintroduce a blocked path.

**If Wellfound's posture changes** — an AI-bot rule appears, or `/role/` gets
disallowed — stop using the skill and report it. Do not spoof a user agent, do not
solve a challenge, do not proxy around a block. If a response ever comes back
without its embedded data, the CLI raises `NO_EMBEDDED_DATA` telling you to report
the skill as broken. That is the intended behaviour, not a bug to fix.

## ⚠️ Personal use only

Keep volume low, don't use it commercially or for bulk collection, run it on your
own responsibility. One request per command, human-paced. No sweeping — paginate
deliberately with `--page`.

## The one big functional difference: no free-text search

Wellfound's keyword search **is** `/search`, which robots.txt disallows. So this
skill browses **role slugs** instead. `-q` slugifies your text onto one of the
site's role paths (`"LLM Engineer"` → `ai-engineer`, `"ML Engineer"` →
`machine-learning-engineer`), and common phrasings are aliased.

Run `roles` to see the verified set with measured Bengaluru volume:

```
data-engineer 250 · ai-engineer 225 · software-engineer 190 · backend-engineer 164
full-stack-engineer 82 · devops-engineer 43 · machine-learning-engineer 33 · data-scientist 12
```

You cannot narrow to "RAG" or "LangChain" on the portal side. Browse the role, then
filter the returned titles/descriptions yourself.

## The slug trap (why an earlier research pass got this wrong)

An unrecognised role or location slug **does not 404**. Wellfound answers `303 See
Other` pointing at the *unfiltered* role page, which returns 200 with plenty of real
listings — for the wrong query.

```
/role/l/ai-engineer/bangalore-india  →  303  →  /role/ai-engineer   (global, US-heavy)
/role/l/ai-engineer/bangalore        →  200      225 Bengaluru jobs
```

Follow that redirect and a "Bengaluru" search comes back full of San Francisco jobs
that look entirely legitimate. This is almost certainly what made
`portal-research.md` call Bengaluru volume "thin".

The CLI refuses to follow it: any 3xx becomes a `SLUG_NOT_RECOGNISED` error quoting
the `Location` header, and the parser independently re-checks that the page served
matches the page asked for. `bengaluru`, `bangalore-india`, `bengaluru-india`,
`blr`, `gurugram` and `bombay` are aliased onto slugs that work.

## Remote eligibility: FLAG and FAIL are kept separate

Wellfound's remote board is heavily geo-gated — of 13 listings on
`/role/r/ai-engineer` page 1: United States ×3, France ×2, Pakistan, San Francisco,
Chicago, India ×1, rest untagged.

Per `.claude/skills/job-application-assistant/04-job-evaluation.md`:

> a geography tag alone is a FLAG. Only a stated requirement that India cannot
> satisfy is a FAIL.

The CLI keeps those in **two separate fields** and never collapses them:

| Field | What it is |
|---|---|
| `eligibility.tagVerdict` | Derived **only** from structured geography tags. Type union is `PASS \| FLAG \| FLAG_UNVERIFIED \| NOT_REMOTE` — **there is no `FAIL` member**. A US-only tag is `FLAG`. Remote-but-silent is `FLAG_UNVERIFIED`. |
| `eligibility.statedRequirements` | Verbatim quotes of residency / work-authorization / citizenship clauses found in the description, each with a `kind`. These are FAIL **candidates** for you to judge against the table in `04-job-evaluation.md`. |

**An empty `statedRequirements` array is not a pass.** No real capture on 2026-08-25
carried a prose residency line — Wellfound puts the gate in the structured field
instead. Empty means "no pattern matched", nothing more.

The CLI extracts and quotes. It does not issue the verdict.

## Commands

### Search

```bash
bun run .agents/skills/wellfound-search/cli/src/cli.ts search [flags]
```

| Flag | Meaning |
|---|---|
| `-q, --query <role>` | Role, slugified onto a Wellfound role path. Default `ai-engineer`. **Not keyword search** — see above |
| `-l, --location <city>` | City slug, e.g. `bangalore`. `bengaluru` aliased. Mutually exclusive with `--remote` |
| `--remote` | Browse the remote board (`/role/r/<slug>`) instead. Wellfound has no remote+location path, so combining the two is refused rather than silently reconciled |
| `--page <n>` | 1-indexed. 20 companies/page (jobs per page varies, 33-41 observed) |
| `-n, --limit <n>` | Cap results emitted (client-side) |
| `--jobage <days>` | Keep postings ≤ N days old. Client-side — Wellfound's browse pages take no recency parameter — but dates are exact, so this is a true filter |
| `--has-salary` | Keep only postings that publish compensation |
| `--format json\|table\|plain` | Default `json` |

### Detail

```bash
bun run .agents/skills/wellfound-search/cli/src/cli.ts detail <id-slug|url> [--format json|plain]
```

Adds what the browse card omits: **machine-readable currency and pay period** from
schema.org (`INR`, `unitText: "YEAR"`), months of experience required, industry,
benefits, and the full description as clean text.

**Pass the `id-slug` pair or the full URL**, not a bare id — Wellfound's job URLs
need the title slug and `/jobs/4377358` alone 404s. Search results carry the full
`url`, so use that. A bare id raises `SLUG_REQUIRED` with that explanation.

### Roles

```bash
bun run .agents/skills/wellfound-search/cli/src/cli.ts roles
```

Verified role slugs with their measured Bengaluru volume.

## Usage examples

```bash
CLI=.agents/skills/wellfound-search/cli/src/cli.ts

# AI engineer roles in Bengaluru, newest first page, human-readable
bun run $CLI search -q ai-engineer -l bangalore --limit 15 --format table

# Only roles that state pay, posted in the last month — the highest-signal query
bun run $CLI search -q ai-engineer -l bangalore --has-salary --jobage 30 --format table

# Go deeper into the 225
bun run $CLI search -q ai-engineer -l bangalore --page 2 --format json

# ML-engineer roles anywhere in India
bun run $CLI search -q machine-learning-engineer -l india --format table

# The global remote board — read the ELIG column, most are geo-gated
bun run $CLI search -q ai-engineer --remote --jobage 14 --format table

# Backend roles in Bengaluru with pay, as JSON for /rank
bun run $CLI search -q backend-engineer -l bangalore --has-salary --format json

# Full posting: currency, period, experience, description
bun run $CLI detail 3534689-senior-agentic-ai-engineer

# What slugs actually work
bun run $CLI roles
```

## Output

`search --format json` emits `{ "meta": ..., "results": [...] }`.

`meta` carries `count`, `page`, `pageCount`, `perPage`, `totalJobCount`,
`totalStartupCount`, `roleSlug`, `locationSlug`, `remote`, `url`, a
`salaryCoverage` block (`withSalary` / `total` / `fraction`), a `postingDates`
precision statement, and `notes[]` recording every client-side filter applied.

Each result carries at least `id`, `title`, `company`, `location`, `date`, `url`
(present even when null, never omitted), plus:

| Field | Notes |
|---|---|
| `postedAt`, `datePrecision`, `ageDays` | `datePrecision` is `"exact"` — a real epoch, not a relative string |
| `salary` | `{ raw, min, max, currency, currencySource, period, equity }` |
| `salary.currencySource` | `"symbol"` on search (a bare `$` is assumed USD), `"jsonld"` on detail (authoritative) |
| `salary.period` | **Always `null` on search** — the card states no period. `₹10,000 – ₹20,000` on an intern posting is monthly; run `detail` to resolve it |
| `salary.equity` | `{ mentioned, offered, raw, minPercent, maxPercent }`. `"No equity"` is `mentioned: true, offered: false` — distinct from silence |
| `eligibility` | See the FLAG/FAIL section above |
| `badges` | `ACTIVELY_HIRING`, `RECENTLY_FUNDED`, `TOP_INVESTORS`, `GROWING_FAST`, … |
| `autoPosted`, `atsSource` | `autoPosted: true` = imported from the company's ATS |
| `companySlug`, `companySize`, `companyPitch` | |

`table` adds an `ELIG` column: `PASS` / `FLAG` / `FLAG?` (unverified) / `onsite`,
suffixed `!n` when `n` stated requirements were quoted.

All errors go to **stderr** as one line of `{ "error": "...", "code": "..." }` with
exit code `1`. Codes: `BAD_ARGS`, `BAD_JOB_REF`, `SLUG_REQUIRED`,
`SLUG_NOT_RECOGNISED`, `ROBOTS_DISALLOWED`, `NOT_FOUND`, `RATE_LIMITED`,
`UPSTREAM_ERROR`, `NETWORK_ERROR`, `NO_EMBEDDED_DATA`, `NO_JOB_POSTING_DATA`.

## Notes and limitations

- **No keyword search.** Role slugs only — `/search` is robots-disallowed.
- **No server-side recency filter.** `--jobage` is client-side over the fetched
  page. It is exact, but it narrows what you already fetched rather than asking for
  more; combine with `--page` to go deeper.
- **Jobs nest under companies**, so a page yields a variable job count (33, 35, 41
  observed on pages 1-3), not a fixed 20.
- **Counts drift** between requests — 225 then 229 minutes apart. Live index.
- **No application deadline** is published on either page type. Don't invent one.
- **Company names often carry trailing whitespace** in the portal data; the CLI
  trims them.
- **No `ego-browser` needed.** Browse pages are server-rendered and a plain fetch
  gets the full data. If that ever stops being true, the CLI reports
  `NO_EMBEDDED_DATA` rather than escalating to a browser — that call belongs to a
  human, since a browser pass is slow, brittle and untestable in CI.
- Not tracked: applicant counts, recruiter responsiveness, or the "actively hiring"
  freshness signal beyond the `badges` array.
