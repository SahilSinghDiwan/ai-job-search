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
| *(none)* | `date` | **Always null** — the portal exposes no posting date |

Fields present but only meaningful for a logged-in candidate, and ignored by this
CLI: `interview_status`, `reviewed_at`, `is_strong_match`, `score`, `gender`,
`accept_outstation`.

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
