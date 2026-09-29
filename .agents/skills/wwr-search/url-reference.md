# We Work Remotely URL Reference

Public, unauthenticated HTML pages used by this skill. This is the file to read
when WWR changes its markup and the CLI breaks. Everything below was verified
live on **2026-08-25**.

## robots.txt as found (2026-08-25)

Fetched from `https://weworkremotely.com/robots.txt`, HTTP 200, verbatim:

```
# robots.txt for https://weworkremotely.com/

User-agent: *
Allow: /
Disallow: /admin/
Disallow: /account/
Disallow: /job-seekers/account/
Disallow: /job-seekers/profile/
Disallow: /manage-company/
Disallow: /*edit?token=/
Disallow: /*cancel?token=/
Sitemap: https://weworkremotely.com/sitemap.xml
```

Fully open. One `User-agent: *` group, `Allow: /`, and the only disallowed
paths are account/admin/profile surfaces and token-bearing edit links. **No
AI-bot rule of any kind** — no `ClaudeBot`, `Claude-User`, `GPTBot`, `CCBot`,
`Google-Extended`, and no `Content-Signal` directive. Both paths this CLI uses
(`/remote-jobs/search` and `/remote-jobs/<slug>`) are allowed.

No challenge, no interstitial: plain `curl` with a browser User-Agent returned
full HTML (174 KB for the search page). If that ever changes, `htmlFetch`
detects the Cloudflare "Just a moment…" body and aborts with a message telling
you to report the skill as blocked. Do not remove that check.

## Himalayas (checked the same day, NOT built)

`https://himalayas.app/robots.txt`, HTTP 200, is also fully open —
`User-Agent: *`, `Allow: /`, with `Disallow: /apply` and a family of
`Disallow: …?page=` pagination rules, and no AI-bot rule.

But the pages themselves are walled. Verified with a browser User-Agent, plain
GET, spaced 5-6 seconds apart:

| URL | Result |
|-----|--------|
| `https://himalayas.app/jobs?search=AI%20Engineer` | **403**, Cloudflare "Just a moment…" challenge |
| `https://himalayas.app/jobs` | **403**, same challenge |
| `https://himalayas.app/jobs/ai-engineer` | **403**, same challenge |
| `https://himalayas.app/companies/onepilot/jobs/kundenbetreuer-freelance` | **403**, same challenge |
| `https://himalayas.app` (homepage) | 200, real HTML |
| `https://himalayas.app/sitemap-jobs.xml.gz` | 200, real sitemap index |

Every job-bearing path is challenged. An interactive challenge is the operator
declining automated access regardless of what robots.txt permits, so the
Himalayas skill was dropped rather than worked around. Note also that even if
the challenge were lifted, robots.txt disallows `?page=` on `/jobs`, so
server-side pagination there would be off-limits.

## Search

```
GET https://weworkremotely.com/remote-jobs/search?term=<keywords>
```

Returns one HTML page containing the **entire** result set, grouped into
`<section class="jobs">` blocks by category. There is no pagination parameter
and no `page` link anywhere in the markup — hence client-side paging in the CLI.

### Parameters (read off the search form's own fields)

| Param | Meaning | Example | How established |
|-------|---------|---------|-----------------|
| `term` | Free-text keyword query | `AI engineer` | The visible search input's `name` |
| `country[]` | Repeatable ISO 3166-1 alpha-2 country filter | `country[]=IN` | `<select name="country[]" multiple>` with `<option value="IN">🇮🇳 India</option>` for every country |
| `salary_range[]` | Repeatable salary facet | `$100,000 or more USD` | `<select name="salary_range[]">`, five fixed bands: `$10,000 - $25,000 USD`, `$25,000 - $48,999 USD`, `$50,000 - $74,999 USD`, `$75,000 - $99,999 USD`, `$100,000 or more USD` |
| `skills[]` | Repeatable numeric skill-facet id | `523` | `<select name="skills[]">`; the id list is short and non-technical — not wired into the CLI |

**No recency parameter and no location parameter** exist beyond `country[]`.

**Spot-check of `country[]=IN`** (`term=AI&country[]=IN`): returned exactly one
listing, and that listing's own chips did include `🇮🇳 India`. So WWR's country
filter agreed with the per-listing text in this sample — unlike the Himalayas
finding that motivated the classifier. The CLI still re-verifies every listing
and reports disagreements, because one clean sample is not a guarantee.

**Query behaviour, verified:** `term=AI engineer` → 24 listings; `term=LLM` → 0;
`term=machine learning` → 0. The zeroes are WWR's own empty result set (the page
is served, it simply contains no `new-listing-container` elements), not a parse
failure. Use broad terms.

