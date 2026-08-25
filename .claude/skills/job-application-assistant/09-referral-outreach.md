---
framework_version: 1.0.0
---

# Referral Outreach

A referral moves an application from the resume pile to a named human. In the Indian
market that gap is large: most companies run formal employee-referral programmes with
a bonus attached, so an employee forwarding a CV is doing something they are already
incentivised to do, not a favour you are extracting. This file governs how to find
those people and what to write to them.

It is the fourth `/apply` artifact, alongside the CV, the cover letter, and the
application-form fields in `08-application-forms.md`.

## The hard rule: you find and draft, the candidate sends

**Never send a connection request, InMail, message, or follow-up on the candidate's
behalf. Never click Connect. Never automate any LinkedIn action.** Produce the ranked
contact list and the drafted messages; the candidate reviews and sends each one
himself.

This is not squeamishness, and it is worth understanding rather than just obeying,
because the reasoning determines where the line sits:

1. **Account risk that dwarfs the upside.** LinkedIn's User Agreement prohibits
   automated activity, and automated connection requests are the single most common
   trigger for account restriction. LinkedIn is the candidate's highest-signal job
   source. Losing the account during an active search costs far more than any
   referral an automation could win.
2. **These are messages to real people, in his name.** A referral ask that reads as
   templated does not merely fail — it burns that contact permanently, and referral
   contacts at a given company are not a renewable resource. There is usually one
   good person to ask.
3. **He has context you do not.** A shared former colleague, a talk he attended, a
   repo he has actually read. The draft is a starting point he improves, not a
   finished artifact he rubber-stamps.

`/scrape` Step 4.5 already generates LinkedIn *search links* for this reason, and
Rule 7 in that file forbids programmatic people-search scraping. This file extends
that step; it does not overturn it.

**Reading people's profiles is different from acting on them.** Browsing LinkedIn
through the candidate's own logged-in session via `ego-browser` — reading a company's
people page, opening a profile, noting a title — is him using his own account, and it
is permitted here. Writing, connecting, and messaging are not. The boundary is
read versus write, not manual versus automated.

## Step 1: Find the people

Work from the company name on a posting the candidate is actually applying to. Never
build contact lists speculatively — a list assembled before there is a live
application is a list that goes stale before it is used.

Search LinkedIn for three categories, in this order of value:

| Category | Why they matter | What to search |
|---|---|---|
| **The hiring manager or team lead** | Can act on a CV directly rather than forwarding it | Company + the role's likely reporting line ("Engineering Manager, AI", "Head of ML") |
| **Engineers on the actual team** | Best referral conversion: they know the req, and the bonus is theirs | Company + the posting's stack ("LLM", "RAG", "MLOps") |
| **Recruiters / TA** | Lowest friction, lowest conversion — they receive these constantly | Company + "Technical Recruiter" / "Talent Acquisition" |

Prioritise, within each category:

- **Second-degree connections over third.** A shared connection is the single
  strongest signal available and makes the note write itself.
- **People who joined recently** (under ~18 months). They remember being on the other
  side of it and refer more readily.
- **Alumni overlap** — C-DAC, G H Raisoni, or a shared employer.
- **People who post publicly about the candidate's domain.** They have demonstrated
  interest in the topic he would write to them about.

Record for each: name, exact title, tenure, degree of connection, the specific hook,
and the profile URL. **If there is no genuine hook, say so** rather than manufacturing
one — "no specific hook found, generic note" is honest and lets the candidate decide
whether to spend the ask.

## Step 2: Draft the note

LinkedIn connection requests cap at **300 characters**. That cap is the whole design
problem: there is room for exactly one specific thing, so it must be the right one.

**Structure that works:**
1. The hook — the specific, true reason it is *this* person (one clause).
2. What he does, in the narrowest true framing that matches their team.
3. The ask, small and concrete.

**Rules:**
- **Count characters programmatically. Do not estimate.** Over-limit text is silently
  truncated mid-word, which is worse than a shorter note.
- **Name the role and its req ID** where the posting has one. "I applied to X" is
  actionable; "I'm interested in opportunities" is not.
- **Ask for something small.** "Would you be open to a quick chat about the team?"
  converts better than "Could you refer me?" — the second asks a stranger to stake
  their reputation in the first message.
- **One metric, maximum.** He has strong numbers (20 → 200+ SREs, ~70% reduction in
  time-to-find, recall ~30% → ~80%). Pick the one that maps to *their* work. All
  three in 300 characters reads as a brag sheet.
- Every claim must be grounded in the same sources the CV is grounded against —
  `01-candidate-profile.md`, `cv/main_example.tex`, and `CLAUDE.md`'s Candidate
  Profile. All accuracy rules from `03-writing-style.md` apply unchanged, including
  the ban on em-dashes and on unverified company claims.
- **Write a distinct note per person.** If two drafts are interchangeable, the hook
  was not specific enough. Go back to Step 1.

Also draft the **follow-up message** to send if they accept the connection — the
longer one where the actual referral ask lives. Connection requests get accepted and
then forgotten; the follow-up is where the conversation really starts, and having it
pre-written is what makes the candidate actually send it.

## Step 3: Hand it over

Output a plain-text file alongside the other artifacts for that employer, containing
per contact: name, title, profile URL, why this person, the connection note with its
character count, and the follow-up draft.

Add a **send order** and a pacing note. A burst of requests to one company on one day
reads as a campaign to both the recipients and to LinkedIn. Two or three, spaced over
a few days, starting with the strongest hook.

## Verification before handing it over

- [ ] Every contact is a real person found on a real profile, with the URL recorded
- [ ] Every factual claim traces to the grounded sources; no claim contradicts the CV
      or cover letter for the same role
- [ ] Each note is genuinely distinct, with a hook specific to that person
- [ ] Character counts measured, not estimated, and every note is within 300
- [ ] Contacts with no genuine hook are labelled as such, not papered over
- [ ] A follow-up draft exists for each contact
- [ ] Nothing was sent, connected, or messaged by the agent
