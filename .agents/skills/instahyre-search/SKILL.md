---
name: instahyre-search
version: 1.1.0
description: >
  Use this skill to search Instahyre for tech and startup jobs in India —
  Bengaluru/Bangalore, Hyderabad, Pune, Gurgaon/Gurugram, Chennai, Mumbai,
  Delhi NCR, and Work From Home (remote) roles. Best for software, AI/ML,
  data, product, and engineering positions at Indian product companies and
  funded startups. Trigger phrases: Instahyre, India tech jobs, Bangalore
  jobs, Bengaluru jobs, startup jobs India, AI jobs India, naukri ke liye
  search, job dhundo, nokri, find jobs in India, IT jobs Bangalore.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/instahyre-search/cli/src/cli.ts *)
---

# Instahyre Search Skill

Search live job listings from **Instahyre**, an India-focused tech and startup job
platform, via its public `job_search` JSON API. No authentication, no API key, and
**zero runtime dependencies** — it runs with just `bun`.

Instahyre indexes roughly 13,500 open full-time tech roles at any time, heavily
weighted to Bangalore (~7,200), with Gurgaon, Hyderabad, and Work From Home next.
It is the strongest CLI-reachable source for Sahil's Bengaluru AI/GenAI search.

## ⚠️ Personal use only

This reads Instahyre's public API. Keep volume low, don't use it commercially or for
bulk data collection, and run it on your own responsibility. The API rate-limits
aggressively with HTTP 429 — the CLI backs off exponentially rather than pushing
through, and you should not work around that.

**The CLI is API-only by design.** Instahyre's HTML pages sit behind a Cloudflare
interstitial. This CLI never requests them and must not be "fixed" by adding HTML
fallbacks, challenge-solving, or user-agent evasion. If the API stops working, the
correct response is to report the skill as broken, not to route around the
protection.

Posting dates *are* read from those HTML pages, but by a **real browser**
(ego-browser), never by this CLI — see "Posting-date enrichment" below. A genuine
browser passes the interstitial on its own; nothing there spoofs a fingerprint or
solves a challenge, and if the browser session is ever challenged the pass stops
and reports rather than working around it.

## ⚠️ Two portal limitations you must know before relying on this

Both are properties of Instahyre's API, not bugs in this CLI. They are surfaced in
`--format json` output under `meta` so a caller can see them programmatically.

### 1. No posting date in the API, and no recency filter

The API returns **no posting date** on either the search or the detail payload, and
exposes **no recency parameter**. `--jobage` and `--since` are therefore *not
supported*: passing either prints a loud warning to stderr and does **not** filter.
Search JSON always reports `"recencyFilter": "unsupported"` and
`"postingDate": "unavailable"`, and every result's `date` field is `null`. Do not
pass `--jobage` to this portal, and never narrow an Instahyre *search* by date.

**Bulk API results are therefore still "date unknown."** But the date is not lost:
each posting's HTML page publishes it, and the opt-in enrichment pass below
recovers it for a shortlist. Postings you have enriched carry a real, exact date;
everything else does not. Keep the two straight — do not present an un-enriched
Instahyre result as recent.

This matters more here than on other portals: **Instahyre leaves listings up
indefinitely.** A single page of "LLM Engineer, Bangalore" results verified on
2026-08-25 held postings 11, 35, 53, 61, 182, 378 and **649** days old, rendered
identically. Recency on Instahyre is invisible until you enrich.

### 2. `detail` returns no job-description text

Instahyre's detail endpoint returns the same object as the search listing — richer
company context and the full skill-keyword list, but **no job description**. Use the
`keywords` array (typically 5-10 concrete skill tags) as the requirements signal, and
open the posting's `url` in a browser for the full text.

## When to use this skill

- Search Indian tech/startup job openings by skill keyword and city
- Narrow to a job function (machine learning, backend, full-stack)
- Pull the skill-keyword list and company context for a specific posting

## Commands

### Search job listings

```bash
bun run .agents/skills/instahyre-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search over titles and skill tags, e.g. `"LLM"`, `"RAG"`, `"Python"`. Maps to the API's `skills` parameter. Recommended.
- `--location <text>` / `-l <text>` — city filter, e.g. `"Bangalore"`, `"Remote"`. **Applied client-side** — the API has no location parameter (see `url-reference.md`). It narrows the fetched page rather than asking the server for more matches, so a narrow location combined with a small `--limit` can legitimately return fewer rows than the limit. Widen with `--page 2`, `--page 3` if you need more. `Bengaluru`/`Bangalore`, `Gurugram`/`Gurgaon`, and `Remote`/`Work From Home` are treated as equivalent.
- `--function <name>` / `-f <name>` — job-function facet: `machine-learning` (alias `data-science`, `ml`), `backend`, `full-stack`, `other-software`, or a numeric facet id.
- `--job-type <n>` — `1` full-time (default), `2` internship.
- `--page <n>` — page number (1-indexed, 35 results per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch a single posting

```bash
bun run .agents/skills/instahyre-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric job id from `search` results (e.g. `437616`). A full Instahyre
job URL or an `/api/v1/job_search/<id>` resource URI also works. Returns title,
company, tagline, headcount, location, and the skill-keyword list — but **no
description** (see limitation 2 above).

