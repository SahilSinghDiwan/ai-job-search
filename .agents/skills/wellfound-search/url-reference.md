# Wellfound — endpoint and parsing reference

Everything here was verified live against `wellfound.com` on **2026-08-25**. Where a
claim is inferred rather than observed it is marked **[inferred]**.

---

## 1. robots.txt — recorded verbatim

Fetched `https://wellfound.com/robots.txt`, HTTP 200, on 2026-08-25. Full body,
unedited:

```
#
# Hey human,
#
# We like robots too. Come talk robot with us.
#
# https://wellfound.com/company/wellfound/jobs
#

User-agent: *
Disallow: /_jobs/
Disallow: /*?after_sign_in=*
Disallow: /*?inFrame=*
Disallow: /*?jobId=*
Disallow: /*?jobSlug=*
Disallow: /*?preview=*
Disallow: /*?role=*
Disallow: /*&inFrame=*
Disallow: /*&jobId=*
Disallow: /*&jobSlug=*
Disallow: /*&preview=*
Disallow: /auth/
Disallow: /cdn-cgi/
Disallow: /documents/
Disallow: /embed/
Disallow: /job_listings/report_company
Disallow: /job_pairings/howitworks
Disallow: /job_profiles/embed
Disallow: /jobs/applications
Disallow: /jobs/signup
Disallow: /onboarding
Disallow: /profile/edit
Disallow: /profile/notifications
Disallow: /profile/review
Disallow: /profile/resume
Disallow: /projects/
Disallow: /re/
Disallow: /recruit/dashboard
Disallow: /search
Disallow: /social/share_modal
Disallow: /u/

Sitemap: https://wellfound.com/sitemap.xml.gz
Sitemap: https://wellfound.com/blog-index.xml.gz
```

### What that means for this skill

- There is **one** `User-agent: *` group. **No AI bot is named** — no `ClaudeBot`,
  `Claude-User`, `GPTBot`, `CCBot`, or `Google-Extended` rule anywhere in the file.
  This is a materially different posture from Naukri, Foundit and RemoteOK, all of
  which name Claude explicitly and were excluded on those grounds.
- The disallowed set is aimed at **authenticated, apply-flow, recruiter-dashboard,
  and live-search-backend** paths. `/search` is the interactive search backend and
  is off-limits. So are `?jobId=`, `?jobSlug=`, `?role=`, `?preview=`,
  `?inFrame=`, `?after_sign_in=` in either `?` or `&` position.
- The **static browse pages this skill uses are not disallowed**: `/role/{slug}`,
  `/role/l/{slug}/{location}`, `/role/r/{slug}`, and `/jobs/{id}-{slug}`.
  (`/jobs/applications` and `/jobs/signup` are blocked; the `/jobs/` prefix itself
  is not.)
- Pagination uses `?page=N`, which is **not** in the disallowed query list. Note the
  contrast with `?role=`, which *is* blocked — hence role is a path segment here,
  never a query parameter.

`src/helpers.ts` enforces all of the above in code (`assertRobotsAllowed`), and
`tests/robots.test.ts` locks it down. A URL that would violate the file raises
`ROBOTS_DISALLOWED` instead of being requested.

**If this posture changes** — an AI-bot rule appears, or the `/role/` paths get
disallowed — the correct response is to stop using the skill and report it, not to
route around it. No user-agent spoofing, no challenge solving, no proxying.

---

## 2. Browse-path vocabulary (taken from the site's own links, not guessed)

| Pattern | Meaning | Verified |
|---|---|---|
| `/role/{roleSlug}` | Role, all locations | ✔ `/role/ai-engineer` → 200 |
| `/role/l/{roleSlug}/{locationSlug}` | Role in one city | ✔ `/role/l/ai-engineer/bangalore` → 200, 225 jobs |
| `/role/r/{roleSlug}` | Role, remote board | ✔ `/role/r/ai-engineer` → 200, 1,941 jobs |
| `?page={n}` | Pagination, 1-indexed, 20/page | ✔ `?page=2` → 200 |
| `/jobs/{id}-{titleSlug}` | Single posting | ✔ 200 |
| `/location/{slug}` | Location hub | listed in the footer; not used by this skill |

There is **no free-text search path available to us** — that is `/search`, which is
disallowed. `-q` therefore slugifies onto a role path rather than doing keyword
search. This is the single biggest functional difference from the other portal
skills and is called out in `SKILL.md`.

### The silent-widening trap (important)

An **unrecognised role or location slug does not 404**. It answers `303 See Other`
with `Location:` pointing at the *unfiltered* role page, which then returns 200 with
plenty of real listings — for the wrong query.

