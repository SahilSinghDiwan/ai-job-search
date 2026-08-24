---
framework_version: 1.3.0
---

# Job Evaluation Framework

<!-- SETUP: Skill match areas and career goals are personalized by running /setup -->

## Eligibility Gate — run before scoring

If the candidate is not a citizen or permanent resident of the country they are applying in, run this first. It is a hard filter, not a scoring dimension, and it is separate from work-permit *timing*: timing asks "can they work the required hours yet?", eligibility asks "are they permitted to hold this job at all?". A candidate can pass timing and still be categorically excluded.

Read the posting's eligibility / work rights / "who can apply" section **verbatim** and classify:

| Posting wording | Verdict |
|-----------------|---------|
| Names a **citizenship or permanent-residency requirement** ("must be a citizen of X", "permanent resident", "PR required", "full working rights" where the employer means citizen/PR) | **FAIL — hard stop.** Do not score, do not draft. Quote the exact wording back to the user. |
| Requires a **security clearance** at any level | **FAIL** in most countries, since clearance is normally gated on citizenship. Verify the specific scheme rather than assuming. |
| **Explicitly names** the candidate's permit class, or says "international applicants welcome", "visa holders considered", "we sponsor" | **PASS** — verified acceptance. Worth noting as a positive in the application. |
| **Silent** on citizenship or residency | **PROCEED, but mark unverified.** Check the employer's own careers or international-applicant page before drafting. |

**Two rules that are easy to get wrong:**

1. **Silence is not permission.** Large graduate programs frequently gate eligibility on their own website rather than in the job ad. Highest-risk categories: professional-services firms, government and defence, banking, telecommunications, and anything touching critical infrastructure.
2. **A company-wide "we accept international applicants" statement is not role-level permission.** The common pattern is a general welcome followed by a *named list* of the specific programs or service lines it covers. Confirm the **specific posting or stream** appears on that list before drafting.

**Report an eligibility failure to the user with the quoted source** rather than silently dropping the role. They may know something about their own status that the profile does not record.

### Remote roles: residency and work authorization

The framing above — "if the candidate is not a citizen or permanent resident of the country they are applying in" — already covers remote postings *logically*, because a "Remote — US" role is still a job in the US. But the gate never names the remote case, so in practice it gets skipped: nothing in the posting looks like a visa question, the location field says "Remote", and the role sails through to dimension 4, which used to score every remote posting as a clean PASS. That is the failure mode this sub-gate exists to close. A large share of postings advertised as "remote" are remote *within a single country*, and for a Bengaluru-based candidate those are not opportunities at all — they are a hard fail dressed up as a global one.

So for any posting whose location is remote, hybrid-remote, or "distributed", read the location, eligibility, and "who can apply" lines **verbatim** and classify before scoring:

| Posting wording | Verdict |
|-----------------|---------|
| Scopes remote work to a **country or region the candidate does not live in and has no right to work in** ("Remote — US", "Remote (EMEA)", "must reside in the EU", "US-based candidates only", "anywhere in Canada") | **FAIL — hard stop.** Do not score, do not draft. Quote the exact line. This is the single most common way a hopeless posting reaches the drafting stage. |
| States a **work-authorization requirement** the candidate cannot meet ("must be authorized to work in the US without sponsorship", "must hold existing UK right to work", "no visa sponsorship available" on a country-scoped role) | **FAIL — hard stop.** Quote the line. |
| Scopes remote work to a **state, province, or list of states** within a country the candidate cannot work in ("remote in any of our 12 registered states") | **FAIL.** The narrower list is strictly worse than the country-level version. |
| Says **"remote — India"**, "remote (APAC)", names India in the eligible list, or the employer already has an Indian entity or GCC the role would sit under | **PASS** — verified. Worth naming as a positive in the application. |
| Says **"fully remote, work from anywhere"**, "globally distributed", "we hire in 40+ countries", or explicitly says it hires via an employer of record | **PASS** — but confirm on the employer's own careers or "how we hire" page that India is actually on the eligible-country list. Companies that hire "anywhere" usually mean *anywhere their payroll provider operates*, which is a shorter list than it sounds. |
| **Silent** on geography — location reads only "Remote" with no country, no eligible-country list, no authorization line | **PROCEED, but mark unverified.** Silence is not permission here either. Check the careers page, the ATS location field (which is often stricter than the ad copy), and any "benefits" section that quietly lists a single country's healthcare or 401(k). Report the role to the user as geography-unconfirmed rather than as a clean pass. |

