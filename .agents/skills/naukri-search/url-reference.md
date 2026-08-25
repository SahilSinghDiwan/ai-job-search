# Naukri URL & DOM Reference

The recovery document for `naukri-search`. **This file matters more here than for
the other portal skills, not less:** there is no `cli/` and no test suite, so
nothing fails loudly when Naukri reships its markup. When results come back with
empty fields, re-verify the anchors below against a live card first.

> **Personal use only, authenticated session.** Everything here is read through
> Sahil's own logged-in Naukri session via `ego-browser`. Keep volume low
> (a handful of pages, human-paced). No UA spoofing, no CAPTCHA solving, no
> fingerprint manipulation. If Naukri challenges or blocks the session, stop and
> tell the user.

## robots.txt — why there is no HTTP CLI

`https://www.naukri.com/robots.txt` contains a group naming `Claude-User`,
`Claude-SearchBot`, and `claudebot` with `Disallow: /` and an allow-list that
**excludes** every job-search and job-detail path. An unattended HTTP crawler
against these endpoints is out of scope and **must not be revisited**. This skill
exists only as human-authorized, read-only browsing of an account the user owns.

## Verification status

Two passes, both on Sahil's logged-in session. The second pass ended early — he
took control of the task space mid-probe — so several items below are still
**unverified and marked as such**. Do not promote a row to "verified" without
re-running the check.

| Item | Status |
|------|--------|
| Search-results URL path form | **verified live** — `/generative-ai-jobs-in-bengaluru` → `Generative Ai Jobs In Bengaluru - 3885 … Vacancies` |
| Authenticated session | **verified live** — logged-in nav present on both passes |
| Per-card DOM anchors | **verified live across all 20 cards**, not just one — see coverage table below |
| `date` / `span.job-post-day` | **verified live 20/20** — values `1 day ago`, `1 week ago` |
| `salary` / `.sal-wrap` | **verified absent 0/20** — cause not isolated (genuinely hidden vs. stale selector). Treat as unavailable |
| Detail URL form | **verified live** — taken from real card `href`s |
| Result-count string (`1 - 20 of 3884`) | **verified live** — usable as the probe signal for param testing |
| Applicant-count anchor (detail page) | **NOT VERIFIED** — detail page never opened |
| Detail-page description / role table anchors | **NOT VERIFIED** — same reason |
| **`jobAge` freshness param** | **VERIFIED WORKING** — 3884 → 951 (`jobAge=7`) → 423 (`jobAge=1`) |
| `experience` param | **VERIFIED WORKING** — 3884 → 2033 (`experience=5`) |
| `sort`, `wfhType`, `ctcFilter` params | **NOT VERIFIED** — probe round was interrupted |
| Pagination via path suffix `-2` | **NOT VERIFIED** — probe round was interrupted |

### Live field coverage (verified, 20/20 cards)

`https://www.naukri.com/generative-ai-jobs-in-bengaluru`, count string
`1 - 20 of 3884`:

| Field | Present | Verdict |
|-------|---------|---------|
| `id`, `title`, `url`, `company`, `location`, `date`, `experience`, `tags` | 20/20 | reliable, ship it |
| `rating` (`span.main-2`) | 18/20 | usually present, optional |
| posting agency (`.client-company-name`) | 2/20 | **usually absent** — staffing posts only |
| `salary` (`.sal-wrap`) | **0/20** | **usually absent — do not present Naukri salary data** |

Also observed: **17 of the 20 cards were duplicate Accenture "AI / ML Engineer"
posts**, differing only by experience band and job id. Route this to
**Step 2.5 (Mass-Posting Detection)** in `.claude/skills/job-scraper/SKILL.md` —
it consolidates such results into one row noting the spread, and treats the
pattern as a caution signal about distribution, not an accusation against the
employer. Do not build a parallel dedupe mechanism here.

### ✅ RESOLVED: Naukri has a working freshness filter

This was the highest-value open question and it came out **positive**. Probed
live, one param per page load, against the unfiltered baseline:

| Param | Result count | Verdict |
|-------|--------------|---------|
| *(baseline, no params)* | **3884** | — |
| `jobAge=7` | **951** | **works** — server-side freshness filter |
| `jobAge=1` | **423** | **works** — monotonic with `jobAge=7` |
| `experience=5` | **2033** | **works** — server-side experience filter |

**Consequence:** Naukri is the **second portal after LinkedIn** that can honour
`/scrape`'s 14-day window server-side, and the only India-specific one.
Instahyre cannot (its `--jobage` silently no-ops). Always pass `jobAge`; never
pull the full set and filter client-side.

Naukri's ladder is `1, 3, 7, 15, 30`. For a 14-day window use `jobAge=15` and
trim the extra day client-side on `span.job-post-day`.

The probe method, for re-verifying later or testing the remaining params: load
the unfiltered URL, read the count string (`1 - 20 of 3884`) as the baseline,
then add one param and reload. Count moves → the param works. Count **stays at
the baseline** → silently ignored; document it as **unsupported** the way
Instahyre's `--jobage` is. A no-op flag shipped as a working filter is worse than
no flag — it produces confidently wrong recency claims.

Still unprobed by this method: `sort`, `wfhType`, `ctcFilter`.

## Search URL

```
https://www.naukri.com/{keyword-slug}-jobs-in-{city-slug}[-{pageNo}][?params]
```

Slug rules: lowercase; spaces, `/`, `.`, `&` → `-`; collapse repeats.
`generative ai` → `generative-ai`; `Bengaluru` → `bengaluru`.
Bengaluru and Bangalore both resolve; prefer `bengaluru`.