```
GET /role/l/ai-engineer/bangalore-india
→ HTTP/2 303, location: https://wellfound.com/role/ai-engineer
```

Follow that redirect and a "Bengaluru" search comes back full of San Francisco jobs
that look perfectly legitimate. This is very likely what produced the
`portal-research.md` conclusion that Wellfound was "thin for Bengaluru": the report
used `bangalore-india`, got silently widened to the global US-heavy role page, and
found only one clearly-Bangalore listing on it. The correct slug is **`bangalore`**,
and it reports **225** AI-engineer jobs — matching the 225 measured independently.

The CLI defends against this twice over:
1. `fetchPage` uses `redirect: "manual"` and turns any 3xx into a
   `SLUG_NOT_RECOGNISED` error quoting the `Location` header.
2. `parseSearchPage` re-checks `pageProps.role` / `pageProps.location` against what
   was asked for, and errors if the server served something else.

`bengaluru`, `bengaluru-india`, `bangalore-india`, `blr`, `gurugram`, `bombay` and
`new-delhi` are aliased to slugs that work (`LOCATION_ALIASES` in `helpers.ts`).

### Verified role slugs

Live job counts for `/role/l/{slug}/bangalore` on 2026-08-25:

| Slug | Bengaluru jobs | Pages |
|---|---|---|
| `data-engineer` | 250 | 7 |
| `ai-engineer` | 225 | 7 |
| `software-engineer` | 190 | 7 |
| `backend-engineer` | 164 | 7 |
| `full-stack-engineer` | 82 | 4 |
| `devops-engineer` | 43 | 2 |
| `machine-learning-engineer` | 33 | 2 |
| `data-scientist` | 12 | 1 |

Remote variants verified: `/role/r/ai-engineer` → 1,941 jobs / 51 pages;
`/role/r/machine-learning-engineer` → 295 jobs / 10 pages.

Also linked by the site (exist, Bengaluru volume not measured): `frontend-engineer`,
`product-manager`, `data-analyst`, `product-designer`, `ui-ux-designer`,
`growth-marketer`, `sales-manager`, `account-manager`, `operations-manager`,
`hr-manager`, `financial-analyst`, `graphic-designer`.

An unknown slug 303s (see above) rather than 404ing, so `roles` in the CLI ships the
verified set rather than inviting guesses.

**Counts drift slightly between requests** — the same query returned
`totalJobCount` 225 then 229 minutes apart. Treat it as a live index, not a fixed
number.

---

## 3. Search-page response structure

Browse pages are **server-rendered Next.js**. No JS execution is needed and no
`ego-browser` escalation is required. The listings arrive in a normalised Apollo
cache embedded in the HTML:

```
<script id="__NEXT_DATA__" type="application/json" crossorigin="anonymous">
```

Note the extra `crossorigin` attribute — a regex anchored on
`<script id="__NEXT_DATA__" type="application/json">` exactly will **not** match.

Path to the data:

```
props.pageProps.location            "bangalore"     <- echo of what was served
props.pageProps.role                "ai-engineer"   <- echo of what was served
props.pageProps.apolloState.data    { normalised cache }
```

Inside `apolloState.data`:

```
ROOT_QUERY.talent["seoLandingPageJobSearchResults({\"location\":\"bangalore\",\"page\":1,\"role\":\"ai-engineer\"})"]
  ├── totalJobCount      225
  ├── totalStartupCount  139
  ├── pageCount          7
  ├── perPage            20
  └── startups[]  → { "__ref": "StartupResult:10243837" }
```

The query key is a *stringified argument object*, so match it by
`startsWith("seoLandingPageJobSearchResults")` rather than reconstructing it.

`StartupResult:{id}`:

| Field | Notes |
|---|---|
| `name` | Company name. **Often has trailing whitespace** (`"SciSpace "`) — trim it |
| `slug` | Company slug |
| `companySize` | e.g. `SIZE_11_50` |
| `highConcept` | One-line company pitch |
| `badges[]` | `__ref`s to `Badge:*` (`ACTIVELY_HIRING`, `RECENTLY_FUNDED`, `TOP_INVESTORS`, `GROWING_FAST`, `COMPANY_STAGE-*`, `B2B`) |
| `highlightedJobListings[]` | `__ref`s to `JobListingSearchResult:{id}` |

Jobs are nested **under companies**, so one page of 20 startups yields a variable
number of jobs (33, 35 and 41 observed on pages 1-3). `meta.perPage` is the
startup page size, not the job count — `meta.count` is the real number emitted.

