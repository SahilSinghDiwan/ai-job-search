---
name: wwr-search
version: 1.0.0
description: >
  Use this skill to search We Work Remotely (WWR) for global remote jobs paid in
  USD — AI/GenAI, machine learning, data, backend, DevOps and product roles at
  remote-first companies worldwide. Every listing is re-classified against its
  own stated geographic scope so India-ineligible postings are filtered out
  instead of wasting review time. Trigger phrases: We Work Remotely, WWR, remote
  jobs, global remote, work from anywhere, remote AI jobs, USD remote jobs,
  anywhere in the world jobs, international remote roles, remote-first companies.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/wwr-search/cli/src/cli.ts *)
---

# We Work Remotely Search Skill

Search live listings on **We Work Remotely**, the largest remote-only job board,
by plain HTTP over its public pages. No authentication, no API key, and **zero
runtime dependencies** — it runs with just `bun`.

WWR is a *global* board, which is the whole reason this skill is shaped the way
it is. Most of its listings are gated to a region that does not include India,
and a listing's geography is the difference between a real opportunity and two
wasted hours. So the headline feature is not search — it is the **eligibility
classifier**.

## Access posture

`https://weworkremotely.com/robots.txt`, re-verified **2026-08-25**, is fully
open: `Allow: /` for `User-agent: *`, with only account, admin, profile and
token paths disallowed, and **no AI-bot rule of any kind** — no ClaudeBot,
GPTBot, CCBot or Content-Signal directive. The exact file as found is recorded
in `url-reference.md`.

That makes this ordinary polite scraping of public pages, not evasion. Keep it
that way:

- **Human pacing.** A handful of requests per run. No bulk enumeration of the
  whole board, no parallel fetching, no scheduled crawling.
- **No challenge handling.** WWR currently serves plain HTML with no
  interstitial. If it ever answers with a bot challenge, the CLI detects it,
  aborts, and tells you — deliberately. Do not "fix" that by solving challenges,
  spoofing fingerprints or rotating user agents. Report the skill as blocked
  instead. (The sibling `himalayas-search` skill was **not built** for exactly
  this reason — see "Why there is no Himalayas skill" below.)
- Personal use only. Don't use it commercially or for bulk data collection.

## The eligibility classifier — read this before trusting any result

The portal research behind this repo found that a remote board's own India
location filter returned ~20 results of which **only 2 were genuinely
India-eligible**; the rest were gated to "United States only", "Germany only",
"Brazil only". **A filter that is wrong nine times out of ten is worse than no
filter, because it manufactures confidence.**

So this CLI never trusts a filter parameter. It re-reads the geographic scope
that each listing states in its own text and classifies on that.

### The four classes

| Class | Meaning | Gate verdict |
|-------|---------|--------------|
| `india-eligible` | India is inside the listing's stated scope — named directly (`🇮🇳 India`) or via a region that contains it (`Asia Only`) | **PASS** |
| `worldwide` | `Anywhere in the World`, or an applicant-country list long enough to be global | **PASS** |
| `gated-elsewhere` | A scope is stated and India is not in it | **FAIL** or **FLAG** — see below |
| `unknown` | The listing states no geographic scope at all | **FLAG** (unverified) |

`unknown` is never silently promoted to eligible and never silently dropped. A
listing that says nothing is reported as saying nothing.

### FAIL vs FLAG — why gated-elsewhere splits in two

`.claude/skills/job-application-assistant/04-job-evaluation.md`'s remote
eligibility gate draws a line this classifier preserves rather than collapsing:

- **A bare country tag is a FLAG.** "🇺🇸 United States of America" on a card may
  reflect where the company's entity sits, not a residency requirement. Failing
  on the tag alone deletes roles the candidate wanted to see. These get
  `gateVerdict: "flag"` and `restriction: "country-tag"`.
- **An explicit restriction is a FAIL.** "North America Only", or a
  machine-readable `applicantLocationRequirements` list that excludes India, is
  a stated requirement Bengaluru cannot satisfy. These get
  `gateVerdict: "fail"`.

Both are filtered out by default, but the counts are reported separately, so
"5 bare country tag" tells you there are five recoverable listings behind
`--include-gated` and "1 stated restriction" tells you one is genuinely closed.