### Posting-date table

```bash
bun run .agents/skills/instahyre-search/cli/src/cli.ts table <upsert|pending|list> [flags]
```

Local, offline, no network at all. See "Posting-date enrichment" below for the
workflow; flags are `--json <json|-|@file>` (upsert), `--table <path>`,
`--stale-days <n>` (default 21), `--limit <n>`, `--format json|table|plain`,
`--today <YYYY-MM-DD>` (testing).

## Usage examples

```bash
# LLM roles in Bengaluru, machine-learning function
bun run .agents/skills/instahyre-search/cli/src/cli.ts search -q "LLM" -f machine-learning -l Bangalore --limit 15 --format table

# RAG / retrieval roles, fully remote
bun run .agents/skills/instahyre-search/cli/src/cli.ts search -q "RAG" -l Remote --format table

# Generative-AI roles anywhere in India, page 2
bun run .agents/skills/instahyre-search/cli/src/cli.ts search -q "Generative AI" --page 2 --format json

# Backend Python roles in Hyderabad
bun run .agents/skills/instahyre-search/cli/src/cli.ts search -q "Python" -f backend -l Hyderabad --format table

# Everything in the machine-learning function, first page
bun run .agents/skills/instahyre-search/cli/src/cli.ts search -f machine-learning -l Bangalore --format table

# Skill keywords and company context for one posting
bun run .agents/skills/instahyre-search/cli/src/cli.ts detail 437616 --format plain

# Seed the posting-date table from a search, then see what needs a browser read
bun run .agents/skills/instahyre-search/cli/src/cli.ts search -q "RAG" -l Bangalore --limit 5 --format json \
  | bun run .agents/skills/instahyre-search/cli/src/cli.ts table upsert --json -
bun run .agents/skills/instahyre-search/cli/src/cli.ts table pending --format table

# Review everything verified so far, newest posting first
bun run .agents/skills/instahyre-search/cli/src/cli.ts table list --format table
```

## Posting-date enrichment (opt-in — run it on a shortlist, never on a search)

Instahyre's API has no date field, but every public job page carries a schema.org
`JobPosting` JSON-LD block with **`datePosted`** — an absolute `YYYY-MM-DD`, not a
"5 days ago" string, so there is no precision to lose. The DOM anchor and the exact
extraction snippet are in `url-reference.md` under *Posting date (HTML page, browser
only)*.

**Why this is opt-in and not automatic.** One API request returns 35 dated-less
results instantly. One browser visit returns one date, slowly. Firing a browser
visit per search hit would turn a cheap search into dozens of page loads — exactly
the volume the personal-use posture rules out, and exactly what makes a portal
notice you. So: **bulk discovery stays on the API; date enrichment is a deliberate
second pass over a shortlist you have already narrowed** (typically 3-10 postings,
the ones you would actually consider applying to). Never enrich a whole search page.

### The three steps

```bash
CLI=.agents/skills/instahyre-search/cli/src/cli.ts

# 1. Discover on the API (fast, bulk, dateless) and seed the table.
#    `table upsert` accepts the search command's own JSON envelope directly.
bun run $CLI search -q "LLM" -f machine-learning -l Bangalore --limit 5 --format json \
  | bun run $CLI table upsert --json -

# 2. Ask the table what still needs a browser read.
#    Rows already verified inside --stale-days are skipped — the table exists so
#    the browser never re-visits what it already knows.
bun run $CLI table pending --limit 5 --format json

# 3. …run the browser pass (below), then write the dates back.
bun run $CLI table upsert --json '[{"id":"438746","posted_date":"2026-08-14"}]'
```

### Step 2.5: the browser pass

Run this from the **main context**, not from inside this skill's forked search
context — the frontmatter's `allowed-tools` deliberately keeps the fork API-only, so
the browser never fires as a side effect of a `/scrape` search. Invoke the
**`ego-browser`** skill and read its instructions. For each URL from
`table pending`, navigate and evaluate the JSON-LD snippet from `url-reference.md`
in-page:

```js
for (const job of worklist) {
  await gotoAndWait(job.url, { timeout: 40, settle: 2 })
  const r = await js(EXTRACT_JSONLD)          // snippet in url-reference.md
  out.push({ id: job.id, posted_date: r.datePosted, source: r.datePosted ? 'jsonld' : null })
  await wait(6)                                // human pacing — see below
}
```