### Result-card anchors

Each hit is an `<li>` carrying `new-listing-container` in its class:

| Field | Anchor |
|-------|--------|
| id / url | `<a class="listing-link--unlocked" href="/remote-jobs/<slug>">` — the slug is the id |
| title | `<span class="new-listing__header__title__text">` |
| posting age | `<p class="new-listing__header__icons__date"> 20d </p>` |
| company | `<p class="new-listing__company-name">` |
| company HQ | `<p class="new-listing__company-headquarters">` — the **employer's** location, not the applicant's |
| chips | `<p class="new-listing__categories__category">`, repeated |

Sponsored slots are `<li id="listing-ad-N" class="feature feature--ad new-listing-container listing-ad …">` — matched on `listing-ad` / `feature--ad` and skipped.

### The chip vocabulary (this is the eligibility data)

One `new-listing__categories__category` list mixes four different kinds of value,
which is why `isGeoChip()` classifies by shape rather than position:

| Kind | Live examples |
|------|---------------|
| Job type | `Full-Time`, `Contract`, `Full-Time/Part-Time` |
| Promo | `Featured`, `Boosted`, `Top 100` (wraps a `<i class="fa-regular fa-star">`) |
| Salary | `$100,000 or more USD`, `$130k+`, `$20/hr+` |
| **Geography** | `Anywhere in the World`; `North America Only`, `EMEA Only`, `Asia Only`; flag-prefixed countries such as `🇺🇸 United States of America`, `🇧🇷 Brazil` |

A single listing may enumerate dozens of eligible countries as separate chips
(one live listing had **76**, including `🇮🇩 Indonesia` and *not* India — the
reason India is matched on flag code points or an exact name, never a substring).

## Detail

```
GET https://weworkremotely.com/remote-jobs/<slug>
```

Two independent sources of truth on the page, both used:

### 1. schema.org JSON-LD

`<script type="application/ld+json">` holding a `JobPosting`. Fields used:

| Field | Notes |
|-------|-------|
| `title`, `employmentType`, `hiringOrganization.name`, `hiringOrganization.address` | Straightforward |
| `applicantLocationRequirements` | **The authoritative eligibility signal** — an array of `{"@type":"Country","name":"<ISO alpha-2>"}`. Live examples: `["US"]` on a US-locked posting; a 249-entry list including `IN` on an "Anywhere in the World" posting |
| `datePosted` | Absolute, `"2026-08-04 20:13:58 UTC"`. **Can be stale on a re-posted listing** — one live posting read `2024-06-16` while the page said "19 days ago". The CLI cross-checks and sets `dateConflict` |
| `validThrough` | Absolute expiry, mirrors the sidebar's "Apply before" |
| `baseSalary` | Present but frequently `minValue: "0", maxValue: "0"` — treated as unpublished; the sidebar chip is the usable salary |
| `description` | HTML, **double-escaped** (`&lt;p&gt;`), used as a fallback for the rendered description block |

The block contains raw control characters inside string literals, so
`JSON.parse` fails on it unmodified — `parseJsonLd()` flattens U+0000-U+001F to spaces first.

### 2. The "About the job" sidebar

`<ul class="lis-container__job__sidebar__job-about__list">` with one
`…__list__item` per labelled row. Rows seen live:

| Label | Content |
|-------|---------|
| `Posted on` | `<span>20 days ago</span>` |
| `Apply before` | `<span>Sep 3th, 2026</span>` (WWR's own ordinal typo — passed through verbatim) |
| `Job type` | `<span class="box box--jobType">Full-Time</span>` |
| `Category` | `<span class="box box--blue">Design</span>` |
| **`Region`** | `<span class="box box--multi box--region">Anywhere in the World</span>` — present on region-scoped postings |
| **`Country`** | flag-prefixed country boxes, preceded by `<div class="geolock-container">…<span class="tooltip-text">(This job is GeoLocked)</span>` — present on country-locked postings |
| `Skills` | repeated `box box--blue` chips |

`Region` and `Country` are mutually exclusive in practice: a posting has one or
the other. The **`GeoLocked`** marker is WWR stating that the country list is a
requirement, not a hint — which is what lets `detail` return a `fail` verdict
where a search card could only justify a `flag`.

Description block: `class="lis-container__job__content__description"`, terminated
by `<hr class="lis-container__job__content__description__hr"/>`.

## Fixtures

`cli/tests/fixtures/` holds verbatim slices of the three live responses above,
captured 2026-08-25. See the README there for exactly what was sliced out and
why. The whole test suite runs offline against them.
