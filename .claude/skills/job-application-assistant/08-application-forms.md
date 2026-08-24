---
framework_version: 1.1.0
---

# Application Form Fields

`/apply` produces two artifacts: a CV and a cover letter. Many applications need a **third** — free-text fields typed directly into an application portal. Graduate programs, large-employer ATS systems and startup forms routinely ask for things neither document covers, under a character or word limit, in a box with no formatting.

This file governs that third artifact. It is not a document you compile; it is text the candidate pastes.

## When this applies

Trigger it whenever a posting or portal asks for any of:

- A self-introduction / personal statement / "tell us about yourself" paragraph
- Structured project entries (project name, role, start and end date, description)
- A short pitch under a hard character limit ("stand out in 140 characters", "why you, in one sentence")
- Motivation questions ("why this company", "why this program")
- Competency questions with a word cap ("describe a time you…", 200 words)
- **Current CTC, expected CTC and notice period** — the three boxes Naukri, Instahyre, and effectively every Indian ATS and recruiter email demand. They are short fields, but they are the highest-stakes text on the form: what goes in them sets the anchor for the entire negotiation, and a blank mandatory field can auto-reject the application before a human sees it

## The rule that governs everything here

**Every claim in a form field must already be defensible from the same sources the CV and cover letter are grounded against** — the union of `01-candidate-profile.md`, the master CV (`cv/main_example.tex`), and `CLAUDE.md`'s Candidate Profile section, with a claim grounded if ANY of the three supports it. The interviewer reads the form alongside the CV. A form field is not a place to introduce new claims, inflate scope, or fill space — it is a place to *select* from what is already true and arrange it for the question asked.

All accuracy rules from `05-cv-templates.md` and `03-writing-style.md` apply unchanged.

## Field type: self-introduction paragraph

Usually 100–200 words, one paragraph, no formatting.

**Structure that works:**
1. Current status — what they are doing or completing now
2. The single strongest piece of evidence, with its number and scale
3. One line of trajectory: how they got here, if a pivot or specialisation is genuinely interesting
4. What they want next, connected to this employer's actual work

**Rules:**
- **Lead with the strongest evidence, not chronology.** A career history told in order buries the best material when the strongest work is recent.
- **Write one version per role type, not one for all applications.** The same history framed for a backend role and a data role are different paragraphs. Produce both, label them, and say which goes where.
- **Tie it to this employer in the final sentence.** Generic self-introductions are the default and read as such.
- **Count the words and state the count.** Portals truncate silently. Supply a trimmed variant and name which sentence to cut first.

## Field type: structured project entries

Typically **project name, role, start date, end date, description.**

**Project name.** Give the project a descriptive name, not the employer's name — "Warehouse Inventory Forecasting Platform" is a project, "Acme Corp" is an employer. Where a client is more recognisable than the employer, name the client only if the relationship is truthful (placed on-site with, delivered to).

**Role.** The candidate's role *on that project*, which may be narrower than their job title. Do not upgrade it.

**Dates.** The dates they worked on **that project**, which are not automatically the employment dates. If a role spanned two years but the named project occupied the later part, saying so is both more accurate and avoids the low-output reading described in `05-cv-templates.md` ("Check tenure against visible output"). Only narrow the dates when the candidate can say when the project actually started — never invent a boundary to improve the ratio.

**Description.** 100–150 words: what the system did and who used it, then the hardest technical problem and how it was solved, then the outcome with its number. Supply a **~60-word short version** as well; portals vary and the candidate should not have to improvise a cut.

**Scope discipline is stricter here than on a CV.** A CV bullet can be terse enough to be ambiguous about ownership. A project entry with the candidate's name and role attached reads as ownership of the whole thing. Where they contributed rather than owned, say so inside the description.

## Field type: hard character limits

These reward **a specific situation over an adjective**. Most applicants submit adjectives — "passionate", "fast learner", "team player" — so a concrete situation stands out by contrast.

