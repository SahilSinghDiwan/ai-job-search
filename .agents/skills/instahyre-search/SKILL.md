---
name: instahyre-search
version: 1.0.0
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

**API-only by design.** Instahyre's HTML pages sit behind a Cloudflare interstitial.
This CLI never requests them and must not be "fixed" by adding HTML fallbacks,
challenge-solving, or user-agent evasion. If the API stops working, the correct
response is to report the skill as broken, not to route around the protection.

## ⚠️ Two portal limitations you must know before relying on this

Both are properties of Instahyre's API, not bugs in this CLI. They are surfaced in
`--format json` output under `meta` so a caller can see them programmatically.

### 1. No posting date, and no recency filter

The API returns **no posting date** on either the search or the detail payload, and
exposes **no recency parameter**. `--jobage` and `--since` are therefore *not
supported*: passing either prints a loud warning to stderr and does **not** filter.
Search JSON always reports `"recencyFilter": "unsupported"` and
`"postingDate": "unavailable"`, and every result's `date` field is `null`.

This matters for `/scrape`'s 14-day window and for `/rank`'s posting-age urgency
signal: **treat every Instahyre result as "date unknown"** and lean on the other
portals for recency. Do not pass `--jobage` to this portal.

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
```

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
