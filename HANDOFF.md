# Session handoff — 2026-08-29

Paste the block below as the first message of the new session.

---

I'm continuing an `ai-job-search` session from 2026-08-29 (branch `india-market-support`). Read `PLAYBOOK.md` then `STATUS.md` first. Here is exactly where things stand.

## What already happened this session

**1. `/scrape` ran.** 131 new postings found and written to `job_scraper/seen_jobs.json`. Portals enabled: linkedin, freehire, ats, wellfound, wwr. Instahyre was skipped by cadence (it is demoted to every-2nd-run and ran on 2026-08-25). Naukri and the 4 Danish portals are `enabled: false`.

- **wwr-search is blocked, not broken.** It returned 0 results on both queries; the sentinel probe and its retry both came back with `"We Work Remotely served a bot challenge"`. Per the skill's own rule a bot challenge is never evidence of breakage. Leave `enabled: true` and just retry it on the next scrape.
- **Instahyre is systematically unfetchable by WebFetch** (Cloudflare JS challenge, 403). All 15 Instahyre postings in the ranking run expired as `unfetchable` for this reason alone, not because the jobs are dead. If Instahyre coverage matters, it needs the browser-based enrichment path in its `SKILL.md`, not WebFetch.

**2. `/rank` ran, but only finished half.** 192 high/medium-fit candidates were selected (24 from this scrape + a 168-job backlog from the 2026-08-25 scrape that was never ranked). They were split into 24 batches of 8 at `/private/tmp/claude-501/-Users-sahil-Downloads-ai-job-search/5077b94a-fad5-40fd-b57b-23d6eed5c757/scratchpad/batches/b01.txt` … `b24.txt`, with a compact scoring rubric at `…/scratchpad/rubric.md`.

- **Batches 1–12 completed** (96 postings). All results are persisted in `job_scraper/seen_jobs.json`: 42 ranked, 17 excluded on a location FAIL, 37 expired.
- **Batches 13–24 never ran** — the session hit its usage limit mid-dispatch. **96 postings remain unranked**, including PhonePe ×12, PocketFM ×4, Manifest ×3, Visa ×2, Roku ×2, Cisco ×2, Prodigal ×2, Nexthink ×2, plus smart-working-solutions, Sarvam, PwC, MoonPay and others.

**To finish the ranking:** the scratchpad may have been cleared, in which case re-run `/rank` and it will re-select whatever still has `status: "new"` — already-ranked entries are skipped automatically, so it will not redo work. If the scratchpad survived, dispatching batches b13–b24 against `rubric.md` is the cheaper path.

**Top of the current shortlist** (triage scores, posting text only):
| Score | Role | Company | Age |
|---|---|---|---|
| 85 | Applied AI Engineer | Lifesight | 2d |
| 85 | Artificial Intelligence Engineer | DotKonnekt | 4d |
| 85 | LLM Platform Engineer/Lead | Kayzen (Remote India/Bangalore) | 10d |
| 83 | Agent Engineer | SuprSend | 3d |
| 82 | AI Engineer | VoiceCare AI | 2d |

**3. `/apply` ran on #1, Lifesight — Applied AI Engineer (Bengaluru).** Evaluated at 85/100, Strong Fit. Both documents are drafted, reviewed and revised. **Only one thing is unfinished: the CV has never been compiled.**

## The one open task

`cv/main_lifesight_applied_ai_engineer.tex` has not been compiled or visually inspected, so `/apply` Step 5 is incomplete. There is **no local LaTeX on this machine** and Docker Desktop was not running. Once Docker is up, compile with a texlive container (lualatex, not pdflatex — pdflatex fails on fontawesome5), then run the mandatory checks:

- CV must be **exactly 2 pages**
- No orphaned `\cventry` titles (a job title alone at the bottom of a page with its bullets overflowing)
- Then ATS-verify: `pdftotext -layout`, confirm email and phone appear as literal text, reading order matches visual order, no `(cid:*)` or `�` markers. `tools/ats_check.py` exists for this.
- Delete the `.aux`/`.log`/`.out` artifacts and the extracted `.txt` afterwards

The cover letter is the **plain-text variant** (`cover_letters/cover_lifesight_applied_ai_engineer.txt`, 199 words) — chosen deliberately because Lifesight is a 130-person AI-first startup applying via LinkedIn whose posting closes with "we'd rather see something you've built than a polished resume." There is no cover-letter PDF and there was never going to be one. Do not treat its absence as a failure or try to compile it.

## Judgment calls already made — do not silently reverse them

- **MCP is a real gap and is left visible.** The posting names MCP five times; Sahil has never shipped an MCP server. The reviewer suggested adding "Model Context Protocol (MCP) tooling via Claude Code" to the CV skills line and I rejected it — nothing in the profile supports it. The cover letter names the gap directly instead. If Sahil confirms he actually runs MCP servers inside Claude Code, that becomes addable, and it should be written into `01-candidate-profile.md` at the same time.
- **"tool-call correctness checking"** was also rejected off the CV skills line for the same reason.
- **The "5 years" claim was split.** The CV now reads "5 years across software and applied AI engineering, the last two-plus taking LLM and agentic systems from POC to production." His AI work starts Mar 2024. **The master CV (`cv/main_example.tex`) still carries the unsplit "5 years" phrasing and should be fixed the same way** — this posting's "3-6 years in ML/AI engineering" is exactly the claim an interviewer probes.
- Company claims in the letter (Lifesight's Skills library, MCP launched Jun 2026) were verified independently via search, not from links inside the posting.

## Live risk worth raising before he applies

The Lifesight posting is tagged **Associate seniority with no compensation stated**, and LinkedIn reports **over 200 applicants** on a 2-day-old listing. Against a ₹25 LPA *fixed* floor and an already-accepted auxoai backup offer, comp is the live question on this one, not fit. A referral is worth more than a better cover letter here.

## Standing context

- Sahil is on notice, LWD 12 Oct 2026, and holds an accepted backup offer (auxoai, 27 Aug 2026) that sits below his pay floor. He is negotiating from a floor, not a deadline.
- Never anchor to current CTC. Indian offers quote total CTC; his floor is on **fixed** pay only.
- `salary_data.json` does not exist, so the salary-benchmark step is skipped everywhere.
- Any agentic-coding or AI-tooling mention in a CV or cover letter must name **Claude Code** explicitly.
- Any fact Sahil confirms in conversation must be written into `.claude/skills/job-application-assistant/01-candidate-profile.md` in the same turn, or a later session will strip it from drafts as unsupported.

## Suggested next actions, in order

1. Start Docker, compile and inspect the Lifesight CV, run the ATS check.
2. Offer referral outreach for Lifesight (`09-referral-outreach.md`) — highest-leverage step given 200+ applicants.
3. Log it with `/outcome Lifesight` once submitted.
4. Re-run `/rank` to clear the 96 unranked postings.
5. Then `/apply` on DotKonnekt (85), Kayzen (85, remote-India and the only one that is), or SuprSend (83).