### Upgrade a FLAG to a verdict with `detail`

Search cards carry chips; detail pages carry proof. Every WWR detail page
publishes a schema.org `JobPosting` block with
**`applicantLocationRequirements`** (ISO 3166-1 alpha-2 codes) and, when the
posting is country-locked, WWR's own **"(This job is GeoLocked)"** marker. So:

```bash
CLI=.agents/skills/wwr-search/cli/src/cli.ts
bun run $CLI detail <slug> --format plain   # -> "applicantLocationRequirements: 1 country, India NOT included"
```

That converts a card-level FLAG into a verified PASS or FAIL. Run it on the
handful you are actually considering — not on a whole page of results.

### What gets filtered, and how you see it

Every run ends with a line that says what was removed and why:

```
18 shown · 6 filtered out as gated elsewhere (1 stated restriction, 5 bare
country tag — re-run with --include-gated to see them): 3× 🇺🇸 United States of
America; 1× North America Only; 1× 🇦🇩 Andorra, 🇦🇱 Albania, 🇦🇷 Argentina +70 more
```

In `--format json` the same information is structured under
`meta.eligibility` (`counts` per class, `filtered.byVerdict`,
`filtered.byScope`), and each result carries its scope **verbatim** in
`eligibility.raw` / `eligibility.scope` plus a plain-English `eligibility.reason`.

### One rule the classifier will not break

India is matched on the flag code points or an **exact** country name — never a
substring. A live listing enumerated 76 eligible countries including
🇮🇩 **Indonesia** and 🇮🇴 **British Indian Ocean Territory** but *not* India;
a substring match would have promoted a closed listing to "eligible". There is a
regression test for exactly this.

## Commands

### Search

```bash
bun run .agents/skills/wwr-search/cli/src/cli.ts search [flags]
```

| Flag | Meaning |
|------|---------|
| `--query <text>` / `-q` | Keywords → WWR's `term` parameter. |
| `--location <text>` / `-l` | **Client-side** filter over the stated scope and the company HQ line. WWR has no server-side location parameter. |
| `--country <ISO>` / `-c` | WWR's own `country[]` filter, repeatable (`-c IN -c SG`). Applied server-side but **never trusted** — every listing is still re-classified, and a warning says so. |
| `--salary <range>` | WWR's `salary_range[]` facet, e.g. `"$100,000 or more USD"`. |
| `--jobage <days>` | **Client-side** max posting age. WWR's search has no recency parameter. A listing with no age badge is kept, not dropped. |
| `--include-gated` | Also show listings gated to regions that exclude India. |
| `--eligible-only` | Also drop listings that state no scope at all. |
| `--page <n>` | 1-indexed, 25/page — **client-side**: WWR returns the whole result set on one page. |
| `--limit <n>` / `-n` | Cap results emitted. |
| `--format json\|table\|plain` | Default `json`. |

### Detail

```bash
bun run .agents/skills/wwr-search/cli/src/cli.ts detail <slug|url> [--format json|plain]
```

`slug` is the `id` from search results (e.g.
`a-team-senior-independent-ai-engineer-architect`); a full WWR URL also works.
Returns the full description, the sidebar's Region/Country rows verbatim, the
GeoLock marker, `applicantLocationRequirements`, the apply-before date, and the
apply URL.

## Usage examples

```bash
CLI=.agents/skills/wwr-search/cli/src/cli.ts

# India-eligible + worldwide AI roles, gated ones filtered and counted
bun run $CLI search -q "AI engineer" --format table

# Only the last two weeks
bun run $CLI search -q "AI" --jobage 14 --format table

# Show what was being filtered out, to sanity-check the classifier
bun run $CLI search -q "AI engineer" --include-gated --format table

# Strictest view: drop scope-unstated listings too
bun run $CLI search -q "AI engineer" --eligible-only --format table

# Ask WWR for India-tagged listings — and still re-verify every one
bun run $CLI search -q "AI" -c IN --format json

# Only listings that publish a six-figure USD band
bun run $CLI search -q "AI" --salary "\$100,000 or more USD" --format table

# Resolve a card-level country tag into a verified PASS/FAIL
bun run $CLI detail sinclair-broadcast-group-sr-principal-data-engineer-data-architect --format plain
```