**Pagination is in the path**, not a param: `-2`, `-3`, … appended to the slug.

```
page 1: https://www.naukri.com/generative-ai-jobs-in-bengaluru
page 2: https://www.naukri.com/generative-ai-jobs-in-bengaluru-2
```

20 results per page. Cap at 3 pages per query for personal-use volume.

### Query parameters

| Param | Meaning | Example values |
|-------|---------|----------------|
| `k` | Keyword (mirrors the slug; keep both in sync) | `generative%20ai` |
| `l` | Location (mirrors the slug) | `bengaluru` |
| `experience` | **VERIFIED** — years of experience, single integer | `3`, `5`, `8` |
| **`jobAge`** | **VERIFIED** — posted within N days. The filter `/rank` depends on | `1`, `3`, `7`, `15`, `30` |
| `sort` | *unverified* — sort order — `f` = freshness (newest first), `r` = relevance (default) | `f` |
| `wfhType` | *unverified* — work mode — `0` work-from-office, `2` hybrid, `3` remote | `3` |
| `ctcFilter` | *unverified* — salary band, lakhs-per-annum range | `15to25`, `25to50` |
| `pageNo` | *unverified* — alternate pagination (path suffix is the canonical form) | `2` |

**`jobAge` and `experience` are VERIFIED WORKING** (see the probe table above).
`sort`, `wfhType`, and `ctcFilter` are still **UNVERIFIED** — they come from
Naukri's filter UI conventions, not from a probe. Confirm each moves the count
off its baseline before relying on it, and document any that does not as
unsupported.

Prefer `jobAge` over client-side date filtering — verified accurate and far
fewer page loads.

## Detail URL

```
https://www.naukri.com/job-listings-{title-company-locations-experience-slug}-{jobId}
```

Real example captured live:

```
https://www.naukri.com/job-listings-senior-ai-ml-engineer-mlops-generative-ai-lecan-solutions-hyderabad-pune-bengaluru-5-to-10-years-240726023350
```

The trailing numeric segment is the `data-job-id` from the results card
(`240726023350`). Only the id is load-bearing; the slug is cosmetic.

## Results-page DOM anchors (verified live)

The SRP is client-rendered — `wait(2-3)` after navigation and confirm the card
count is > 0 before extracting.

| Field | Selector | Live example |
|-------|----------|--------------|
| card (repeat unit) | `.srp-jobtuple-wrapper` | 20 per page |
| inner wrapper | `.cust-job-tuple` | 1:1 with the above — don't count both |
| `id` | `[data-job-id]` on the card | `240726023350` |
| `title` | `a.title` (text, or `title` attribute) | `Senior AI/ML Engineer - MLOps & Generative AI` |
| `url` | `a.title` → `href` (absolute) | see Detail URL above |
| `company` | `a.comp-name` | `TOP MNC COMPANY` |
| posting agency | `.client-company-name a` | `Posted by Lecan Solutions` |
| `rating` | `span.main-2` (inside `.rating`) | Ambitionbox score; often absent |
| `experience` | `.exp-wrap span.expwdth` (or its `title` attr) | `5-10 Yrs` |
| `salary` | `.sal-wrap` (`span.sal-wrap` / `span[title]` inside) | `15-25 Lacs PA`; **absent on most cards** |
| `location` | `.loc-wrap span.locWdth` (or its `title` attr) | `Hybrid - Bengaluru, Pune, Hyderabad` |
| snippet | `span.job-desc` | truncated with `...` |
| `tags` | `ul.tags-gt li.tag-li` | `Genrative Ai`, `Natural Language Processing`, … (Naukri's own typo included) |
| **`date`** | **`span.job-post-day`** (last row, `div.row6`) | `1 week ago` |
| result total | filter-rail count string, e.g. `1 - 20 of 3885` | also `Bengaluru (3878)` in the Location facet |

The card rows are positional: `row1` title+logo, `row2` company, `row3`
experience+salary+location, `row4` description snippet, `row5` skill tags,
`row6` posting date + save button. If a class name changes, the row order is the
fallback heuristic.

### Auth check

```js
!!document.querySelector('.nI-gNb-drawer__bars, .view-profile-wrapper')
```

True when the logged-in global nav is present. False → hand off, ask the user to
log in, never attempt a login.

## Posting date — `span.job-post-day`

Relative text, one of:

| Text | Meaning |
|------|---------|
| `Just now`, `Few hours ago` | < 1 day |
| `1 day ago` … `29 days ago` | exact-ish day count |
| `1 week ago`, `2 weeks ago` | ≈ 7 / 14 days |
| **`30+ days ago`** | **floor, not a date — "at least 30 days", could be 31 or 400** |

Two honesty rules:

1. **`30+ days ago` is a ceiling on Naukri's counter, i.e. a floor on real age.**
   Never resolve it to a concrete date and never present it as "30 days ago".
   Carry it verbatim with `dateIsFloor: true` and let `/rank` treat it as
   *stale, exact age unknown*.
2. Naukri shows **freshness**, not first-publish date. Employers can refresh a
   listing, which resets the counter to "Just now". A fresh Naukri date means
   "last touched recently", not "newly created".

## Things not to do

- Do not add an HTTP CLI, a `package.json`, or a `cli-checks` CI entry.
- Do not click Apply, message recruiters, save/unsave jobs, or change any
  profile/resume/preference/alert setting. Read-only, always.
- Do not spoof a user agent, solve a CAPTCHA, or manipulate fingerprints.
- Do not enumerate the board, export listings wholesale, or mirror the database.
- Do not handle, store, type, or log credentials, OTPs, or session cookies.