`JobListingSearchResult:{id}`:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Numeric job id |
| `title` | string | |
| `slug` | string | Needed to build the detail URL: `/jobs/{id}-{slug}` |
| `compensation` | string | **Real published pay.** See §4. Empty string when not published |
| `liveStartAt` | number | **Unix epoch seconds.** See §5 |
| `locationNames` | string[] | e.g. `["Bengaluru","Kochi"]` |
| `remote` | boolean | |
| `remoteConfig` | object or **null** | `{ kind: "ONSITE" \| "REMOTE" \| "ONSITE_OR_REMOTE", wfhFlexible }`. **Can be null** — guard it |
| `acceptedRemoteLocationNames` | string[] | The remote-eligibility tags. See §6 |
| `jobType` | string | `full-time`, `internship`, … |
| `yearsExperienceMin` / `Max` | number\|null | |
| `description` | string | **Full description text, in the search payload.** Markdown-ish with `**bold**` and HTML entities |
| `autoPosted` | boolean | true = imported from the company's ATS |
| `atsSource` | string\|null | |
| `primaryRoleTitle` | string | e.g. `Engineering` |

The full description arriving in the *search* payload is unusual and useful: the
requirements scan in §6 runs without a second request.

---

## 4. Compensation — the reason this portal is worth building

Wellfound publishes real pay on a majority of cards. Measured over
`/role/l/ai-engineer/bangalore` pages 1-3 on 2026-08-25: **61 of 109 listings
(56.0%)** carried a compensation string. Naukri published salary on 0 of 20.

Card format, exactly as rendered:

```
₹30L – ₹47L • 0.02% – 0.05%
₹15L – ₹25L • No equity
₹10,000 – ₹20,000 • No equity
$25k – $50k • 0.0% – 1.0%
$112k – $140k
                                (empty string = not published)
```

- Separator is `•` (U+2022); range dash is `–` (U+2013 en dash).
- Magnitudes: `L` = lakh (×10⁵), `Cr` = crore (×10⁷), `k` (×10³), `M` (×10⁶).
  Comma-grouped plain numbers also appear (`₹10,000`).
- Currency comes from the glyph. **A bare `$` is assumed USD** — the card does not
  disambiguate CAD/AUD/SGD. `salary.currencySource` records `"symbol"` so a
  consumer knows the confidence level.
- **The card states no period.** `salary.period` is therefore `null` on search
  results, deliberately. `₹10,000 – ₹20,000` on an intern posting is monthly;
  calling it annual would misreport it by 12×. Run `detail` to resolve the period.
- Equity is captured separately as `{ mentioned, offered, raw, minPercent,
  maxPercent }`. `"No equity"` is `mentioned: true, offered: false` — a real
  statement, distinct from silence (`mentioned: false`).

---

## 5. Posting dates — exact, not relative

The brief anticipated relative strings ("7 days ago") with attendant precision loss.
**That does not apply here.** The rendered page shows "7 days ago", but the
underlying `liveStartAt` field is a **Unix epoch in seconds**, so the CLI reports a
true timestamp:

```
liveStartAt 1785740742  →  2026-08-03T07:05:42.000Z
```

Cross-validated against the detail page's schema.org `datePosted` for job 3534689:
search epoch → `2026-08-17`, JSON-LD → `2026-08-17T07:07:15Z`. They agree.

So: `datePrecision` is `"exact"`, `ageDays` is a **true age, not a floor**, and
`--jobage` is a real filter rather than an approximation. `/rank` can sort on this
without the `age_basis: "first_seen"` caveat that Instahyre needs.
`datePrecision` becomes `"unknown"` only if `liveStartAt` is ever absent.

No `validThrough` / application deadline is published on either page type. Do not
manufacture one.

---

## 6. Remote eligibility — two fields, deliberately not merged

`.claude/skills/job-application-assistant/04-job-evaluation.md` draws a sharp line:

> a geography tag alone is a FLAG. Only a stated requirement that India cannot
> satisfy is a FAIL.

Wellfound gives us both kinds of signal, and this CLI keeps them in separate fields
so the distinction survives into `/rank` and `/apply`.

**(a) `eligibility.tagVerdict` — from structured tags only.** Sourced from
`acceptedRemoteLocationNames` (search) / `applicantLocationRequirements` (detail
JSON-LD) plus `remoteConfig.kind` / `jobLocationType`. Its type union is
`PASS | FLAG | FLAG_UNVERIFIED | NOT_REMOTE` — **there is no `FAIL` member**, by
construction. A US-only tag yields `FLAG`, never a fail.