Then feed `out` back through `table upsert --json @<file>`. `upsert` stamps
`verified_at` with today automatically for any row that carries a date, and merges
field-by-field, so re-running is idempotent: rows update, nothing duplicates, and a
later API re-seed never blanks a date the browser already verified.

### Rules for the browser pass — non-negotiable

- **Read-only.** Never apply, never message a recruiter, never edit the profile or
  job preferences, never touch account settings.
- **No credential handling.** The ego-browser task space inherits whatever session
  the user already has. Never type, store, or ask for a password. Anonymous access
  is sufficient — every date in `url-reference.md` was read logged-out.
- **Pace it like a human: ~5-8 s between page loads.** The API rate-limits hard
  enough that a previous run tripped a 429 at 0.7 s spacing and needed an 8 s
  backoff; treat the HTML side as at least that touchy. A shortlist of 5 should take
  about a minute, and that is fine.
- **No challenge handling.** No CAPTCHA solving, no fingerprint spoofing, no
  user-agent evasion. A real browser passes Cloudflare on its own. If the session
  *is* challenged — stop, report it, and do not work around it.
- **Never invent a date.** If a page has no `JobPosting` JSON-LD, record the row as
  still-unverified (`posted_date` stays `-`) rather than guessing. `validThrough`
  was absent on every posting checked, so **there is no application deadline to
  harvest** — do not manufacture one.

### The table

**Location:** `.agents/skills/instahyre-search/job_scraper/instahyre_posting_dates.md`

**Format: a Markdown table.** Chosen over CSV for one decisive reason and one
bonus. Decisive: this repo already gitignores `**/job_scraper/*.md` as personal
job-search data, so the file lands ignored under an existing rule — a CSV at any
path here would have needed a *new* `.gitignore` rule, and `tools/security_guards.py`
treats that file as a reviewed surface. Bonus: it renders when opened. Markdown's
usual cost — awkward programmatic updates — is paid once, in `src/table.ts`: nothing
hand-edits this file, `table upsert` rewrites it whole and keys on `id`.

| Column | Meaning |
|--------|---------|
| `id` | Instahyre numeric job id — the primary key |
| `title`, `company`, `location`, `url` | Seeded from the API search |
| `api_date` | What the API reported. Always `-` — the API has no date field. Kept so that a future API that *does* expose one is visibly distinct from a browser read |
| `posted_date` | `datePosted` from the page's JSON-LD, ISO `YYYY-MM-DD` |
| `verified_at` | When the browser read happened. **An old value means the row is stale, not wrong** — `table pending` re-lists it past `--stale-days` |
| `source` | How `posted_date` was obtained (`jsonld`) |

Empty cells are written as `-`. Pipes in titles are escaped (`\|`). Rows sort by
ascending id. `table list --format table` prints a computed `AGE` column;
`--format json` adds `age_days` per row.

**Feeding `/rank`.** `/rank` reads `posted_date` off `seen_jobs.json` entries, so
copy an enriched date there (`/scrape` Step 4 persists `posted_date`). A row in this
table with a real `posted_date` is what turns an Instahyre entry from
`age_basis: "first_seen"` (a floor) into an exact age.

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing ids to `detail`, reading the `meta` caveats |
| `table` | Quick human-readable scanning |
| `plain` | Reading one posting's company context and skill list (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the
process exits with code `1`. Non-fatal warnings (such as an unsupported `--jobage`)
are written to stderr as `warning: ...` lines and do not change the exit code.

## Notes

- Data source is Instahyre's public `job_search` API — no credentials required.
- Page size is fixed at 35 results per page (the API's own `next` link paginates in 35s).
- `locations` is a comma-joined string on the portal side (`"Bangalore,Mumbai"`), so a
  multi-city posting matches any of its cities.
- `--query` matches both job titles and skill tags, which is why `-q "LLM"` surfaces
  "Senior Data Scientist - LLM" as well as "LLM Engineer".
- The API rate-limits readily. Keep runs to a handful of pages; on a sustained 429 the
  CLI reports `rate limited; wait a few minutes and retry` rather than hammering.
- Job ids are numeric (e.g. `437616`) — pass them as-is to `detail`.
- `table` is the only stateful part of this skill and the only part that touches the
  filesystem. It makes no network requests whatsoever.
- **Still unsupported, and not fixable from here:** server-side recency filtering
  (`--jobage`/`--since` on `search`), job-description text from the API (`detail`
  returns skill keywords only), server-side location filtering, and application
  deadlines (`validThrough` is null on every posting checked — Instahyre publishes
  no expiry).
