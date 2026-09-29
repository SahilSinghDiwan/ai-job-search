# Instahyre URL Reference

Public, unauthenticated JSON API used by this skill. This is the file to read when
Instahyre changes its API and the CLI breaks.

> **Personal use only** — keep volume low. The API rate-limits with HTTP 429.
>
> **API-only.** Instahyre's HTML pages (`https://www.instahyre.com/<slug>/`) return
> `403 Just a moment...` from Cloudflare. This skill deliberately never requests
> them. Do not "fix" a broken parser by adding an HTML fallback or any form of
> challenge handling — report the skill as broken instead.

## Search

```
GET https://www.instahyre.com/api/v1/job_search
```

Response is a django-tastypie style envelope: `{"meta": {...}, "objects": [...]}`.

### Parameters

| Param | Meaning | Example | How established |
|-------|---------|---------|-----------------|
| `job_type` | `1` full-time, `2` internship | `1` | Present in the site's own request; `meta.job_type_counts` confirms the split |
| `limit` | Page size | `35` | `meta.next` paginates in 35s |
| `offset` | Pagination offset | `0`, `35`, `70` | Echoed in `meta.offset` |
| `skills` | **Free-text keyword query** (matches title *and* skill tags) | `LLM` | Reversed by probe — see below |
| `job_functions` | Job-function facet id | `9` | Reversed by probe — `9` returns exactly the 1443 that `meta.top_job_functions_count` reports for "Data Science / Machine Learning" |

### How the parameter names were established

The site's JS bundle is unreachable (every HTML path is Cloudflare-challenged), so
the names were reversed by probing the API and watching `meta.total_count` move off
its unfiltered baseline of **13522**. A parameter the API does not recognize is
**silently ignored** and returns the baseline — there is no error, so "no change in
`total_count`" is the only available signal that a name is wrong.

Confirmed working:

| Probe | `total_count` | Verdict |
|-------|---------------|---------|
| *(baseline, no filter)* | 13522 | — |
| `skills=machine learning` | 3380 | **works** |
| `job_functions=9` | 1443 | **works** (matches the facet count exactly) |

Silently ignored (all returned the 13522 baseline): `keyword`, `q`, `query`,
`search`, `keywords`, `title`, `skill`, `text`, `search_string`, `min_experience`,
`max_experience`, `experience`, `company_size`, `posted`, `days`, `posted_on`,
`posted_within_days`, `recency`, `sort`, `sort_by`.

### No location parameter

**Every** candidate name was probed and silently ignored — all returned the 13522
baseline, never the 7181 that `meta.top_locations_count` reports for Bangalore:

`location`, `locations`, `city`, `loc`, `job_location`, `location_name`, `cities`,
`location_id`, `city_id`, `loc_id`, `location__in`, `locations__in`, `place`,
`work_location`, `job_city`, `based_in`, `job_locations` — tested with both string
values (`Bangalore`, `Bengaluru`, `bangalore`) and numeric ids (`1`, `2`, `3`).

The CLI therefore filters `--location` **client-side** against each result's
`locations` field (`matchesLocation` in `src/helpers.ts`). If a future maintainer
finds the real parameter, move the filter server-side and update
`meta.locationFilter` in `src/commands/search.ts`.

### No posting date and no recency filter

No date field appears anywhere in the search or detail payload, and no recency
parameter was found. `--jobage`/`--since` are documented as unsupported, the CLI
warns on stderr when they are passed, and every result's `date` is `null`. If
Instahyre ever adds a date field, wire it into `parseJobCard` and drop the warning
in `src/cli.ts`.

The date *is* published — but only on the HTML job page, which no HTTP client can
reach. See **Posting date (HTML page, browser only)** below.

## Posting date (HTML page, browser only)

**Where it lives:** a `<script type="application/ld+json">` block on the public job
page carrying a schema.org `JobPosting` object. The field is **`datePosted`**.

```
document.querySelector('script[type="application/ld+json"]')  // several on the page
  → JSON.parse(…) where obj['@type'] === 'JobPosting'
  → obj.datePosted
```

Exact extraction snippet (the one the enrichment pass runs, evaluated in-page):

```js
(() => {
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    let d; try { d = JSON.parse(s.textContent) } catch (e) { continue }
    for (const o of (Array.isArray(d) ? d : [d])) {
      if (o && o['@type'] === 'JobPosting') {
        return { datePosted: o.datePosted || null, validThrough: o.validThrough || null }
      }
    }
  }
  return { datePosted: null, noJobPostingLd: true }
})()
```