**Engagement mechanism — extract, report, do not score.** Even when a company genuinely hires in India, the *mechanism* varies enormously and postings often say which. The three you will see are: **employer-of-record (EOR)** employment through a provider such as Deel or Remote.com; direct employment on an **Indian subsidiary / GCC payroll**; and **independent-contractor** engagement. They differ substantially in benefits, tax handling, notice protections, and stability — a contractor engagement with no PF, no gratuity, and 30-day termination is a very different proposition from an Indian-entity offer at the same headline number, and the difference belongs in front of the user before they invest a week in the application. Extract whichever the posting names, report it verbatim in your notes for dimension 4, and where the posting is silent, say so explicitly rather than guessing. Do not turn this into a score — it is information the candidate weighs, not a fit signal you can rank.

If the candidate's permit also constrains *hours* or *start date* (a student visa with a term-time cap, a permit that begins on graduation), record that as a second gate under this section during `/setup`, with the specific dates. Do not merge it with the eligibility question above — they fail for different reasons and need different answers.

A role that fails this gate is not scored and not drafted. Everything below applies only to roles that pass it.

## Language Gate — run before scoring

No dimension or gate anywhere in this framework currently checks a posting's language requirements against what the candidate actually speaks - it is not one of the six Scoring Dimensions below, not a field `/scrape` or `/rank` track, and not something `/apply`'s language detection (Step 1, which already extracts a posting's required language generically) has anywhere to report to. This gate adds that check, structured the same way as the Eligibility Gate above: read the posting, classify against profile data, and treat a hard mismatch as FAIL before scoring.

Read the posting's language requirements as stated for **the role itself** — not the language the ad happens to be written in. A posting written in a language you don't work in, for a role that only needs languages you do work in on the job, passes fine; only an explicit job-condition requirement ("fluent X required," "must communicate with the Y team in Z") triggers this check. For each language the posting requires as a job condition, compare it against your Languages table in CLAUDE.md / `01-candidate-profile.md`:

| Posting requirement vs. your Languages table | Verdict |
|---|---|
| Requires a language **not on your table at all** (e.g. "fluent Polish required," "must communicate with the Warsaw team in Russian," and you list no Polish/Russian row) | **FAIL — hard stop.** Do not score, do not draft. Quote the exact requirement line. |
| Requires a language you **do** list, but the posting's stated bar (as written — "fluent," "native," "C1+," "business-level") reads as plausibly **higher** than your declared level | **FLAG, then proceed.** Not a fail. Score and draft normally, but surface the gap explicitly in your report to the user (quote both the posting's requirement and your declared level) so they can judge it themselves — bars like "fluent" vary a lot by company and geography, and a recruiter may be flexible. Never silently drop the posting and never silently treat it as a clean pass. |
| Requires a language you list, at or below your declared level (or the posting doesn't specify a level at all — just names the language) | **PASS.** No note needed. |

Judge the level comparison the same way you judge everything else in this framework: read both sides as written and reason about it, don't force either into a rigid scale — CEFR letters, LinkedIn-style buckets ("professional working proficiency"), and plain-English words ("conversational," "fluent," "native") all appear in the wild and don't map onto each other precisely. When genuinely unsure whether a stated bar exceeds the candidate's level, prefer FLAG over a silent PASS — the human is meant to be the tiebreaker, not the gate.

**Worked example:** a candidate whose Languages table lists Spanish (Native) and English (B1/B2). A posting requiring "fluent Russian" → **FAIL**, Russian isn't declared at all. A posting requiring "fluent English" → **FLAG**, English is declared but "fluent" plausibly exceeds B1/B2 — score and draft the application, but tell the candidate this posting's bar may be a stretch and let them decide. A posting requiring "conversational English" or unspecified English → **PASS**, B1/B2 clears a "conversational" bar cleanly.

## Scoring Dimensions

Evaluate each job posting against these six dimensions:

### 1. Technical Skills Match (0-100)
How well do the required/preferred skills align with the candidate's capabilities?

| Score | Meaning |
|-------|---------|
| 80-100 | Core requirements are primary skills |
| 60-79 | Most requirements match, 1-2 gaps that are learnable |
| 40-59 | Partial match, significant upskilling needed |
| 0-39 | Fundamental mismatch |

**Strong match areas:** RAG & hybrid retrieval, LLM integration, prompt engineering & guardrails, agentic systems, LangChain/LangGraph, Python, vector search (FAISS/Milvus/ChromaDB/Elasticsearch), production GenAI on Kafka/Kubernetes/Airflow
**Moderate match areas:** FastAPI/Flask backends, microservices, PyTorch/model fine-tuning, Playwright/LLM test generation, Azure/AWS/GCP, Docker/Helm, MongoDB/MySQL
**Weak match areas:** deep classical ML/DS research, large-scale MLOps platform ownership, formal DSA/competitive-programming depth (prep for big-tech loops), non-Python primary stacks (Java/Go/C++ heavy backends)

### 2. Experience Match (0-100)
Does work history align with what they're looking for?

| Score | Meaning |
|-------|---------|
| 80-100 | Direct experience in the same domain and role type |
| 60-79 | Related experience, transferable skills clear |
| 40-59 | Adjacent experience, would need to make the case |
| 0-39 | Unrelated experience |

**Strong:** AI/GenAI Engineer, LLM/Applied AI Engineer, RAG/retrieval engineering, agentic developer tooling, production GenAI (POC → production at scale)
**Moderate:** ML Engineer, AI Platform Engineer, backend engineer on AI products, LLMOps
**Entry-level:** classical data science / research scientist, large-team big-tech SWE loops (transferable but not a direct match)

### 3. Behavioral/Culture Fit (0-100)
Does the role and company culture match the behavioral profile?

| Score | Meaning |
|-------|---------|
| 80-100 | Culture strongly matches behavioral preferences |
| 60-79 | Mixed signals but mostly compatible |
| 40-59 | Some friction areas |
| 0-39 | Significant culture mismatch |

**Red flags to research:** Department disorganization, work dominated by maintenance over development, poor chemistry with leadership, culture mismatches. Check reviews, media coverage, LinkedIn connections, and network contacts for insider perspective.

### 4. Location & Logistics (Pass/Fail + Notes)

This dimension stays pass/fail plus notes — it is not scored and not weighted. Anything that would be a *categorical* bar on holding the job (remote scoped to a country the candidate cannot work in, a work-authorization requirement he cannot meet) has already been caught by the Eligibility Gate's remote sub-gate above and never reaches here. What is left for this dimension is the physical and practical shape of the job: where the work happens, when it happens, and how the candidate would be engaged.

**Where:**

| Situation | Verdict |
|-----------|---------|
| Bangalore-based, on-site or hybrid | **PASS** |
| Remote, with India confirmed eligible (or genuinely work-from-anywhere, verified per the gate above) | **PASS** |
| Remote, geography unconfirmed after checking the careers page | **FLAG** — carry the gate's "unverified" note through to the report; do not quietly upgrade it to PASS |
| Requires relocation outside Bangalore | **FLAG** — not a hard deal-breaker for the right AI role, per the profile. Discuss with the user |
| Frequent international travel | **FLAG** — discuss with the user |

**When — timezone overlap.** IST is UTC+5:30, which puts it roughly 12.5 hours ahead of US Pacific, 9.5 ahead of US Eastern, 4.5 ahead of the UK, and 3.5 ahead of Central European time. That arithmetic is the whole point: a US-Pacific team's 10:00 standup is 22:30 in Bengaluru, and a "small overlap requirement" written casually by a San Francisco hiring manager can mean a permanently nocturnal working life. This is a genuine quality-of-life constraint, not a footnote, and it is invisible unless you compute it explicitly. So read the posting for core-hours, standup-time, on-call, or "overlap" language and convert it into IST before judging it:

| Posting wording | Verdict |
|-----------------|---------|
| Mandates **full US business hours** ("9-5 PT", "must work Eastern business hours", "core hours 9am-6pm ET") | **FAIL.** For a Bengaluru-based candidate this is a permanent night shift, not an overlap requirement, and no amount of enthusiasm makes it sustainable. Quote the line and say what it maps to in IST. |
| Requires a **partial overlap** with US hours ("4 hours overlap with PT", "available until 11am PT", "attend a daily standup at 9am ET") | **FLAG, then proceed.** Compute and state the IST window (4 hours of PT-morning overlap lands roughly 20:30-00:30 IST; a 9am ET standup is 18:30 IST). Score and draft normally, but put the converted window in front of the user so they judge it rather than discovering it at offer stage. |
| Requires overlap with **UK or European** hours | **FLAG (mild), then proceed.** A 3.5-4.5 hour offset means a European working day maps to roughly early-afternoon-to-late-evening IST — workable, but say so in the notes rather than leaving it implicit. |
| Asynchronous, "work when you want", or overlap with **APAC/India** hours | **PASS.** No note needed. |
| **Silent** on hours for a global-remote role | **FLAG as unknown.** Do not assume async. Add it to the list of questions for the recruiter call (see "Pre-Application: Call the Employer" below) — it is exactly the kind of substantive question that justifies picking up the phone. |

**How — engagement mechanism.** Report, in this dimension's notes, whichever of EOR / Indian-entity payroll / independent contractor the posting names, quoted where possible, and say "not stated" where it is not. See the Eligibility Gate for why this matters and why it is reported rather than scored. Where it is not stated and the role is otherwise strong, it is a good recruiter-call question, and it interacts directly with dimension 6 — a contractor rate and a CTC are not comparable numbers.

### 5. Career Alignment & Motivation (0-100)
Does this role advance career goals and contain tasks that energize?

| Score | Meaning |
|-------|---------|
| 80-100 | Strongly aligned with career direction, clear growth path |
| 60-79 | Good role but only partially aligned with long-term goals |
| 40-59 | Decent job but doesn't build toward career goals |
| 0-39 | Dead end or backwards step |

**Career goals:**
- Land a market-rate AI/GenAI Engineer role in the ₹25-40 LPA fixed-CTC band (band-based, never anchored to current CTC)
- Work at the AI frontier - agentic developer tooling, RAG/retrieval, LLMOps - shipping to production
- Prefer global-remote (USD) / funded-product / AI-first startups; GCC/big-tech and banks opportunistic

**Motivation filter:** Evaluate not just whether you *can* do the tasks, but whether the tasks will *energize* you. Consider:
- Tasks that energize: building LLM/RAG and agentic systems POC → production, hard retrieval problems, greenfield build, shipping and operating real systems
- Tasks that drain: maintenance-heavy/legacy support, notebook-only prototyping with nothing shipping, process-heavy approval-gated work
- Non-task factors: leadership style, degree of autonomy, remote/async flexibility, whether the company is genuinely at the AI frontier

**Life situation alignment:** Consider personal constraints:
- **Security**: Currently on notice (LWD 12 Oct 2026) with ~2-3 months runway past that; wants an accepted offer around mid-to-late Nov 2026. Current CTC is well below market - do not anchor to it.
- **Flexibility**: Bengaluru-based; open to on-site/hybrid in Bangalore or global remote. Relocation negotiable for the right role.
- **Professional development**: Growth toward more architectural/agentic-AI ownership; staying at the AI frontier is a durable priority.

### 6. Salary Benchmark (Optional)

If the salary lookup tool is configured (`salary_data.json` exists), look up the company:
```
python salary_lookup.py "<Company Name>" --json
```

If a city is known from the posting, add `--city "<City>"` to narrow results.

The tool supports two data shapes, and the file's `metadata.mode` tells you which one you are holding. In `index` mode the numbers are relative to a baseline where 100 is the median and higher means better-paid — interpret them against the baseline described in the metadata. In `absolute` mode the numbers are real money: `metadata.currency` and `metadata.unit` name the units (for the Indian market, INR and LPA — lakhs per annum), and each company's category carries `fixed_lpa`, `variable_lpa`, `esop_lpa`, and `total_ctc_lpa`, along with a `count` of how many data points back it. Populate that file from **AmbitionBox** (broad coverage of Indian employers, including services firms and GCCs) and **levels.fyi** (better for product companies, big tech, and roles quoted with meaningful equity). Read `metadata.baseline_description` before interpreting anything — a band stated for "AI/GenAI engineers, 3-5 yrs, Bengaluru" says nothing useful about a staff role in Hyderabad.

**The thing you must get right: Indian offers are quoted as total CTC, and the candidate's floor is on fixed pay.** An Indian offer letter's headline number is *cost to company*, and it bundles together several things that are not the same as salary: the fixed component that actually arrives every month, a variable or performance component that is contingent and often only partly paid out, ESOPs valued at a notional per-share price that may never become cash, and sometimes gratuity, PF employer contribution, and insurance premiums loaded in to inflate the total. Sahil's deal-breaker in CLAUDE.md is a **fixed** compensation floor of roughly ₹25 LPA, with a target band of ₹25-40 LPA fixed. These two facts collide constantly: a proudly quoted "₹40 LPA CTC" can decompose into ₹24 fixed + ₹6 variable + ₹10 ESOP and land *below* the floor, and a candidate who compares headline to floor will conclude the opposite of the truth.

So never compare a headline CTC against the band. Decompose first:

| Posting or benchmark states | What you do |
|---|---|
| A full split (fixed / variable / ESOP named separately) | Compare **fixed only** against the ₹25-40 LPA band. Report the other components separately as upside, not as salary. |
| A single CTC number with no split | **Do not assume it is all fixed.** State plainly in your report that the split is unknown, give the range the fixed component could plausibly occupy, and flag it as a question for the recruiter. An unknown split is a finding, not a gap to paper over. |
| A range ("₹30-45 LPA") | Assume nothing about where in the range an offer lands, and apply the same fixed-vs-CTC decomposition to both ends. |
| Nothing at all (most postings) | Fall back to the benchmark file for the company and category, and label the result as market data about the employer, not as this role's offer. |
| A **contractor rate** or an EOR-quoted figure (see dimension 4) | Say explicitly that it is not comparable to CTC — there is no PF, gratuity, or employer-side loading inside it — and do not silently convert it into an LPA-equivalent as if it were. |

Present findings as:
```
### Salary Benchmark
_Source: <metadata.source>; baseline: <metadata.baseline_description>_

| Component | Value | vs. band (₹25-40 LPA fixed) |
|-----------|-------|------------------------------|
| Fixed | ₹XX.X LPA | above / within / below / **unknown** |
| Variable | ₹X.X LPA | (upside, not counted toward the floor) |
| ESOP (notional) | ₹X.X LPA | (upside, not counted toward the floor) |
| Other (gratuity/PF/insurance loading) | ₹X.X LPA | (not counted toward the floor) |
| **Total CTC** | **₹XX.X LPA** | headline figure only — do not compare to the floor |

_Data points: N. Split stated by employer / inferred from benchmark / **unknown**._
```

Fill "unknown" honestly wherever the data does not support a number — an empty cell that reads as zero is worse than a cell that says the split was never disclosed. For `index`-mode data, keep the older presentation (category index and overall index against baseline, higher meaning above-market) rather than forcing index numbers into the decomposition table above; they do not decompose.

If the salary tool is not configured, skip this section.

## Output Format

Present the evaluation as:

```
## Job Fit Evaluation: [Role] at [Company]

| Dimension | Score | Notes |
|-----------|-------|-------|
| Technical Skills | XX/100 | [brief note] |
| Experience Match | XX/100 | [brief note] |
| Behavioral Fit | XX/100 | [brief note] |
| Location | PASS/FAIL | [brief note] |
| Career Alignment | XX/100 | [brief note] |

**Overall Score: XX/100** (weighted average of scored dimensions)

### Verdict: [Strong Fit / Good Fit / Moderate Fit / Weak Fit / Poor Fit]

### Key Strengths for This Role
- [bullet points]

### Gaps to Address
- [bullet points]

### Recommendation
[1-2 sentences: apply/skip/apply with caveats]

### Company Research Checklist
- [ ] Checked company website (mission, values, recent news)
- [ ] Checked review sites (AmbitionBox, Glassdoor India, LinkedIn; Blind for tech/GCC roles)
- [ ] Checked LinkedIn for team size, recent hires, connections
- [ ] Checked media for restructuring, growth, or workplace issues
- [ ] Identified network contacts who may know the team/manager
```

## Weighting
- Technical Skills: 30%
- Experience Match: 25%
- Behavioral Fit: 15%
- Career Alignment: 30%

(Location is pass/fail, not weighted)

## Thresholds
- **Strong Fit** (75+): Definitely apply, tailor everything
- **Good Fit** (60-74): Apply, address gaps in cover letter
- **Moderate Fit** (45-59): Consider carefully, discuss with user
- **Weak Fit** (30-44): Probably skip unless strategic reasons
- **Poor Fit** (<30): Skip

## Pre-Application: Call the Employer (Best Practice)

Before writing the application, consider whether the candidate should call the contact person listed in the posting. **Only call if there are substantive questions** - never call just to "be remembered."

### When to Suggest Calling
- The posting has unclear or ambiguous requirements
- It's unclear which competencies are essential vs. nice-to-have
- The role description is vague about day-to-day tasks
- There's a named contact person who invites questions

### Good Questions to Ask
- "What are the primary challenges in this role?"
- "How is time typically divided across the listed responsibilities?"
- "Which competencies are most critical for success in this position?"
- "What does success look like in the first 6-12 months?"

### Rules for the Call
- Prepare a 30-second "elevator pitch" about your background in case they ask
- The call's purpose is **gathering information**, not delivering a pitch
- Take notes - use what you learn to tailor the application
- Reference the conversation naturally in the cover letter ("After speaking with [name], I was especially drawn to...")