**Method:**
1. Pick the single most distinctive true thing: usually a number, an unusual combination of backgrounds, or a problem shape that maps onto the employer's own work.
2. Draft 4–6 candidates at different angles.
3. **Count characters programmatically. Do not estimate.** Over-limit text is truncated mid-word.
4. Present all candidates with counts, recommend one, and say why.

Prefer the version that **maps the candidate's problem onto the employer's problem**, where a truthful mapping exists. That is what "stand out" is actually asking for.

## The compensation and availability fields (India)

`07-interview-prep.md` already holds the *verbal* strategy for the CTC question: deflect to the band, never anchor on the current number, target the ₹25–40 LPA **fixed** band, keep the ~₹25 LPA walk-away floor private. Everything below stays consistent with that and does not replace it.

But a form field is a different problem, and treating it as "the verbal answer, typed" gets the candidate into trouble. In conversation there is a person to redirect, a sentence of context to add, and a chance to ask what the band for the role is before naming a number. A form box has none of that. It is frequently **numeric-only**, frequently **mandatory**, and frequently **parsed by a filter before any human reads it** — so "I'd rather discuss the band" is not always an available move, and leaving it blank is not neutral: on Naukri and most ATS flows it either blocks submission or drops the application out of the recruiter's filtered view entirely. These sections give the paste-ready answer for each shape of field.

**Before drafting any of these, get the actual current CTC figure from the user.** It is deliberately not recorded in `01-candidate-profile.md` or `CLAUDE.md`, and it must never be guessed, estimated from market data, or inferred from a previous draft. If the user has not supplied it in this conversation, ask. Do not write a number into a form field that the user did not state.

## Field type: current CTC

**Free-text box.** Deflect in writing, in one line. Portals that accept text here are the easy case:

> Open to discussing compensation against the role's band rather than my current number. Targeting ₹25–40 LPA fixed.

**Mandatory numeric field, no text option.** This is a genuine judgment call with real downside on both sides, and it should be presented to the user as one rather than decided silently.

- Entering the **true current CTC** is honest and verifiable, and its cost is real: the number becomes the recruiter's anchor for the whole negotiation. Indian recruiters routinely construct an offer as a percentage hike on the disclosed current CTC rather than against the role's band, and a below-market current number caps the offer before the first conversation happens.
- Entering the **expected band figure** in the current-CTC box removes that anchor, and it is a widespread workaround. It is also a misstatement of a fact the employer will verify. Indian offers are followed by document collection and background verification — salary slips, Form 16, the previous offer letter, and third-party BGV agencies — so the real number surfaces, typically *after* the offer is extended and at the point where withdrawing it is cheapest for the employer. This is a dishonesty problem first and a practical one second, and the practical cost is losing an offer that had already been accepted, late enough that other processes have been declined.

**Recommended approach, in order — take the first one the portal allows:**

1. **Look for a text escape before accepting the constraint.** Many portals label the field "Current CTC" but pair it with a "Remarks", "Additional information" or "Notes to recruiter" box; some accept a range; some make the field optional despite the asterisk. Fill the numeric field's requirement and put the deflection line in the adjacent text.
2. **Where the portal accepts a null marker** — `0`, or an empty field that still submits — use it. `0` is a "not disclosed" flag rather than a false claim, and recruiters read it that way. The tradeoff is that a filter set on a minimum CTC may drop the application, so use this on direct applications and portals where a human triages, not on bulk-filter job boards.
3. **Otherwise enter the true current fixed CTC**, and neutralise the anchor at the first human contact rather than in the box: in the covering email, the "anything else" field, or the first recruiter call, state the band explicitly (the `07-interview-prep.md` line). The anchor is weakened by the band being on the record early, not by the box being wrong.

**Never enter a fabricated figure.** There is no version of this that is worth the offer.

Whichever route the form forces, add a `NOTE TO SELF` block recording exactly what was entered and where, so the verbal answer in the interview does not contradict the form.

## Field type: expected CTC

**Always the band, never a single number, and always labelled `fixed`.**