## Posting dates — what the numbers mean

WWR prints a compact relative badge on each card (`20d`) and a prose line on
each detail page (`Posted on 20 days ago`). Neither is an absolute date, so:

| Field | Meaning |
|-------|---------|
| `date` | ISO `YYYY-MM-DD`, **computed** from the relative badge (or read from JSON-LD on detail pages) |
| `datePrecision` | `exact` (portal published an absolute date) · `day` (from an hour/day badge) · `approx` (from a week/month badge) · `floor` (a `+` badge — the posting is *at least* this old) |
| `postedRelative` | The portal's own string, verbatim |
| `ageDays` / `ageIsFloor` | Age in days; `ageIsFloor: true` means the number is a **lower bound**, not a measurement |

A `30d+`-style badge is recorded as a floor and never presented as a date.
`/rank` sorts on posting age, so pass `ageIsFloor` through rather than treating
a floor as exact.

**One live caveat, handled explicitly:** a re-posted listing's JSON-LD
`datePosted` can still carry its *original* post date. One live posting showed
`datePosted: 2024-06-16` while the page itself said "19 days ago". When the two
disagree by more than a week, `detail` uses the page's relative age and sets
`dateConflict` explaining the discrepancy rather than picking one silently.

## Salary

WWR publishes a salary band on a minority of listings, as a chip like
`$100,000 or more USD` or `$130k+`. It is captured **verbatim** into `salary`
(null when absent) and shown as its own table column. This matters: the
candidate negotiates against a fixed-pay band and most Indian sources publish
nothing at all, so a USD range on a global-remote listing is a real data point.

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, `/scrape`, reading `meta.eligibility` |
| `table` | Scanning, with an `ELIG` badge column (`IN-OK` / `WORLD` / `GATED` / `TAG?` / `UNKWN`) |
| `plain` | Reading one listing's classification and full description |

Errors go to **stderr** as `{ "error": "...", "code": "..." }` with exit code
`1`. Non-fatal notes (such as the "country filter is not trusted" warning) go to
stderr as `warning: ...` lines and do not change the exit code.

## Notes and known limits

- **`term` matches narrowly.** Verified live on 2026-08-25: `"AI engineer"`
  returned 24 listings, while `"LLM"` and `"machine learning"` each returned
  **zero** — that is WWR's own result set, not a parser failure. Prefer broad
  terms (`AI`, `AI engineer`, `data engineer`, `python`) and filter afterwards.
- **Employers re-post the same req** under `-1` / `-2` slug suffixes (three
  identical CapsLock listings in one live search). Duplicates are collapsed onto
  the canonical slug, the folded ids appear in `duplicateIds`, and the count is
  in `meta.duplicatesCollapsed`. Two same-titled listings with *different*
  stated scopes are never merged.
- **Sponsored `listing-ad` slots are dropped** and counted in `meta.adsSkipped`
  so the totals still add up.
- **No server-side recency, location or pagination.** `--jobage`, `--location`
  and `--page` are all client-side over the single page WWR returns; the flags
  exist to keep the portal-skill contract, and the JSON `meta` says so.
- **The company HQ line is not eligibility.** `location` is where the employer
  sits ("Austin, TX, United States"); who may hold the job is `eligibility`.
  Never read the former as the latter.

## Why there is no Himalayas skill

Himalayas was researched alongside WWR and was **not built**. Its `robots.txt`
is still fully open with no AI-bot rule, but on 2026-08-25 every job path
(`/jobs`, `/jobs/*`, `/companies/*/jobs/*`) answered a plain HTTP GET with an
HTTP 403 Cloudflare **interactive challenge** ("Just a moment…"), while the
homepage and sitemaps returned 200. An interactive challenge is the operator
declining automated access regardless of what the robots file permits, and the
correct response is to stop rather than engineer around it. Revisit only if the
challenge is lifted; if it is, the classifier in `src/eligibility.ts` is the
piece worth reusing, since Himalayas has the same per-listing eligibility
problem in a worse form.