**(b) `eligibility.statedRequirements` — verbatim quotes, unjudged.** A regex pass
over the description for residency / work-authorization / citizenship language,
returning the matched clause verbatim with a `kind`. These are FAIL *candidates* for
a human or `/apply` to judge against the table in `04-job-evaluation.md`. The CLI
never issues the verdict itself.

**An empty `statedRequirements` array is not a pass.** None of the real captures on
2026-08-25 carried a prose residency line — Wellfound puts its geography gate in the
structured field instead. Treat empty as "no pattern matched", nothing more.

Observed on `/role/r/ai-engineer` page 1 (13 jobs), confirming the brief's warning
that Wellfound remote is US-gated in practice: `United States` ×3, `France` ×2,
`Pakistan`, `San Francisco, California`, `Chicago, Illinois`, `India` ×1, plus
several with an empty tag list (→ `FLAG_UNVERIFIED`).

---

## 7. Detail page: `/jobs/{id}-{slug}`

**No `__NEXT_DATA__` block** — the detail page is structured differently from the
browse pages. It carries a schema.org `JobPosting` in
`<script type="application/ld+json">`:

| JSON-LD field | Mapped to | Notes |
|---|---|---|
| `title` | `title` | |
| `hiringOrganization.name` / `.sameAs` | `company` / `companyUrl` | Name often has trailing space |
| `jobLocation[].address` | `location`, `country` | `addressLocality/Region/Country` |
| `jobLocationType` | `eligibility.workplace` | `"TELECOMMUTE"` = remote |
| `applicantLocationRequirements` | `eligibility.acceptedRemoteLocations` | Object or array; `.name` |
| `datePosted` | `date`, `postedAt` | Full ISO-8601, exact |
| `baseSalary.currency` | `salary.currency` | **Authoritative** — `currencySource: "jsonld"` |
| `baseSalary.value.minValue/maxValue` | `salary.min`/`max` | Real numbers, e.g. `3000000.0` |
| `baseSalary.value.unitText` | `salary.period` | `YEAR` / `MONTH` / `HOUR` — the period the card omits |
| `experienceRequirements.monthsOfExperience` | `monthsOfExperience` | |
| `employmentType` | `jobType` | `FULL_TIME` etc. |
| `industry`, `jobBenefits`, `directApply` | same | `description` and `jobBenefits` are HTML; stripped |

Worked example (job 4377358): card said `₹20L – ₹30L • No equity`; JSON-LD said
`{currency: "INR", minValue: 2000000, maxValue: 3000000, unitText: "YEAR"}`. The two
agree, and the detail page adds the period.

**The title slug is mandatory in the URL.** `/jobs/4377358` alone returns 404;
`/jobs/4377358-ai-engineer-llm-genai` returns 200. Search results always carry the
full `url`, so pass that (or the `id-slug` pair). A bare id raises
`SLUG_REQUIRED` with that explanation rather than a bare "not found".

---

## 8. Request etiquette

- One request per `search` call (one page). One per `detail` call.
- Backoff is exponential with jitter on 429/5xx, max 5 retries.
- Reconnaissance for this skill used roughly 20 requests spaced 2-5 s apart; nothing
  was rate-limited or challenged. Keep it at that pace.
- No bulk enumeration. Paginate deliberately with `--page`, don't sweep.
- A browser `User-Agent` is sent (the repo convention for portal CLIs, per
  `add-portal.md`). Nothing here spoofs a bot identity, solves a challenge, or
  bypasses a block. If Wellfound starts challenging requests, `extractApolloData`
  raises `NO_EMBEDDED_DATA` telling the caller to report the skill as broken —
  that is the intended end state, not a bug to work around.

---

## 9. Fixtures

`cli/tests/fixtures/` holds real responses captured on 2026-08-25, trimmed to a
handful of listings with long description bodies truncated. Field names, nesting and
values are otherwise untouched. **No test makes a network call.**

| Fixture | Source |
|---|---|
| `search-ai-engineer-bangalore.html` | `/role/l/ai-engineer/bangalore` — 8 jobs, 6 companies |
| `search-ai-engineer-remote.html` | `/role/r/ai-engineer` — 13 jobs, the US/EU-gated set |
| `detail-3534689-scispace.html` | `/jobs/3534689-senior-agentic-ai-engineer` — INR/YEAR salary |
| `detail-4610062-motive-remote.html` | `/jobs/4610062-gtm-ai-engineer` — USD, `applicantLocationRequirements: United States` |
| `redirect-303-shell.html` | The 303 interstitial body, for the silent-widening trap |

To refresh one, re-fetch the live URL and re-trim; keep the JSON shape verbatim.
