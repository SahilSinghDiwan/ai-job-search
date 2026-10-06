<p align="center">
  <img src="assets/mascot/pip_flight_loop.gif" alt="Pip, the courier bird" width="200">
</p>

# AI Job Search

*The job search that runs on your machine.*

[![CI](https://github.com/SahilSinghDiwan/ai-job-search/actions/workflows/ci.yml/badge.svg)](https://github.com/SahilSinghDiwan/ai-job-search/actions/workflows/ci.yml)

An AI-powered job application framework built on [Claude Code](https://claude.com/claude-code). Fork it, fill in your profile, and let Claude evaluate job postings, tailor your CV, write cover letters, and prepare you for interviews.

**This fork targets the Indian job market** — Naukri, Instahyre, Wellfound, company ATS boards and global-remote listings, with compensation handled in CTC-versus-fixed terms rather than a flat salary number. It tracks [MadsLorentzen/ai-job-search](https://github.com/MadsLorentzen/ai-job-search) upstream, which is country-agnostic at its core and ships Danish portals. If you are hiring-market-agnostic or European, start upstream; if you are searching in India, start here. [What this fork changes](#what-this-fork-changes) lists the differences.

> Note: This is an independent open-source project and is not affiliated with, endorsed by, sponsored by, or maintained by Anthropic. Anthropic and Claude Code are referenced only to describe the toolchain this workflow uses.
>
> This project has **no affiliated cryptocurrency, token, or paid sponsorship program**. Anything claiming otherwise is unauthorized and should be treated as a scam. The only ways to support it are upstream's Ko-fi link below and contributing on GitHub.

## Does it actually work?

The framework's author, a geophysicist by training, built it to run his own job search after his position was cut in late 2025 — the same `/scrape`, `/apply` and `/interview` loop in this repo, used weekly. Sixty-nine tailored applications, twenty first interviews and one signed contract later, he started as an AI engineer in June 2026. That is upstream's track record, in [his words](https://github.com/MadsLorentzen/ai-job-search).

This fork is that framework pointed at India and run the same way. Its own numbers are not in yet.

*The longer version, including the full application funnel, is on [LinkedIn](https://www.linkedin.com/in/mads-lorentzen/).*

<p align="center">
  <i>Did this save you a Sunday of cover-letter writing? The framework's upstream
  author takes coffees; this fork takes none.</i> ☕
</p>

<p align="center">
  <a href="https://ko-fi.com/madslorentzen">
    <img src="https://storage.ko-fi.com/cdn/kofi3.png?v=6" alt="Buy me a coffee at ko-fi.com" height="40">
  </a>
</p>

## What this fork changes

Everything upstream does still works the same way. What is different here:

**India job sources.** Five portal skills were added and the four Danish ones removed:

| Skill | Source | Notes |
|---|---|---|
| `ats-search` | Greenhouse, Lever, Ashby | The employer's own ATS feed for a named list of companies (`.agents/skills/ats-search/companies.txt`). Highest signal available: no board markup, real employer-set dates |
| `wellfound-search` | Wellfound | Startups, India and remote. A majority of listings publish salary; per-listing eligibility is verified rather than trusted |
| `wwr-search` | We Work Remotely | Global-remote, with each listing's country-eligibility line actually parsed |
| `instahyre-search` | Instahyre | India tech/startup. Ships demoted to every second run — it never expires listings, so dates need browser enrichment |
| `naukri-search` | Naukri.com | India's largest index. Ships **disabled**: bulk-poster dominated, no salaries. Browser-driven on your own login, because Naukri's robots.txt blocks HTTP access |

The roster, the cadence, and the traps behind each of those calls are in
[docs/portal-field-notes.md](docs/portal-field-notes.md). Sources that were researched
and deliberately *not* built — and why, usually robots.txt — are listed there too.

**Indian compensation, done properly.** An Indian offer is quoted as **CTC**, which
bundles fixed pay, a variable component, ESOPs at a notional valuation, gratuity and
PF. A proudly quoted "₹40 LPA CTC" routinely decomposes to ₹24 fixed. `/apply` and
`/rank` therefore evaluate against a **fixed-pay** floor, never the headline, and
`salary_lookup.py` does the decomposition (`tools/README_SALARY_TOOL.md`).

**The form fields Indian portals demand.** `08-application-forms.md` covers current
CTC, expected CTC and notice period: what to write, what never to put in writing, and
why a notice period you are already serving is worth volunteering.

**Referral outreach as a first-class artifact.** `/apply` now offers a fourth output
alongside the CV, cover letter and form fields: ranked referral contacts at the target
company with drafted outreach notes. It drafts only — it never sends anything.

**ATS verification of the compiled PDF.** `tools/ats_check.py` extracts the PDF's text
layer and checks what a parser actually sees: `(cid:*)` markers, `U+FFFD` bullets, a
literal email and phone, reading order, and keyword coverage scored against the job
description. The stock CV template carries the fixes it checks for.

**A tracker you can look at.** `tools/gen_dashboard.py` builds an offline HTML
dashboard from `job_search_tracker.csv` plus the outcome archives; `serve_tracker.sh`
serves it locally and `scripts/install-tracker-launchd.sh` keeps that running across
logins on macOS.

**An instrumented ledger.** `tools/instrument.py` adds an append-only event log over
the tracker — a stable join key per application, per-application cost, and an offline
verifier that re-derives the ledger from its events. Its data files stay untracked.

**Personal data cannot be committed.** See [Keeping your data out of
git](#keeping-your-data-out-of-git).

## Keeping your data out of git

A job-search profile holds your phone number, address, employers and compensation
floor. On a public fork that is exactly the wrong thing to commit, so this fork
separates the two:

- The tracked files are **templates**, full of `[PLACEHOLDER]` tokens: `CLAUDE.md`,
  `01-candidate-profile.md`, `02-behavioral-profile.md`.
- Your real data lives in `.local.md` siblings — `CLAUDE.local.md`,
  `01-candidate-profile.local.md`, `02-behavioral-profile.local.md` — which
  `.gitignore` excludes. `CLAUDE.md` imports `CLAUDE.local.md` automatically, and the
  job-application skill is instructed to read a `.local.md` file in preference to its
  template whenever one exists.
- `STATUS.md` and `HANDOFF.md` (where *your* search stands), `documents/jd/`,
  `documents/profile-text/` and `documents/prompts/` are ignored for the same reason,
  as are the tracker CSV, the generated reports and every `/apply` output.

To start: `cp CLAUDE.md CLAUDE.local.md`, then fill it in or run `/setup`.

If you forked to a **private** remote and would rather track your profile directly,
fill in the tracked files instead and delete the `.local.md` rules from `.gitignore`.

## What this is

A structured workflow that turns Claude Code into a full-stack job application assistant. The core workflow (self-profiling, fit evaluation, and the drafter-reviewer application pipeline) is **language- and country-agnostic**. This fork is targeted at the **Indian job market**: the shipped portal search skills cover Naukri, Instahyre, Wellfound, Greenhouse/Lever/Ashby ATS boards, LinkedIn and global-remote boards, and the same pattern swaps in any other local board via `/add-portal`.

```
/setup          /scrape              /apply <url>
  |                |                     |
  v                v                     v
Fill in        Search job           Evaluate fit
your profile   portals              Score & recommend
  |                |                     |
  v                v                     v
Profile        Present matches      Draft CV + Cover Letter
files ready    with fit ratings     (LaTeX, tailored)
                   |                     |
                   v                     v
               Pick a match         Reviewer agent critiques
               -> /apply            -> Revise -> Final output
```

The framework encodes career guidance best practices, including structured evaluation criteria, forward-looking cover letter framing, and optional salary benchmarking.

## Prerequisites

- [Claude Code](https://claude.com/claude-code) (CLI). Using a different agent tool (Codex, Antigravity, Gemini CLI)? Start at [`AGENTS.md`](AGENTS.md) - the portal search skills work there out of the box, and [community forks](https://github.com/MadsLorentzen/ai-job-search/discussions/78) adapt the full workflow.
- Python 3.10+
- [Bun](https://bun.sh) (for job search CLI tools)
- LaTeX distribution with `lualatex` and `xelatex`: [TeX Live](https://tug.org/texlive/), [MacTeX](https://tug.org/mactex/), [TinyTeX](https://yihui.org/tinytex/), or [MiKTeX](https://miktex.org/). The CV compiles with `lualatex` (pdflatex often fails on modern MiKTeX installs with `fontawesome5` font-expansion errors); the cover letter compiles with `xelatex` because `cover.cls` requires `fontspec`. If using a minimal TeX install such as TinyTeX or BasicTeX, install the extra packages listed in [SETUP.md](SETUP.md#minimal-tex-install-tinytexbasictex).
- Optional: `pdftotext` from [poppler](https://poppler.freedesktop.org/) (macOS: `brew install poppler`, Debian/Ubuntu: `apt install poppler-utils`, Windows: `choco install poppler`) — used by `/apply`'s ATS parseability check on the compiled CV. If missing, the check degrades gracefully to a visual keyword review.

## Quick start

### 1. Fork and clone

```bash
gh repo fork SahilSinghDiwan/ai-job-search --clone   # India-targeted (this repo)
# or, for the country-agnostic original:
# gh repo fork MadsLorentzen/ai-job-search --clone
cd ai-job-search
```

### 2. Install job search tools

PowerShell:

```powershell
$tools = @("ats-search", "instahyre-search", "linkedin-search", "naukri-search", "wellfound-search", "wwr-search", "freehire-search")
foreach ($tool in $tools) {
  Push-Location ".agents/skills/$tool/cli"
  bun install
  Pop-Location
}
```

Bash / zsh / Git Bash:

```bash
for tool in ats-search instahyre-search linkedin-search naukri-search wellfound-search wwr-search freehire-search; do
  (cd .agents/skills/$tool/cli && bun install)
done
```

For `linkedin-search` and `freehire-search` the install is optional: both have zero runtime dependencies and run with plain `bun`; `bun install` only pulls TypeScript dev types.

### 3. Set up your profile

```bash
cp CLAUDE.md CLAUDE.local.md   # your real profile goes here; it is gitignored
claude
# Then inside Claude Code:
/setup
```

`/setup` offers three paths: read your `documents/` folder if you have one populated (CV PDF, LinkedIn export, diplomas, reference letters, past applications), import a single CV pasted in chat, or walk through an interview. It auto-detects what you have and asks. Documents-folder mode is idempotent and safe to re-run as you add more material; see `documents/README.md` for the layout.

### 4. Search for jobs

```bash
/scrape
```

This searches multiple job portals for positions matching your profile, deduplicates results, and presents them sorted by fit. Pick a match to run `/apply` on it directly — or, when a scrape returns more jobs than you want to eyeball, run `/rank` to batch-score them all against the fit framework and get a ranked shortlist first.

### 5. Apply to a job

```bash
/apply https://www.instahyre.com/job/438118/
```

If the URL can't be fetched (some job portals block automated access), you can paste the job description directly instead:

```bash
/apply <paste the full job description here>
```

This runs the full workflow: evaluate fit, draft CV + cover letter, review with a second agent, revise, and present the final output.

Postings are treated as untrusted input (the workflow follows no instructions embedded in them and fetches no links from their body), but agentic defenses are instruction-level, not a sandbox - on an unfamiliar job board, skim what was fetched and written before you hit send. Details in [SECURITY.md](SECURITY.md).

## Other commands

`/setup`, `/scrape`, and `/apply` form the core workflow. Ten more commands extend it once your profile is in place:

- **`/interview`** preps you for a scheduled interview on a tracked application. It builds a stage-specific prep pack from the application's archive (the exact posting, the CV and cover letter the interviewer actually read, feedback recorded from earlier rounds), researches the company and interviewers with a verify-before-use rule, maps likely questions to your STAR examples, and offers a mock interview following the roleplay protocol in `07-interview-prep.md`. Gaps get honest bridge answers, never invented experience.
- **`/outcome`** records what happened to an application - interview stages, offers, rejections, silence. It archives the submitted CV, cover letter, and posting text into `documents/applications/<company>_<role>/`, keeps `outcome.md` in the format `/setup` Path A parses, and updates the tracker. It also owns the stretch before there is an outcome to record: `/outcome followup` surfaces open applications that have gone quiet (default 10 days), drafts a short channel-appropriate follow-up in your writing style using only claims from the materials you already submitted (drafts only, never sends; at most twice per application), and offers a thank-you note in the same turn an interview stage is recorded. Once a few applications resolve, it points you back to `/setup` to calibrate the fit framework from what actually got interviews.
- **`/notion-sync`** publishes a one-way, read-only view of the pipeline into a Notion database via the official Notion MCP server (OAuth, no API keys) - one row per ranked job plus every tracked application, with a write-once briefing page per row. The repo files stay the system of record: nothing syncs back, and documents sync as filenames only. Complements `/html-report`: that is the deep offline dashboard you regenerate at your desk; this is the glanceable live view from anywhere Notion runs (desktop, web, phone).
- **`/gmail-sync`** reads your Gmail (via the Gmail connector) for status signals on your open applications - interview invites, assessment links, offers, rejections - and proposes them as a batch for you to approve before anything is written to the tracker or `outcome.md`, citing the source email on every proposed change. Offers stop short of proposing `hired`/`offer_declined` since that's your call; conflicting or unmatched signals get flagged for a manual `/outcome` pass instead of guessed.
- **`/rank`** bridges `/scrape` and `/apply`: it batch-scores all newly scraped postings against the fit framework (parallel agents fetch each posting and score the five evaluation dimensions) and returns a ranked shortlist with honest per-job strengths and gaps. Deal-breakers veto, deadlines get urgency flags, dead postings get marked expired. Pick a number and it hands off to the full `/apply` workflow.
- **`/expand`** enriches your profile by scanning public sources you've already linked in it (GitHub repos, portfolio site, Kaggle, Google Scholar) and looking up syllabi for named courses and certifications. Discovered competencies are added to your profile with a source tag. Useful right after `/setup` to surface skills that documents alone don't make explicit.
- **`/upskill`** analyzes the gap between your profile, your tracked job postings, and your ranked-but-untracked postings (`/rank`'s recorded gaps in `seen_jobs.json`) — or a single posting via `/upskill <URL>`. Produces a prioritized heatmap of skill gaps and a learning plan with web-searched study resources and time estimates. Useful for career planning between applications.
- **`/html-report`** generates a self-contained HTML dashboard from `job_search_tracker.csv` and the application archives — stat cards, status/sector/channel/funnel charts (inline SVG, no external dependencies), and a filterable applications table. Opens directly in a browser, fully offline. Re-run it any time after `/outcome` adds new entries.
- **`/add-template`** registers your own CV or cover letter template (LaTeX, Typst, or another toolchain) in place of the stock ones. It captures the template's instructions (source extension, compile command, fonts, style rules, page limit), runs a mandatory test compile, and wires the template into `/apply`. See [Custom templates](#custom-templates) below.
- **`/add-portal`** generates a job-portal search skill for a job board in your market. It investigates the portal (search URL pattern, result structure, access rules), scaffolds the CLI skill from the same structure as the shipped ones, and test-runs a live query before registering. See [Job search tools](#job-search-tools) below.

`/reset` is also available, see [Starting over](#starting-over) below.

## File structure

```
ai-job-search/
├── CLAUDE.md                          # Profile TEMPLATE + workflow rules (imports CLAUDE.local.md)
├── CLAUDE.local.md                    # Your real profile - gitignored, never committed
├── PLAYBOOK.md                        # Day-to-day operating guide: the loop, the rules, Docker compiles
├── .claude/
│   ├── commands/
│   │   ├── apply.md                   # /apply workflow (drafter-reviewer)
│   │   ├── setup.md                   # /setup onboarding (documents folder, CV import, or interview)
│   │   ├── expand.md                  # /expand competency enrichment from documents and online presence
│   │   ├── add-template.md            # /add-template register custom templates (LaTeX, Typst, ...)
│   │   ├── add-portal.md              # /add-portal generate a job-portal search skill for your market
│   │   ├── rank.md                    # /rank triage scraped jobs into a ranked shortlist
│   │   ├── outcome.md                 # /outcome record application results, archive materials
│   │   ├── gmail-sync.md              # /gmail-sync auto-detect application status from Gmail
│   │   ├── interview.md               # /interview stage-specific prep pack + mock interview
│   │   ├── html-report.md             # /html-report generate application tracker dashboard
│   │   ├── notion-sync.md             # /notion-sync one-way pipeline view in a Notion database
│   │   └── reset.md                   # /reset wipe profile data or documents folder
│   ├── skills/
│   │   ├── job-application-assistant/  # Core application skill
│   │   │   ├── SKILL.md               # Skill definition
│   │   │   ├── 01-candidate-profile.md # Education/experience/skills TEMPLATE (.local.md overrides)
│   │   │   ├── 02-behavioral-profile.md# PI/DISC/personality assessment
│   │   │   ├── 03-writing-style.md    # Tone, structure, do's and don'ts
│   │   │   ├── 04-job-evaluation.md   # Scoring framework for job fit
│   │   │   ├── 05-cv-templates.md     # LaTeX CV structure + tailoring rules
│   │   │   ├── 06-cover-letter-templates.md # LaTeX cover letter templates
│   │   │   └── 07-interview-prep.md   # STAR examples + interview framework
│   │   ├── job-scraper/               # Job search orchestration
│   │   └── upskill/                   # /upskill skill gap analysis and learning plan
│   └── settings.json                  # Claude Code permissions (shared, scoped)
├── .agents/skills/                    # Job portal CLI tools
│   ├── naukri-search/                 # Naukri.com (India's largest board, browser-driven)
│   ├── instahyre-search/              # Instahyre (India tech/startup)
│   ├── ats-search/                    # Greenhouse / Lever / Ashby company boards
│   ├── wellfound-search/              # Wellfound (startups, India + remote)
│   ├── wwr-search/                    # We Work Remotely (global remote)
│   ├── linkedin-search/               # LinkedIn public job listings (country-agnostic)
│   └── freehire-search/               # freehire.me tech job aggregator (multi-market, REST API)
├── cv/
│   └── main_example.tex               # moderncv LaTeX template
├── cover_letters/
│   ├── cover.cls                      # Custom cover letter LaTeX class
│   ├── cover_example.tex              # Example cover letter (structural reference + CI smoke test)
│   └── OpenFonts/                     # Lato + Raleway fonts
├── templates/                         # Custom templates registered via /add-template
│   └── README.md                      # Folder layout instructions
├── documents/                         # Career source materials for /setup Path A and /expand
│   ├── README.md                      # Folder layout instructions
│   ├── cv/                            # Master CV (PDF or .tex)
│   ├── linkedin/                      # LinkedIn profile export (PDF)
│   ├── diplomas/                      # Degree certificates and transcripts
│   ├── references/                    # Reference letters
│   └── applications/                  # Past application records (<company>_<role>/)
├── docs/
│   └── portal-field-notes.md          # Portal roster, traps, and sources deliberately not built
├── .github/workflows/ci.yml           # CI: LaTeX smoke compiles, skill lint, CLI typechecks
├── salary_lookup.py                   # Salary benchmarking + CTC decomposition (BYO data)
├── tools/
│   ├── ats_check.py                   # ATS parseability + JD keyword coverage on the compiled PDF
│   ├── gen_dashboard.py               # Offline HTML dashboard from the tracker + outcome archives
│   ├── instrument.py                  # Append-only event ledger over the tracker (cost, join key)
│   ├── verify_pdf.py                  # Page count, date format and layout checks on a compiled PDF
│   ├── convert_salary_excel.py        # Convert salary Excel to JSON
│   ├── lint_skills.py                 # CI lint for skills, commands, settings.json
│   ├── security_guards.py             # CI guards: permission allowlist, gitignore rules, manifests
│   └── README_SALARY_TOOL.md          # Salary tool setup instructions
├── serve_tracker.sh                   # Serve the dashboard locally
├── scripts/install-tracker-launchd.sh # Keep that server running across logins (macOS)
├── job_scraper/                       # Scraper state (seen jobs, results)
├── gmail_sync/                        # /gmail-sync state (processed message IDs, last sync date)
├── upskill/                           # /upskill report output (markdown reports per run)
├── job_search_tracker.csv             # Application tracking spreadsheet
└── SETUP.md                           # Detailed setup guide
```

## How `/apply` works

The `/apply` command runs a **drafter-reviewer workflow** with mandatory PDF compilation:

1. **Parse** the job posting (URL or text)
2. **Evaluate fit** against your profile (skills, experience, culture, location, career alignment)
3. **Draft** a tailored CV and cover letter in LaTeX
4. **Spawn a reviewer agent** that researches the company and critiques the drafts
5. **Revise** based on the reviewer's feedback
6. **Compile and inspect** both PDFs: lualatex for the CV, xelatex for the cover letter. Claude reads the rendered pages and iterates on the LaTeX until the CV is exactly 2 pages with no orphaned entry titles, and the cover letter is exactly 1 page with the signature visible and fonts consistent.
7. **ATS-check the CV**: extract the PDF's text layer (`pdftotext`, optional dependency) and verify it the way an ATS parser sees it — contact details present as literal text, no garbled glyphs, sane reading order — then score the posting's keyword coverage against the extraction. Keywords the profile genuinely supports get added; genuine gaps stay visible, never stuffed.
8. **Present** the final output with a verification checklist

All claims in the CV and cover letter are verified against your actual profile. The system never fabricates skills or experience.

### What makes this workflow different

- **PDF verification loop.** Most LaTeX-resume templates produce "looks fine in the .tex" output that breaks in the PDF: job titles orphan to the next page, cover letters spill onto page 2, bullet fonts silently fall back to the body font. The `/apply` command compiles and visually inspects every PDF and applies targeted fixes (`\needspace`, `\enlargethispage`, font-matching wrappers for list items) until the layout is clean. This runs automatically on every application.
- **ATS verification on the PDF text layer.** An ATS reads the PDF's embedded text, not the rendered page — and LaTeX can silently produce PDFs whose text extracts as garbage (icon glyphs where the email should be, interleaved lines from multi-column layouts). `/apply` extracts the compiled CV's text layer with `pdftotext` and verifies contact details, reading order, and the posting's keyword coverage against what a parser actually sees. Honesty rule enforced: a keyword the profile doesn't support is acknowledged as a gap, never stuffed in.
- **Relevance-weighted CV cutting.** When a CV overflows 2 pages, the workflow does not cut mechanically from the "oldest" section. It scores each candidate line by (a) relevance to the target posting, (b) uniqueness in the document, and (c) whether the cover letter depends on it, and cuts the lowest-total-score line first. An older-role bullet that hits posting keywords survives ahead of a recent-role bullet that does not.
- **Drafter-reviewer separation.** The drafter writes; a second Claude agent, spawned with a fresh context, researches the company and critiques the drafts. The drafter then revises. This catches missed keywords, weak framing, and generic language that a single pass often leaves in.
- **Token-efficient reviewer dispatch.** The reviewer agent receives drafts inline rather than re-reading them, and the verification checklist runs once at the end of the workflow rather than being duplicated by both agents. Note: the new compile-and-inspect step in Step 5 spends some of those savings on PDF rendering and layout iteration — the workflow trades some end-to-end token cost for a real reduction in broken PDFs reaching the user.

## Customization

### Which files to edit manually

If you prefer editing files directly instead of using `/setup`:

| File | What to change |
|------|---------------|
| `CLAUDE.md` | Your full profile (name, education, experience, skills, goals) |
| `01-candidate-profile.md` | Structured version of your CV data |
| `02-behavioral-profile.md` | Your behavioral assessment or self-assessment |
| `04-job-evaluation.md` | Skill match areas, career goals, motivation filters |
| `05-cv-templates.md` | Profile statement templates for different role types |
| `07-interview-prep.md` | Your STAR examples from actual experience |
| `search-queries.md` | Job search queries for your skills and location |

### Updating your search queries

As your priorities evolve, you can reconfigure just the job search without re-running the full profile setup:

```
/setup --section search
```

This re-runs the search configuration interview: which roles to target, which skills to search for, which locations, and which portals. It also suggests role types you may not have considered based on your profile.

### Custom templates

The CV uses [moderncv](https://ctan.org/pkg/moderncv) (banking style). The cover letter uses a custom `cover.cls` with Lato/Raleway fonts. Both are LaTeX — the reference engine this repo ships and maintains.

To use your own template instead — LaTeX, [Typst](https://typst.app/), or any other toolchain that compiles to PDF from the command line — run:

```
/add-template
```

Point it at your source file (a `.tex` file plus any `.cls`/`.sty` files or bundled fonts; a `.typ` file plus any local packages; or an equivalent for another toolchain). The command interviews you for the template's instructions — source extension, compile command, fonts and where they live, style rules to preserve, hard page limit — stores everything under `templates/`, runs a mandatory test compile, and activates the template so `/apply` drafts and compiles from it. Templates are stored with `[PLACEHOLDER]` tokens instead of personal data, so they're safe to commit and share.

- `/add-template --list` shows registered templates
- `/add-template --use <name>` switches between them
- `/add-template --use default` reverts to the stock moderncv / cover.cls templates

If you prefer doing it by hand, the manual route still works: update the guidance in `05-cv-templates.md` and `06-cover-letter-templates.md`.

### Job search tools

The India CLI tools in `.agents/skills/` (Naukri, Instahyre, Wellfound, ATS boards) demonstrate the pattern for building a job-portal integration for a specific market. If you're in a different country, run:

```
/add-portal
```

Give it your local job board's URL. The command investigates the portal (search-URL pattern, result-page structure, robots.txt/access rules), scaffolds a CLI skill with the same structure, commands, and output contract as the shipped ones, and test-runs a live query before registering anything. Auth-walled portals are declined, and portals with restrictive terms get a prominent personal-use-only warning in the generated skill. The generated skill is market-specific and lives in your fork; the generator itself is the universal part.

Maintaining a fork adapted to your market or language? Add it to the [Community forks & adaptations](https://github.com/MadsLorentzen/ai-job-search/discussions/78) thread so others can find it.

For **country-agnostic** coverage alongside the India portals, the repo ships two market-neutral portal skills:

- **`linkedin-search`** — built on LinkedIn's public, unauthenticated `jobs-guest` endpoints. Field-agnostic, **zero runtime dependencies** (runs with just `bun`), and takes the search location as an explicit flag, so it works for any market out of the box (`-l "Berlin, Germany"`, `-l "Mumbai, Maharashtra, India"`, `-l "Remote"`, …). Intended for **personal use only** — automated access is against LinkedIn's Terms of Service, so keep volume low. See `.agents/skills/linkedin-search/SKILL.md`.
- **`freehire-search`** — queries the [freehire.me](https://freehire.me) aggregator's public REST API (JSON, no API key). Tech-focused (software, data, engineering, DevOps, remote), multi-market via facet flags (`--region`, `--country`, `--remote`), and **zero runtime dependencies**. Unlike the HTML-scraping portals, results come back structured (skills, seniority, category). The backend is MIT-licensed and [self-hostable](https://github.com/strelov1/freehire) — point `FREEHIRE_API_URL` at your own instance if you prefer. See `.agents/skills/freehire-search/SKILL.md`.

### Extending the framework: portals, templates, criteria - and borrowing from other forks

Everything above adds up to an extension model, so here it is stated plainly. The framework has three extension points, and none of them require touching upstream:

1. **Portal skills** - the module system for job boards. Every `*-search` skill is a self-contained folder under `.agents/skills/` with the same contract (a `search`/`detail` CLI, `--format json|table|plain` output, an `enabled:` flag in its `SKILL.md`, its own tests). `/scrape` auto-discovers any installed skill that follows the contract - nothing to register, nothing to wire up. `/add-portal` generates new ones; the [community portal index](https://github.com/MadsLorentzen/ai-job-search/discussions/78) catalogs the ones other forks have built.
2. **Document templates** - `/add-template` registers any CV or cover-letter toolchain that compiles to PDF from the command line, LaTeX or otherwise.
3. **Evaluation criteria** - deal-breakers and preferences in your profile are free-form, and the evaluation rubric scores against whatever you put there. "Strong parental-leave terms", "minimum salary X per my union's scale", "no on-call" - each is one profile line, no code, and it carries real weight in `/rank` and `/apply` fit evaluations. Language is the one deal-breaker type with dedicated, structured handling: `/setup` captures every language you work in and your level (asked directly, or inferred from your CV/LinkedIn export) into a `Languages` table, and the Language Gate (`04-job-evaluation.md`) hard-rejects a posting that requires a language you haven't declared at all, while flagging - not auto-rejecting - one that asks for a higher level than you declared in a language you do work in, so a borderline case (a strict "fluent" bar against your own B1/B2, say) gets your judgment instead of a silent drop.

**Borrowing a portal skill from another fork** is the intended way to get a board that upstream doesn't ship: find it in the [portal index](https://github.com/MadsLorentzen/ai-job-search/discussions/78), open that fork, and copy the one folder into your own `.agents/skills/`. Before you run it:

- **Read the code.** All of it - these CLIs run pre-approved on your machine (`.claude/settings.json` allowlists them) against your career data. Check that the only network calls go to the job board it claims to search, that `package.json` has no `dependencies` and no lifecycle scripts (`postinstall` etc.), and that nothing reads or writes outside its own folder.
- **Run its tests offline** (`bun test` in the skill's `cli/` directory) - a well-built skill's tests pass with no network access.
- Check the `enabled:` flag and the skill's own ToS notes.

The copy step is manual on purpose. Your settings already allow installed portal skills to run without asking each time - so an installer that fetched them from third-party repos for you would skip the one check that matters: you, reading the code first. There isn't one, and that's a security decision rather than a missing feature.

Market-specific *data sources* (a national salary database, local award-rate tables) follow the same pattern as portals: they belong in a market fork, shared via [#78](https://github.com/MadsLorentzen/ai-job-search/discussions/78), not upstream.

### Salary benchmarking

The salary tool works with any salary data you provide (market surveys, Glassdoor exports, personal research). See `tools/README_SALARY_TOOL.md` for the expected format and setup. If you don't have salary data, the salary step is simply skipped.

For India it also does the part that actually decides an offer: **decomposing a CTC**
into fixed pay, variable, ESOP and statutory components, so you compare a fixed-pay
floor against fixed pay rather than against a headline number. An unreported component
renders as `?`, never as `0` — the tool does not invent a split it wasn't given.

### Checking a CV against an ATS

```bash
python3 tools/ats_check.py cv/main_example.pdf --jd documents/jd/<posting>.txt \
  --email you@example.com --phone 9999999999
```

It reads the PDF's embedded text layer — what a parser sees, not what the page looks
like — and reports encoding damage, contact details that exist only as icons or links,
reading-order problems, page count, and how much of the posting's vocabulary your CV
genuinely covers. Run it before you send anything. `tools/verify_pdf.py` covers the
layout rules (2 pages, ASCII date ranges, no orphaned entry titles).

### Tracking and instrumenting the search

`/html-report` (or `python3 tools/gen_dashboard.py`) builds a self-contained dashboard
from `job_search_tracker.csv` and the outcome archives. `./serve_tracker.sh` serves it
at a local URL, and `scripts/install-tracker-launchd.sh` installs a macOS LaunchAgent
so it survives logout.

`tools/instrument.py` maintains an append-only event log beside the tracker: a stable
join key per application, per-application cost, and `verify` to re-derive the ledger
from its events offline. The tool is committed; `events.csv` and `costs.csv` never are.

The commands write through it rather than around it. `/outcome` logs a new application
with `instrument.py add` (tracker row, `job_id` and `applied` event in one step) and
changes status only with `instrument.py record`; `/gmail-sync` does the same for each
approved email. A row added on the day of the application is keyed `apply-time`; one
added later is flagged `late-logged-backfill`, and rows keyed by `init` stay flagged as
back-filled. `/rank` and `/apply` log each model pass with `instrument.py cost`. Token
and USD figures are not observable from inside a slash command, so those records are
**unmetered**: `verify` reports them as passes logged and never as cost coverage.

### Starting over

To wipe your profile data and start fresh:

```
/reset profile    # clears skill files, preserves framework rules
/reset documents  # deletes files from documents/ folder
/reset all        # both
```

`/reset` shows exactly what will be deleted and requires you to type `RESET` to confirm. Nothing is deleted until you do.

### Staying up to date

Upstream moves fast. Rather than pulling raw `master` and hoping, update your fork to a tagged [release](../../releases) - a vetted checkpoint described in [CHANGELOG.md](CHANGELOG.md). `python3 tools/check_upstream_updates.py` previews exactly which of your personalized files an update touches before you merge. Full walkthrough in [SETUP.md, section 8](SETUP.md#8-pulling-upstream-updates-into-your-fork).

## Tips for better results

### Profile depth matters

The single biggest factor in output quality is how much detail you put into your profile. A thin profile produces generic applications; a detailed one enables genuinely tailored results.

- **Role descriptions:** Don't just list job titles. Describe what you actually did in each position: specific projects, tools used, responsibilities, and measurable achievements. The more material you provide, the more precisely the system can reframe your experience for different roles.
- **Skills in context:** Instead of listing "Python" or "project management," describe how and where you applied them. "Built ML pipelines for customer churn prediction in Python using scikit-learn" gives the system far more to work with than "Python, machine learning."
- **All onboarding paths work:** Whether you point `/setup` at your `documents/` folder, paste a single CV, or walk through the interview, the principle is the same: richer input produces sharper output.

### Career path discovery

The framework supports two distinct modes of job searching:

- **Explicit targeting:** You know which roles or sectors you want. The system helps refine and prioritize based on fit.
- **Latent opportunity discovery:** By analyzing your full history (not just job titles, but the actual work you did), the system can surface career paths you haven't considered. Transferable skills that map to unexpected industries, patterns in what you enjoyed or excelled at, or emerging roles that combine your domain expertise with new technology.

To get the most from this, invest time during `/setup` in describing not just your experience, but what energized you, what drained you, and what you'd want more of. This context directly shapes how the system evaluates fit and which roles it surfaces during `/scrape`.

## Contributing

Issues and PRs are welcome here for anything India-specific: a portal skill for an
Indian board, CTC/compensation handling, the form-field guidance, the ATS checks.

Anything market-neutral — a fix to `/apply`, the evaluation framework, the LaTeX
templates, the CLI contract — belongs [upstream](https://github.com/MadsLorentzen/ai-job-search)
so every fork gets it. [CONTRIBUTING.md](CONTRIBUTING.md) explains upstream's rules on
what gets merged there and what is expected to live in a market fork like this one.

## Acknowledgements

- [Mads Lorentzen](https://github.com/MadsLorentzen) for [ai-job-search](https://github.com/MadsLorentzen/ai-job-search), the framework this fork is built on
- [Mikkel Krogholm](https://github.com/mikkelkrogsholm) ([skills repo](https://github.com/mikkelkrogsholm/skills)) for the job search CLI skills
- Built with [Claude Code](https://claude.com/claude-code) by [Anthropic](https://anthropic.com)

## License

MIT
