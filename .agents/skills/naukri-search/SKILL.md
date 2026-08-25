---
name: naukri-search
version: 1.0.0
description: >
  Use this skill to search Naukri.com for jobs in India — Bengaluru/Bangalore,
  Hyderabad, Pune, Gurgaon/Gurugram, Chennai, Mumbai, Noida, Delhi NCR, and
  remote/work-from-home roles. Best for AI/GenAI/LLM, software, data, and
  product roles at Indian product companies, GCCs, startups, and IT services.
  Unlike the other portal skills this one is **browser-driven** (ego-browser on
  Sahil's own logged-in Naukri session), not a CLI. Trigger phrases: Naukri,
  naukri.com, Naukri search, search Naukri, jobs on Naukri, India jobs Naukri,
  Bengaluru jobs Naukri, Bangalore jobs Naukri, naukri par job dhundo, nokri,
  naukri ke liye search, AI jobs India Naukri.
context: fork
enabled: false  # OFF by design - see "Why this portal ships disabled" below. Flip to true for an on-demand run.
allowed-tools: Skill(ego-browser), Bash(ego-browser nodejs *)
---

## Why this portal ships disabled

`enabled: false` in the frontmatter above is deliberate, not an oversight. `/scrape`
skips this portal entirely until it is flipped to `true`.

**The reason is signal quality, not access.** A live Bengaluru AI/ML search returned
**17 of 20 cards from a single employer**, differing only by experience band, and
**0 of 20 carried a salary**. At that ratio Naukri crowds out every other source in a
pooled `/scrape` run while contributing nothing to a compensation decision - which is
the opposite of useful when the shortlist is meant to be triaged by hand.

**It is kept installed on purpose.** This is a working, verified skill: `jobAge`
filters server-side (3884 -> 951 at `jobAge=7` -> 423 at `jobAge=1`), and Naukri is
India's largest board by volume. That volume is exactly what you want if the
high-signal sources go quiet and the search stalls - a deliberate, eyes-open sweep
through a noisy but enormous index beats having no option at all.

**To run it:** either flip `enabled: true` for a full `/scrape` run, or invoke this
skill directly for a one-off search without touching the roster. Prefer the one-off.
When you do run it, expect the bulk-poster pattern and lean on Step 2.5 (Mass-Posting
Detection) in `.claude/skills/job-scraper/SKILL.md` to consolidate the duplicates
rather than letting them fill the shortlist.

**Turn it back off afterwards.** The failure mode this setting exists to prevent is a
noisy portal quietly becoming the default again.

# Naukri Search Skill

Search live job listings on **Naukri.com**, India's largest job board, by driving
Sahil's own logged-in browser session through the **`ego-browser` skill**.

## ⚠️ This skill has no CLI — and must not get one

Every other portal skill in this repo ships a Bun/TypeScript CLI under `cli/`.
**This one deliberately does not.** There is no `cli/`, no `package.json`, and
`naukri-search` must **not** be added to the CI `cli-checks` matrix.

The reason: `https://www.naukri.com/robots.txt` carries a group naming
`Claude-User`, `Claude-SearchBot`, and `claudebot` with `Disallow: /` and an
allow-list that excludes every job-search and job-detail path. An unattended HTTP
crawler against those endpoints is off the table and **must not be revisited**.

What is in scope instead is what Sahil directed: an interactive, human-authorized
session on **his own Naukri account**, browsing the way a logged-in job seeker
browses, for his own personal job search. That is materially different from an
unattended crawler on public endpoints — and it is bounded by the rules below.

## ⚠️ Rules of use — non-negotiable

**Personal use only, low volume.** Human-paced interaction. Real delays between
page loads (2-4 s), one page at a time. No parallel tabs hammering search pages,
no bulk enumeration of the board, no wholesale export of listings, no local
mirror of Naukri's database. A normal run is a handful of search pages and a few
job details — not hundreds.

**Never spoof or evade.** No user-agent spoofing, no CAPTCHA solving, no
fingerprint manipulation, no proxy rotation. If Naukri challenges the session,
rate-limits it, shows an interstitial, or blocks it, **this skill stops and tells
the user.** It does not work around it. Do not "fix" a broken selector by adding
evasion of any kind — report the skill as broken instead.

**Never touch account state.** This skill is **read-only browsing** of search
results and job pages. It must **not**:
- click **Apply** / **Apply on company site** / **Easy Apply**
- send recruiter messages or chat replies
- edit the profile, resume, headline, preferences, alerts, or any setting
- save/unsave jobs, follow companies, or dismiss recommendations

If a flow would submit anything on Sahil's behalf, **stop and hand control back**
(`handOffTaskSpace`) rather than clicking through it.

**Credentials are his.** This skill never handles, stores, reads, types, or logs
a username, password, OTP, or session cookie. It relies entirely on the session
Sahil establishes himself in ego-browser's inherited login state. If the session
is not logged in, hand off and ask him to log in — never attempt to log in.

## Browser workflow

Run everything through the `ego-browser` skill via
`ego-browser nodejs <<'EOF' ... EOF` heredocs. Reuse **one** task space for the
whole search; do not spin up a space per query.

### 1. Open a task space and the search page

```bash
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('naukri job search')
cliLog('task space id: ' + task.id)
await openOrReuseTab('https://www.naukri.com/generative-ai-jobs-in-bengaluru', { wait: true, timeout: 40 })
await wait(3)
cliLog(JSON.stringify(await pageInfo()))
EOF
```

Search URLs are **path-based**, slug form `/{keyword}-jobs-in-{city}`:
keyword and city lowercased, spaces and `/` → `-`. Filters ride as query params
on top. Full patterns and params: `url-reference.md`.

### 2. Confirm the session is authenticated before extracting

```js
const loggedIn = await js(String.raw`!!document.querySelector('.nI-gNb-drawer__bars, .view-profile-wrapper')`)
```

If false → **stop**, `await handOffTaskSpace(task.id)`, and tell Sahil to log in.
Do not attempt a login. Resume only on his explicit "continue", with
`takeOverTaskSpace`.

### 3. Extract a results page (one `js()` IIFE, return once)

```js
const rows = await js(String.raw`(() => {
  const t = (el, s) => { const n = el.querySelector(s); return n ? n.textContent.trim() : null }
  return [...document.querySelectorAll('.srp-jobtuple-wrapper')].map(el => ({
    id:         el.getAttribute('data-job-id'),
    title:      t(el, 'a.title'),
    url:        (el.querySelector('a.title') || {}).href || null,
    company:    t(el, 'a.comp-name'),
    location:   t(el, '.loc-wrap span.locWdth'),
    date:       t(el, '.job-post-day'),
    experience: t(el, '.exp-wrap span.expwdth'),
    salary:     t(el, '.sal-wrap span.sal-wrap') || t(el, '.sal-wrap'),
    rating:     t(el, 'span.main-2'),
    tags:       [...el.querySelectorAll('li.tag-li')].map(x => x.textContent.trim()),
  }))
})()`)
```

20 cards per page. Parse each card independently so one malformed card cannot
break the rest.

### 4. Page

Append `-2`, `-3`, … to the **path** slug (`/generative-ai-jobs-in-bengaluru-2`),
carrying the same query string. `await wait(2)` between pages and **cap at 3
pages per query** — that is 60 results, plenty for a personal shortlist. If a
page returns 0 cards, stop rather than probing further.

### 5. Open a posting for detail

Navigate to the card's `url` (`/job-listings-<slug>-<id>`) in the same tab with
`gotoAndWait`, then `snapshotText()` or a `js()` extraction for the description,
role/industry/department table, and **applicant count**. Close scratch tabs as
you go. **Do not click any apply control on the detail page.**

### 6. Finish

`await completeTaskSpace(task.id, { keep: false })` once results are reported.
Use `{ keep: true }` only if Sahil asked to keep a posting open on screen.

## Output shape

Match the CLI portals so `/scrape` and `/rank` can consume Naukri results
identically. Emit `{ "meta": { "count": n, "page": n, "source": "naukri" }, "results": [...] }`
with missing values as `null`, never omitted.

| Field | Source on the card | Notes |
|-------|--------------------|-------|
| `id` | `data-job-id` attribute | Naukri's numeric job id, e.g. `240726023350` |
| `title` | `a.title` (text or `title` attr) | |
| `company` | `a.comp-name` | Staffing posts may also carry `.client-company-name` ("Posted by X") |
| `location` | `.loc-wrap span.locWdth` | Often multi-city, may be prefixed `Hybrid - ` / `Remote - ` |
| `date` | `.job-post-day` | **See posting-date section below** |
| `url` | `a.title` `href` | Absolute `https://www.naukri.com/job-listings-...` |
| `experience` | `.exp-wrap span.expwdth` | Naukri-specific, e.g. `5-10 Yrs` |
| `salary` | `.sal-wrap` | **Do not rely on this field.** Measured **0 of 20** on a live Bengaluru GenAI page — see the salary warning below |
| `applicants` | detail page only — **anchor unverified** | Not on the results card. `/rank` uses it only as an optional tie-breaker and degrades fine without it, so emit `null` rather than guessing a selector |
| `rating` | `span.main-2` | Ambitionbox employer rating — **18 of 20** live |
| `tags` | `li.tag-li` | Skill keyword chips — **20 of 20** live; the best requirements signal without opening the posting |

Live field coverage, measured across all 20 cards of
`/generative-ai-jobs-in-bengaluru` (not extrapolated from one card):

| Field | Coverage | Treat as |
|-------|----------|----------|
| `id`, `title`, `url`, `company`, `location`, `date`, `experience`, `tags` | **20/20** | reliable |
| `rating` | 18/20 | usually present, optional |
| posting agency (`.client-company-name`) | 2/20 | usually absent — staffing posts only |
| `salary` | **0/20** | **usually absent — see below** |

### ⚠️ Salary is effectively unavailable

`.sal-wrap` returned `null` on **every one of 20 cards**. Two explanations were
not distinguished before the session ended: either Naukri genuinely hides CTC on
almost all listings (the common case on this board), or the `.sal-wrap` selector
is stale. **Either way, do not present Naukri salary data.** Emit `salary: null`,
never infer a band from the `ctcFilter` used in the query, and do not treat a
null salary as a parse failure worth retrying. If salary ever matters, re-verify
the anchor against a live card first.

## Posting date — read this before trusting `date`

`/rank` uses posting age as its **primary urgency signal**, so this field matters
more than any other Naukri extra.

- It lives in the card's last row, `<span class="job-post-day">`, as **relative
  text**: `Just now`, `1 day ago`, `3 days ago`, `1 week ago`, `30+ days ago`.
- Naukri reports **freshness**, not strictly first-publish date — employers can
  refresh a listing, which resets the counter. Treat it as "last touched".
- **`30+ days ago` is a ceiling, not a date.** It means "at least 30 days" and
  could be 31 days or 400. Never convert it to a concrete date, never render it
  as "30 days ago", and never let it rank alongside a real 30-day posting. Carry
  it as `date: "30+ days ago"` with `dateIsFloor: true`, and treat it in `/rank`
  as *stale, age unknown*.
- Everything else converts safely to an approximate absolute date
  (`N days ago` → today − N; `1 week ago` → today − 7).
### ✅ `jobAge` is a **working** server-side freshness filter (verified)

Probed live against a baseline of **3884** results:

| URL | Result count |
|-----|--------------|
| *(no params)* | **3884** |
| `?…&jobAge=7` | **951** |
| `?…&jobAge=1` | **423** |

The count moves, monotonically and sensibly. **Naukri can honour `/scrape`'s
14-day window server-side** — making it the second source after LinkedIn that
can, and the only India-specific one. Always pass `jobAge` rather than pulling
everything and filtering client-side: it is both more accurate and far fewer
page loads, which is the point of the low-volume rule.

Use `jobAge=15` for the 14-day window (Naukri's ladder is `1, 3, 7, 15, 30`;
pick the next step up and trim the extra day client-side on `span.job-post-day`).

## Usage examples

Ask for these in natural language; the skill drives ego-browser.

```
Search Naukri for generative AI jobs in Bengaluru posted in the last 7 days   # jobAge=7, verified working
Search Naukri for LLM engineer roles in Bengaluru, 3-8 years experience
Search Naukri for RAG / LangChain jobs in Bengaluru, remote only
Search Naukri for "machine learning engineer" in Bengaluru, sorted by freshness, 2 pages
Open Naukri job 240726023350 and give me the full description and applicant count
```

Corresponding URLs (see `url-reference.md` for the full param table):

```
https://www.naukri.com/generative-ai-jobs-in-bengaluru?k=generative%20ai&l=bengaluru&jobAge=7
https://www.naukri.com/llm-jobs-in-bengaluru?k=llm&l=bengaluru&experience=5
https://www.naukri.com/rag-jobs-in-bengaluru?k=rag&l=bengaluru&wfhType=2
https://www.naukri.com/machine-learning-engineer-jobs-in-bengaluru?k=machine%20learning%20engineer&l=bengaluru&sort=f
https://www.naukri.com/generative-ai-jobs-in-bengaluru-2?k=generative%20ai&l=bengaluru
```

## Notes

- **No test suite guards this parsing.** There is no `cli/`, so nothing fails
  loudly when Naukri reships its markup. `url-reference.md` is the recovery
  document — keep it current, and re-verify anchors against a live card before
  trusting a run that returns suspiciously empty fields.
- Naukri's SRP is client-rendered. Always `wait(2-3)` after navigation and
  confirm `.srp-jobtuple-wrapper` count > 0 before extracting; an empty page is
  usually "not hydrated yet", not "no results".
- Result counts on the filter rail (`Bengaluru (3878)`, `Startup (116)`, …) are
  a fast way to size a market without paging through it. Read them; don't
  enumerate to count.
- **Expect heavy single-employer duplication — hand it to `/scrape` Step 2.5.**
  On the live Bengaluru GenAI page, **17 of 20** cards on page 1 were
  near-identical Accenture "AI / ML Engineer" postings differing only in
  experience band and job id. This is exactly the pattern
  **Step 2.5 (Mass-Posting Detection)** in `.claude/skills/job-scraper/SKILL.md`
  already handles — route it there rather than inventing a parallel mechanism
  here, and match its framing: it is **a caution signal about how a listing is
  being distributed, not an accusation against the employer**. Companies do
  legitimately hire the same role across bands and cities. Step 2.5
  **consolidates** such results into a single row noting the spread; it does not
  downgrade fit or silently exclude them. Naukri's variation axis is usually the
  **experience band**, so note the spread that way, e.g.
  "posted identically across 8 experience bands (2-5 / 3-8 / 5-10 / 7-12 Yrs)".
- Recruiter/consultant posts show `.client-company-name` ("Posted by …") while
  `a.comp-name` shows a masked name like "TOP MNC COMPANY". Capture both when
  present; the masked name alone is not a real employer.
- If Naukri shows a login wall, an interstitial, or a rate-limit page: stop,
  hand off, report. Do not retry in a loop.