**Granularity: absolute ISO `YYYY-MM-DD`, no precision loss.** The site does *not*
render a relative "Posted 5 days ago" string — there is no posting date in the
visible page text at all (the only "posted" string on the page is the *"Job posted
by"* recruiter card, which names a person, not a date). The JSON-LD is the sole
anchor, and it gives a clean calendar date. Verified on 2026-08-25 against seven
live postings:

| Job id | `datePosted` | Age at verification |
|--------|--------------|---------------------|
| `344067` | `2024-11-14` | 649 d |
| `387381` | `2025-08-12` | 378 d |
| `413663` | `2026-02-24` | 182 d |
| `430593` | `2026-06-25` | 61 d |
| `431875` | `2026-07-03` | 53 d |
| `434667` | `2026-07-21` | 35 d |
| `438746` | `2026-08-14` | 11 d |

**`validThrough` was `null` on every posting checked** — Instahyre publishes a
posting date but not an expiry, so there is no application deadline to harvest here.

**The spread above is itself the finding.** Instahyre leaves listings up
indefinitely: a first page of "LLM Engineer, Bangalore" hits contained postings up
to 649 days old, presented identically to an 11-day-old one. Without enrichment
there is no way to tell those apart, which is exactly why the pass exists.

**Anonymous access is enough.** No Instahyre login is required to read the JSON-LD;
the pages verified above were read from a logged-out session (the page still shows
`LOGIN` / `SIGNUP` in its nav). A session that happens to be logged in works too,
and reads nothing extra that matters here.

**Cloudflare.** These pages return `403 Just a moment...` to plain HTTP clients,
which is why the enrichment pass uses a real browser (ego-browser) and why the CLI
itself still never requests HTML. This is not a workaround: nothing spoofs a
fingerprint, solves a challenge, or bypasses anything — a genuine browser simply
passes. If the site ever challenges the browser session too, **stop and report**;
do not route around it.

**Bonus observation (not wired up):** the same JSON-LD block also carries the full
`description` HTML that the API withholds (limitation 2). It is not currently
extracted — the enrichment pass reads dates only, to keep the browser pass small.

### Useful facet block (`meta`)

`meta` carries facet counts that are handy for discovering valid filter values:
`top_job_functions_count` (with ids), `top_locations_count`, `top_companies_count`,
`company_size_count`, `top_industry_types_count`, `job_type_counts`,
`job_experience_levels`, `max_experience`.

Observed `job_functions` ids: `1` Full-Stack Development, `9` Data Science / Machine
Learning, `10` Backend Development, `76` Other Software Development. The CLI's
`JOB_FUNCTIONS` map in `src/helpers.ts` mirrors these; unknown values pass through
verbatim so a raw numeric id always works.

## Detail

```
GET https://www.instahyre.com/api/v1/job_search/<id>
```

Returns a **single job object, identical in shape to a search result** — there is no
richer detail view and, in particular, **no job-description text**. Verified against
id `438118`: the detail payload and the corresponding search object have the same 14
keys. Returns `404` for an unknown id.

## Per-result field anchors

Each object in `objects[]`:

| Field | Contract field | Notes |
|-------|----------------|-------|
| `id` | `id` | Numeric; stringified by the CLI |
| `title` | `title` | Falls back to `candidate_title` |
| `employer.company_name` | `company` | Employer is a nested object |
| `employer.company_tagline` | `companyTagline` | One-line company blurb |
| `employer.employee_count` | `employeeCount` | Integer |
| `employer.instahyre_note` | *(unused)* | Longer company description |
| `locations` | `location` | **Comma-joined string**, e.g. `"Bangalore,Mumbai"` |
| `public_url` | `url` | Full public job URL; CLI falls back to `https://www.instahyre.com/job-<id>/` |
| `keywords` | `keywords` | Array of skill tags — the best available requirements signal |
| `resource_uri` | — | `/api/v1/job_search/<id>`; accepted by `detail` |
| *(none)* | `date` | **Always null** — the API exposes no posting date. Real dates come from the browser enrichment pass (see above) and are stored in `job_scraper/instahyre_posting_dates.md`, not in the API result |

Fields present but only meaningful for a logged-in candidate, and ignored by this
CLI: `interview_status`, `reviewed_at`, `is_strong_match`, `score`, `gender`,
`accept_outstation`.

## Posting-date table

The enrichment pass persists what it reads to
`job_scraper/instahyre_posting_dates.md` (Markdown, already covered by the repo's
`**/job_scraper/*.md` gitignore rule — personal job-search data, never committed).
Columns: `id`, `title`, `company`, `location`, `url`, `api_date`, `posted_date`,
`verified_at`, `source`. Written only by `cli.ts table upsert`, keyed on `id`, so
re-running enrichment updates rows rather than appending duplicates. Parser and
renderer live in `src/table.ts`.

## Fixtures

`cli/tests/fixtures/` holds real captured responses so CI never touches the portal:

- `search-genai.json` — `job_functions=9&skills=LLM&limit=35` (670 total matches)
- `detail-438118.json` — the detail payload for job `438118`

## Notes

- No authentication required.
- Rate limiting is real and quick to trigger; the CLI backs off on 429/5xx (max 6
  retries, 1s → 16s) and returns `null` on 404.
- `https://www.instahyre.com/api/v1/` and `/api/v1/job_search/schema/` both return
  `500` — there is no usable API discovery/schema endpoint.
