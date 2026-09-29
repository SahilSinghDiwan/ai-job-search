# instahyre-cli

CLI for searching jobs on **Instahyre**, an India-focused tech and startup job platform
(Bangalore, Hyderabad, Pune, Gurgaon, Chennai, Mumbai, Delhi NCR, Work From Home).

**Data source**: Instahyre's public `job_search` JSON API (`/api/v1/job_search` and `/api/v1/job_search/<id>`).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **Personal use only.** Keep volume low, don't use it commercially or for bulk data
> collection, and run it on your own responsibility. The API rate-limits with HTTP 429;
> the client backs off rather than pushing through, and that behaviour must not be
> worked around.

> **API-only by design.** Instahyre's HTML pages sit behind a Cloudflare interstitial.
> This CLI never requests them. Do not add HTML fallbacks, challenge-solving, or
> user-agent evasion — if the API breaks, report the skill as broken.

## Installation

```bash
cd .agents/skills/instahyre-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings (all flags optional) |
| `detail` | Fetch a single posting's metadata and skill keywords |
| `table`  | Local posting-date table: `upsert` / `pending` / `list`. No network. |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.

## Two portal limitations

Both are properties of Instahyre's API, not of this CLI, and both are reported in
`--format json` output under `meta`:

1. **No posting date, no recency filter.** `--jobage` / `--since` are unsupported —
   passing either prints a stderr warning and does *not* filter. Every result's `date`
   is `null`. Real dates exist only on the HTML job page (schema.org JSON-LD
   `datePosted`) and are recovered by an **opt-in browser pass** over a shortlist —
   see the skill's SKILL.md. This CLI never requests HTML; it only stores what the
   browser read, via `table`.
2. **`detail` returns no job-description text.** The detail endpoint returns the same
   object as the search listing. Use the `keywords` array as the requirements signal
   and open `url` for the full posting.

## Flags

```
search
  --query, -q <text>      Keywords over titles and skill tags (API param: skills)
  --location, -l <text>   City filter — applied CLIENT-SIDE (the API has no location param)
  --function, -f <name>   machine-learning | data-science | backend | full-stack |
                          other-software, or a numeric facet id
  --job-type <n>          1 = full-time (default), 2 = internship
  --page <n>              1-indexed page (35 results/page)
  --limit, -n <n>         Cap results emitted (client-side)
  --format <fmt>          json (default) | table | plain

detail <id|url>
  --format <fmt>          json (default) | plain
```

## Examples

```bash
bun run src/cli.ts search -q "LLM" -f machine-learning -l Bangalore --limit 15 --format table
bun run src/cli.ts search -q "RAG" -l Remote --format table
bun run src/cli.ts search -q "Python" -f backend -l Hyderabad --format json
bun run src/cli.ts detail 437616 --format plain
```

## Output shape

```json
{
  "meta": {
    "count": 12, "page": 1, "pageSize": 35, "total": 670,
    "fetchedBeforeLocationFilter": 35, "locationFilter": "client-side",
    "recencyFilter": "unsupported", "postingDate": "unavailable"
  },
  "results": [
    { "id": "...", "title": "...", "company": "...", "location": "...",
      "date": null, "url": "...", "keywords": ["..."] }
  ]
}
```

Errors go to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.
Non-fatal warnings are stderr `warning: ...` lines and do not change the exit code.

## Tests

```bash
bun test
```

All tests run **offline** against checked-in fixtures in `tests/fixtures/` (real
responses captured from the live API) and stubbed `fetch`. Nothing in the suite
contacts Instahyre, so CI never hits the portal.