Indian offers bundle fixed salary, variable/performance pay, joining bonus and ESOP value into one headline "CTC" figure. An unqualified expectation is read as **total** CTC by default, so "₹25 LPA" gets constructed as roughly ₹18–20 LPA fixed plus variable and paper equity — below the walk-away floor, offered in good faith, and awkward to reopen. The qualifier is not pedantry; it is the difference between the band meaning what it says and the band landing under the floor.

**Free-text box:**

> ₹25–40 LPA fixed (excluding variable and ESOP), depending on scope and level. Happy to align on where this role sits in that range.

**Mandatory numeric field, single value:** enter the **top of the band**, not the middle and never the bottom. The number will be read as total CTC and negotiated downward from there, so a figure entered at the bottom of the fixed band arrives below the floor after the read-as-total discount and the standard negotiation haircut. Then state "fixed, excluding variable and ESOP" in the nearest available text field, the covering email, or the first recruiter contact.

**Never put the walk-away floor in a form field.** The floor is a private decision threshold, not an expectation. A floor that appears anywhere in writing becomes the number the offer is built to.

## Field type: notice period

The profile records the actual position: employed at Infobell IT Solutions, **on notice, with a last working day of 12 Oct 2026**. In the Indian market the norm is a 60–90 day notice period, and hiring managers routinely discount or deprioritise candidates who cannot start inside a quarter. A notice that is already being served is therefore a genuine differentiator, and it is one of the few form fields where the honest answer is also the competitive one. **Volunteer it; do not bury it in a field nobody expands.**

**Free-text box:**

> Currently serving notice. Last working day 12 Oct 2026, available to join immediately after.

**Mandatory numeric field ("notice period in days"):** enter the days remaining until 12 Oct 2026 counted from today's date, not the contractual 90. Recompute this every time — a figure copied from an earlier application is wrong by the number of days in between, and a stale number here is the kind of small inaccuracy that reads as carelessness when the dates are checked. If the field is a dropdown with fixed buckets, pick the shortest bucket that contains the remaining days and correct it in text elsewhere.

**Dropdown with only "Immediate / 30 / 60 / 90 days":** choose the bucket the remaining days fall into and add the exact last working day to the nearest text field, because "30 days" and "released on 12 Oct" are read very differently by someone building a start-date plan.

**Surface it beyond the field itself.** Put the availability line in the self-introduction paragraph's final sentence and in any "anything else we should know" box, and mention it in the plain-text cover letter where the posting raises start date or urgency (see `06-cover-letter-templates.md`). A served notice answers the objection the employer has not asked yet.

## Output format

Save to a plain `.txt` file the candidate can copy from, alongside their other application material for that employer. One file per employer, containing every field that employer asked for.

Include:
- A header naming the employer and the roles it covers
- Each field, labelled, with word or character counts stated
- Short variants where limits may be tighter than expected
- **`NOTE TO SELF` blocks** for scope reminders and prepared answers to questions the content invites — clearly marked as *not for pasting into the form*
- A dates quick-reference, so date fields stay consistent without re-deriving them
- A **compensation and availability quick-reference** where those fields were asked for: exactly what was entered in the current-CTC field and by which of the three routes, the expected-CTC band with its `fixed` qualifier, and the notice-period figure with the date it was computed from. These are the fields most likely to be contradicted in a later conversation or a later application, and the only defence is having written down what was actually submitted

## Verification before handing it over

- [ ] Every factual claim traces to the union of `01-candidate-profile.md`, the master CV (`cv/main_example.tex`), and `CLAUDE.md`'s Candidate Profile section
- [ ] No claim contradicts the CV or cover letter submitted for the same role
- [ ] Ownership scoped correctly on contributory work
- [ ] Word and character counts measured, not estimated
- [ ] In-progress qualifications described as in progress
- [ ] `NOTE TO SELF` blocks clearly marked as internal
- [ ] Any current-CTC figure entered is the **true** figure supplied by the user, or an agreed non-disclosure marker — never an invented or estimated number, and never the expected band presented as the current one
- [ ] Expected CTC stated as a band and explicitly qualified as **fixed**; the walk-away floor appears nowhere in the submitted text
- [ ] Notice period recomputed from today's date against the 12 Oct 2026 last working day, not copied from a previous application
