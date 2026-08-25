---
name: ats-search
version: 1.0.0
description: >
  Use this skill to find open roles straight from companies' own applicant
  tracking systems — Greenhouse, Ashby, and Lever — instead of a job board.
  Best for AI/GenAI, ML, and software engineering roles at frontier-AI labs,
  funded startups, and Bengaluru product companies, with real employer-set
  posting dates and no agency reposts. Trigger phrases: ATS jobs, Greenhouse
  jobs, Ashby jobs, Lever jobs, company career page, direct apply, jobs at
  <company>, open roles at <company>, frontier AI jobs, AI startup jobs.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/ats-search/cli/src/cli.ts *)
---

# ATS Search Skill

Pulls open roles directly from the **applicant tracking system** each company runs
its own careers page on — Greenhouse, Ashby, or Lever — rather than from a job
board. Three unauthenticated JSON APIs, no key, no login, no scraping.

## Why this exists

Every job board sits between the employer and you, and each layer adds noise:
staffing-agency reposts, the same req duplicated across cities or experience bands,
listings left up long after the role is filled, and a "posted" date that reflects
when the board ingested the listing rather than when the employer opened it.

An ATS feed has none of that. It is the employer's own system of record. If a req is
in the feed it is open; when it closes it leaves the feed. The date is the date the
company posted it. The apply link goes to the company's own form, so applying through
this skill skips the board entirely.

The tradeoff is coverage, and it is a real one — see the next section.

## The constraint: no provider lets you enumerate companies

None of the three APIs has an index endpoint. You cannot ask Greenhouse "which
companies use you". **So the company list is the search surface**, and this is a
lookup tool over a list you maintain, not a crawler that discovers new employers.

The list lives at `.agents/skills/ats-search/companies.txt`, one entry per line:

```
<provider>  <slug>   # optional note
greenhouse  anthropic        # hires globally, some remote-eligible reqs
ashby       sarvam           # Sarvam AI — Bengaluru, Indic foundation models
lever       cred             # Bengaluru
```

It ships seeded with **40 verified companies** across three groups: frontier-AI labs
and agentic-tooling startups (Anthropic, OpenAI, Cursor, Cognition, LangChain,
Harvey, Sierra), AI infrastructure (Modal, Baseten, Pinecone, Deepgram, Together),
and Bengaluru-based or India-present product companies (Sarvam, Glean, Composio,
Atlan, Observe.AI, Postman, Razorpay, PhonePe, Databricks, CRED, Meesho, Zeta).
Every slug was verified to resolve before being committed.

**Widening coverage is a manual, deliberate act.** When a company comes up — from a
funding announcement, a VC portfolio page, a LinkedIn careers link — find its board
slug and add a line. `bun run src/cli.ts check` verifies every slug still resolves
and reports each one's open-req count; run it occasionally, because companies do
migrate between ATS providers and a silently-dead slug contributes nothing while
looking fine.

## Commands

```bash
# Everything AI-ish across the whole list, last 3 weeks
bun run .agents/skills/ats-search/cli/src/cli.ts search -q "AI" --jobage 21 --format table

# Bengaluru only
bun run .agents/skills/ats-search/cli/src/cli.ts search -l bangalore --format table

# Remote-eligible, as marked by the ATS itself
bun run .agents/skills/ats-search/cli/src/cli.ts search -q "engineer" --remote --format table

# One company
bun run .agents/skills/ats-search/cli/src/cli.ts search -c sarvam --format table

# Full posting text for one job
bun run .agents/skills/ats-search/cli/src/cli.ts detail ashby:sarvam:<jobId> --format plain

# Are all slugs still alive?
bun run .agents/skills/ats-search/cli/src/cli.ts check --format table
```

Run `--help` for the full flag list.

## What is trustworthy here, and what isn't

**Dates are real and exact.** Greenhouse `updated_at`/`first_published`, Ashby
`publishedAt`, Lever's equivalent — all employer-set. So `--jobage` genuinely filters,
unlike Instahyre's, and `/rank` can sort on these ages without the `age_basis` hedging
other portals need. Undated postings are excluded by `--jobage` rather than assumed
fresh.

**Remote flags come from the ATS**, not from parsing prose: Ashby `isRemote` /
`workplaceType`, Greenhouse's "Location Type" metadata field, Lever `workplaceType`.
`--remote` uses those. A blank flag means the employer did not set one — it is not
evidence the role is on-site.

**`--query` matching is client-side and left-anchored at a word boundary.** Plain
substring matching made short acronyms useless: `-q "AI"` matched *chennai* on a live
run. Anchoring both ends would drop "LLMs" for `-q "LLM"`. Left-anchored keeps both.
By default it searches title, department, and location; add `--content` to search full
descriptions, which is much slower and much larger.

**Remote-eligibility for an India-based candidate is NOT answered here.** A posting
marked `remote: yes` is very often remote-within-one-country. This skill reports what
the ATS says and nothing more. Judging whether the role is workable from India is
`04-job-evaluation.md`'s Eligibility Gate — where a bare country tag is a FLAG and a
stated residency or work-authorization requirement is a FAIL. Do not collapse the two.

**Coverage is exactly your list, and nothing else.** A quiet result means the
companies you listed have nothing matching, not that the market is quiet. This is a
depth tool, not a discovery tool — pair it with the boards.

## Access posture

All three data hosts were checked and are open to general crawlers:
`boards-api.greenhouse.io` disallows only `/embed/`; `api.lever.co` allows all with
`Crawl-delay: 1`; `api.ashbyhq.com` serves the documented posting API unauthenticated.
See `url-reference.md` for the exact findings and the date they were verified.

**One trap worth stating in the skill itself:** Lever has two hosts with opposite
postures. The data API `api.lever.co` is open, but the candidate-facing board host
`jobs.lever.co` explicitly names `ClaudeBot` with `Disallow: /`. This skill uses the
API host only and must continue to. Never add a fetch against `jobs.lever.co`.

Requests are paced at 1100 ms between companies by default, which clears Lever's
`Crawl-delay: 1` for every host. A full 40-company sweep is therefore ~45 seconds. Do
not lower `--delay` to speed up a sweep.
