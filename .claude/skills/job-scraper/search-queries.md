# Search Queries for Job Scraper

## Installed portal CLIs (primary for `/scrape`)

`/scrape` discovers every portal skill under `.agents/skills/*/SKILL.md` and runs its CLI first. Shipped country-agnostic CLIs include `linkedin-search` and `freehire-search`, plus `instahyre-search` for the India tech/startup market; any skill you add with `/add-portal` is included the same way. You do **not** need a matching `site:` line below for those CLIs to run.

For this search, run **`linkedin-search`** (primary - AI/GenAI roles in India and global-remote), **`naukri-search`** (India's largest board; browser-driven, see caveat below), **`instahyre-search`** (India tech/startup, Bengaluru-heavy), and **`freehire-search`** (global-remote). Use the `site:` templates below as the WebSearch fallback for boards without a portal skill (Wellfound/AngelList and startup career pages).

**Naukri notes:** its `jobAge` filter genuinely works server-side (verified: unfiltered 3884 -> `jobAge=7` 951 -> `jobAge=1` 423), so alongside `linkedin-search` it is one of only two sources that can honour the 14-day Date Filter below - use `jobAge=15` and trim the extra day client-side. Two caveats: Naukri publishes **no salary** on these listings (0/20 cards), so never present a Naukri salary figure; and bulk posters are heavy - a single Bengaluru AI/ML search returned 17 of 20 cards from one employer, differing only by experience band. Route that through Step 2.5 (Mass-Posting Detection) in `SKILL.md`, consolidating rather than excluding.

**Instahyre caveat:** its API exposes no posting date and no recency filter, so `instahyre-search` cannot honour the 14-day window in the Date Filter below - do not pass it `--jobage`. Treat **bulk API results as "date unknown"**: they are genuinely dateless, and Instahyre leaves listings up indefinitely, so a first page of hits routinely mixes 11-day-old and 600-day-old postings with nothing to tell them apart.

Enriched results are a different case. The skill ships an **opt-in browser pass** that reads each posting's real publication date (`datePosted`, from the job page's schema.org JSON-LD) and stores it in its own posting-date table - see `.agents/skills/instahyre-search/SKILL.md`. Run it deliberately over a **shortlist** you have already narrowed, never over a whole search page. An enriched posting has an exact ISO date, is not "date unknown", and its date should be carried into `seen_jobs.json` as `posted_date` so `/rank` scores its age exactly instead of falling back to `first_seen`.

Its `detail` command returns skill keywords, not description text.

**Language scope:** Sahil works in English, Hindi, and Marathi (see CLAUDE.md Languages table). AI/GenAI job postings in India and global-remote are effectively all written and conducted in English, so all query categories below are in English. Hindi/Marathi require no separate translated query set here; the Language Gate in `04-job-evaluation.md` still uses the full table when assessing any individual posting.

## Search Sites

Primary:
- **linkedin.com/jobs** - LinkedIn job listings (filter: India / Bengaluru + Remote); also covered by `linkedin-search` CLI
- **naukri.com** - India's largest general job board; covered by the `naukri-search` skill, which is **browser-driven via `ego-browser` on the user's own logged-in session** rather than an HTTP CLI, because naukri.com's robots.txt disallows Claude/AI user-agents on job paths. `/scrape` must **not** attempt `bun run` for it - there is no `cli/` directory. Personal-use, low-volume, read-only
- **wellfound.com** (AngelList Talent) - startup / AI-first roles, incl. global-remote
- **instahyre.com** - India tech/startup roles; covered by the `instahyre-search` CLI

Secondary (company career pages via Google):
- Direct Google searches with `site:` filters for AI-first startups and funded product companies

## Query Categories

Queries are grouped by priority. Combine each with location terms (Bengaluru / Bangalore / Remote) where the site supports it.

### Priority 1: AI / GenAI Engineer

Strongest and most desired direction.

```
site:linkedin.com/jobs "AI Engineer" (Bengaluru OR Remote) India
site:linkedin.com/jobs "GenAI Engineer" (Bengaluru OR Remote)
site:naukri.com "Generative AI Engineer" Bangalore
site:wellfound.com "AI Engineer" remote
"RAG" "LLM" AI Engineer (Bangalore OR remote) jobs
```

### Priority 2: LLM / Applied AI Engineer (domain: production GenAI, RAG, retrieval)

Matches the retrieval/RAG/production-GenAI core.

```
site:linkedin.com/jobs "Applied AI Engineer" (Bengaluru OR Remote)
site:linkedin.com/jobs "LLM Engineer" India
site:linkedin.com/jobs "RAG" OR "retrieval" LLM engineer Bangalore
site:naukri.com "LangChain" OR "LangGraph" engineer Bangalore
"vector search" OR "hybrid retrieval" engineer remote jobs
```

### Priority 3: AI Platform / Agentic / Developer-tooling Engineer

Adjacent frontier roles matching the current agentic test-automation work.

```
site:linkedin.com/jobs "AI Platform Engineer" (Bengaluru OR Remote)
site:linkedin.com/jobs "Agentic" AI engineer
site:linkedin.com/jobs "AI developer tooling" OR "LLM tooling" engineer
site:wellfound.com "agentic" OR "AI agent" engineer remote
```

### Priority 4: Broader ML / GenAI (wider net)

Wider net for adjacent titles.

```
site:linkedin.com/jobs "Machine Learning Engineer" GenAI (Bengaluru OR Remote)
site:naukri.com "Machine Learning Engineer" LLM Bangalore
site:linkedin.com/jobs "AI/ML Engineer" Python Bangalore
```

## Location Filter

When evaluating results, verify the job location fits Sahil's constraints (Bengaluru-based; open to on-site/hybrid in Bangalore or global remote in USD; relocation negotiable for the right AI role):
- **Ideal:** Bengaluru/Bangalore (on-site/hybrid) OR fully remote (India or global/USD)
- **Acceptable:** hybrid in Bangalore; remote-first with occasional travel
- **Borderline:** relocation to another Indian tech hub (Hyderabad, Pune, Gurugram, etc.) for a strong AI role - FLAG for user
- **Too far:** on-site-only outside India with no remote option and no relocation/visa support

## Language Filter

Working languages and levels are in CLAUDE.md's Languages table (English professional, Hindi native, Marathi native). Apply `04-job-evaluation.md`'s Language Gate: a posting requiring a language not on the table (as a job condition) is excluded; a posting requiring a higher level than declared in a listed language is flagged, not excluded. Target AI postings here are English-language, so this rarely triggers.

## Date Filter

Only include jobs posted within the last 14 days, or with an application deadline that has not yet passed. If a posting date cannot be determined, include it but flag as "date unknown".

## Adapting Queries

If the user specifies a focus area, select queries from the matching category and also generate 2-3 custom queries for that focus. For example:
- "/scrape agentic" -> Priority 3 queries + custom agentic/AI-tooling queries
- "/scrape remote" -> tighten all categories with "remote" + run `freehire-search`
