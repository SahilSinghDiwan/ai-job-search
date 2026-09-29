# ats-search — endpoint reference

Everything here was verified live on **2026-08-25**. Re-verify before assuming a
shape still holds; ATS vendors change these without notice, and this file is what a
future maintainer needs when parsing breaks.

## Greenhouse

**Search:** `GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true`

Returns `{ jobs: [...], meta: { total } }`. Per job: `id`, `title`, `absolute_url`,
`updated_at` (ISO 8601), `first_published`, `location: { name }`, `content` (HTML,
entity-escaped) when `content=true`, and `metadata[]`.

`metadata[]` is an array of `{ name, value }` where the employer defines the fields.
A **"Location Type"** entry is common and carries remote/hybrid/on-site — that is the
remote signal this skill uses. It is employer-configured, so its absence means
unset, not on-site.

**Detail:** `GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs/{jobId}`

**Slug:** the path component in `job-boards.greenhouse.io/{slug}`. Take it from the
company's own careers link; do not guess. Note some are long and unobvious —
Razorpay's is `razorpaysoftwareprivatelimited`.

**robots.txt** (`boards-api.greenhouse.io`): disallows only `/embed/`, for all
user-agents. No AI-bot rule.

## Ashby

**Search:** `GET https://api.ashbyhq.com/posting-api/job-board/{slug}`

Optional `?includeCompensation=true`. Returns `{ jobs: [...] }`. Per job: `id`,
`title`, `department`, `team`, `location`, `secondaryLocations[]`, `isRemote`
(boolean), `workplaceType`, `publishedAt` (ISO 8601), `jobUrl`, `applyUrl`,
`descriptionHtml`, `descriptionPlain`.

`isRemote` plus `workplaceType` are set in the ATS by the employer — the cleanest
remote signal of the three providers.

**Slug:** the path component in `jobs.ashbyhq.com/{slug}`.

**robots.txt:** `api.ashbyhq.com/robots.txt` itself returns **401** — that is an
auth wall on the robots path, not a policy statement, so it is inconclusive on
paper. The documented `posting-api` path answers unauthenticated in practice. Note
separately that the candidate-facing `jobs.ashbyhq.com` disallows `/api/`; that is a
different host and this skill does not touch it.

## Lever

**Search:** `GET https://api.lever.co/v0/postings/{slug}?mode=json`

Returns a bare **array** (not an object) of postings. Per posting: `id`, `text`
(the title), `categories: { location, team, commitment, department }`,
`workplaceType`, `createdAt` (epoch **milliseconds**, not seconds — a frequent
off-by-1000 bug), `hostedUrl`, `applyUrl`, `descriptionPlain`, `lists[]`.

**Error shapes, both unambiguous — no silent wrong-looking success:**
- Unknown slug → `{"ok": false, "error": "Document not found"}`
- Valid slug, nobody hiring → `[]` (a real empty array)

**Slug:** the path component in `jobs.lever.co/{slug}`.

### The two-host trap — do not get this wrong

| Host | robots.txt | Use it? |
|---|---|---|
| `api.lever.co` | `Allow: /`, `Crawl-delay: 1`, all user-agents | **Yes** — this is the data API |
| `jobs.lever.co` | Cloudflare-managed block naming **`ClaudeBot: Disallow: /`** | **Never** |

The board host explicitly excludes Claude by name even though a generic `Allow: /`
block appears later in the same file; the specific rule governs. This skill fetches
`api.lever.co` only. Any future change that adds a `jobs.lever.co` fetch is a policy
regression, not an optimisation.

## Pacing

Default `--delay` is **1100 ms** between companies, chosen to clear Lever's
`Crawl-delay: 1` on every host rather than tracking per-host budgets. A 40-company
sweep takes ~45 s. Do not lower it.

## The enumeration problem

No provider exposes an index of companies using it. There is no way to ask "who is on
Greenhouse". This is why `companies.txt` exists and why coverage is exactly what is
listed there. Any future attempt to widen coverage automatically would mean guessing
slugs against these APIs at volume, which is both unreliable and rude — add lines by
hand from real careers links instead.

## Fixtures

`cli/tests/fixtures/` holds real captured responses: `greenhouse-anthropic.json`,
`ashby-sarvam.json`, `lever-cred.json`, and `lever-notfound.json` (the error shape).
All 84 tests run offline against these — CI never touches the live APIs.

## Verification status

| Claim | Status |
|---|---|
| All three endpoint shapes | **Verified live 2026-08-25** |
| All three robots.txt postures | **Verified live 2026-08-25** (Ashby's returned 401 — inconclusive, documented above) |
| All 40 seeded slugs resolve | **Verified live 2026-08-25** via `check` — 40/40 |
| Lever `createdAt` is epoch ms | **Verified** against fixture |
| Greenhouse `metadata` "Location Type" | Verified present on some employers; **employer-configured, not guaranteed** |
