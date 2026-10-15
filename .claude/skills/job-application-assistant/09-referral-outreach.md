---
framework_version: 2.0.0
---

# Application Outreach

An application that goes in through a form and nothing else is one row in an ATS. The
same application with four people told about it is a name somebody recognises. In the
Indian market that gap is large: most companies run formal employee-referral
programmes with a bonus attached, so an employee forwarding a CV is doing something
they are already incentivised to do, not a favour you are extracting.

This file governs who gets a message, what it says, when it goes, and how the
candidate is reminded. It is part of sending an application, not an extra.

## The four hard rules

1. **Outreach goes with every submitted application.** `/apply` does not offer it; it
   does it. An application with no outreach drafted is an unfinished application, and
   the final summary must say so in those words if a track could not be filled.
2. **Never send. You find and draft; the candidate sends.** Never send an email, a
   connection request, an InMail, a message or a follow-up on the candidate's behalf.
   Never click Connect or Send. Never automate any LinkedIn action. This holds even
   when a tool that can send mail is available in the session.
3. **A research agent runs before a word is written.** What to say to each person is
   decided from evidence about that person and that company, gathered by a research
   agent and then checked. No research notes, no drafts.
4. **Every message reads as written by a person.** It passes the mechanical gate
   (`python3 tools/outreach.py load`) and the read-aloud test below, or it is not
   handed over.

Rule 2 is worth understanding rather than just obeying, because the reasoning
determines where the line sits:

- **Account risk that dwarfs the upside.** LinkedIn's User Agreement prohibits
  automated activity, and automated connection requests are the single most common
  trigger for account restriction. LinkedIn is the candidate's highest-signal job
  source. Losing the account during an active search costs far more than any referral
  an automation could win.
- **These are messages to real people, in his name.** A note that reads as templated
  does not merely fail. It burns that contact permanently, and contacts at a given
  company are not a renewable resource.
- **He has context you do not.** A shared former colleague, a talk he attended, a repo
  he has actually read. The draft is a starting point he improves, not a finished
  artifact he rubber-stamps.

**Reading is different from acting.** Browsing LinkedIn through the candidate's own
logged-in session via `ego-browser` (a company's people page, a profile, a title) is
him using his own account, and it is permitted. Writing, connecting and messaging are
not. The boundary is read versus write, not manual versus automated. `/scrape` Step
4.5 generates LinkedIn *search links* for the same reason, and its Rule 7 forbids
programmatic people-search scraping. If no browser session is available, hand over
those search links, say which tracks are therefore unfilled, and stop there.

## The four tracks

Every application gets all four, in this order. The day is counted from the day the
application was submitted.

| Track | Who | Channel | First message |
|---|---|---|---|
| `careers_email` | The company's careers or talent-acquisition inbox | Email | Day 0 |
| `hiring_manager` | The hiring manager or team lead for this role | LinkedIn connection note (email only if they publish an address) | Day 0 |
| `engineer` | One or two engineers on the actual team | LinkedIn connection note | Day 2 |
| `recruiter` | A recruiter or TA partner at the company | LinkedIn connection note or InMail | Day 5 |

Why this order. The careers email costs no relationship and puts a human-readable
note next to the ATS record on the same day. The hiring manager can act on a CV
directly, so that note goes first among the people. Engineers convert best on
referrals (they know the req, and the bonus is theirs) but should not be the first
knock. Recruiters receive these constantly; they go last, by which time there may be a
name to mention.

**Spacing.** No two first LinkedIn messages to people at one company on the same day,
and at least two days between them. A burst reads as a campaign to the recipients and
to LinkedIn. `tools/outreach.py start` enforces this and moves anything that lands on
a weekend to Monday.

**Follow-ups.** One follow-up is drafted for every first message, due five days after
the candidate marks the first one sent. For a connection note, the follow-up is the
longer message that is sent only once they accept; if they have not accepted, it is
skipped, not sent as an InMail. For an email, it is a short reply in the same thread.
At most two follow-ups to any one person. When someone replies, everything queued for
them is closed.

**Where an address comes from.** A careers address is taken from the company's own
careers or contact page, reached from its official site, never from a URL inside the
posting text. A named person's email is used only if they published it themselves (the
posting, their own site, their public profile). **Never guess an address from a
pattern** such as `first.last@company.com`. If no careers address exists, say so in
the file and leave that track unfilled; do not invent one.

## Step 1: Find the people

Work from the company on a posting the candidate is actually applying to. Never build
contact lists speculatively. A list assembled before there is a live application goes
stale before it is used.

Within each track, prioritise:

- **Second-degree connections over third.** A shared connection is the strongest
  signal available and makes the note write itself. If the candidate knows the mutual
  connection well, an introduction beats a cold note: say so.
- **People who joined recently** (under about 18 months). They remember being on the
  other side of it and refer more readily.
- **Alumni overlap**: a shared university, training institute or former employer.
- **People who post publicly about the candidate's domain.** They have shown interest
  in the topic he would write to them about.

Record for each: name, exact title, tenure, degree of connection, the profile URL, and
whether the profile was opened or only seen on a search card.

## Step 2: Research (hard rule 3)

Spawn a research agent before drafting. In this repo that is `gemini-research-expert`;
any subagent with web search does the job. One run per application, covering:

- **The team and the work.** What this team ships, what it has said publicly in the
  last year (engineering blog, talks, release notes, open-source repos), and what the
  posting implies is hard for them right now.
- **Each named contact.** What they have published or said in public that connects to
  the candidate's actual work: a post, a talk, a repo, a paper. Public professional
  material only.
- **The channel.** Whether this company states how it wants to be contacted (many
  careers pages say "no emails" or name a referral process) and whether an employee
  referral programme is documented.

Then check it. **The agent's output is a lead, not a fact.** Every specific that will
appear in a message (a post's topic, a product name, a team's stack) must be opened
and read at a source you located independently, exactly as `03-writing-style.md` Rule 5
requires for cover letters. A message that cites a post the person never wrote is worse
than a generic one.

Write the checked findings to `documents/applications/<company>_<role>/outreach_research.md`:
per contact, the hook, the source URL, and the date it was read. Mark anything the
agent asserted that you could not confirm, and do not use it. The draft file must point
at this file or the gate refuses it.

**The hook.** One specific, true reason it is *this* person. If the research finds
none, write `hook: none` and a plain note. "No specific hook found, generic note" is
honest and lets the candidate decide whether to spend the ask. A manufactured hook is
the one thing worse than none.

## Step 3: Draft

Decide what each message is *for* before writing it. One message, one purpose, one
ask.

| Message | Its job | The ask |
|---|---|---|
| Careers email | Put a short human note beside the ATS record | Who is handling this requisition? |
| Hiring manager note | Make the name recognisable when the CV surfaces | A short chat, or two specific questions |
| Engineer note | Start a real conversation about the work | A question they are the right person to answer |
| Recruiter note | Get the application routed | Who owns this req, or its status |
| Follow-up after acceptance | Have the conversation the note promised | The questions themselves; a referral only if it has become natural |

**Rules for every message:**

- **Name the role and its req ID** where the posting has one. "I applied for X, job
  4412" is actionable; "I'm interested in opportunities" is not.
- **Make a referral easy when it comes up.** Employees usually submit a referral on an
  internal portal against a job ID, so the follow-up to an engineer carries the exact
  job ID and offers the CV. It still does not open with the referral ask.
- **Ask for something small.** A stranger will answer a question. Asking them to stake
  their reputation in the first message ("could you refer me?") converts worse and
  costs the contact.
- **One metric, maximum**, and only the one that maps to *their* work. Three numbers
  in 300 characters reads as a brag sheet.
- **State a gap plainly if it is the obvious objection.** "My backend work is Python; I
  have not shipped Go" earns more trust than silence.
- **Every claim is grounded** in the same sources as the CV: `01-candidate-profile.md`,
  `cv/main_example.tex` and `CLAUDE.md`'s Candidate Profile. All accuracy rules in
  `03-writing-style.md` apply unchanged. No claim may contradict the CV or cover
  letter sent for the same role.
- **Write a distinct note per person.** If two notes survive swapping the names, the
  hook was not specific enough. Go back to Step 2.

**Limits, enforced by the gate:** connection note 300 characters; LinkedIn message 120
words; InMail 100 words; email 150 words with a subject line of 60 characters or
fewer.

## Step 4: Human voice (hard rule 4)

The reader has seen a hundred templated notes this month and recognises one in the
first five words. Write the way the candidate would type to a colleague of a colleague.

- **Open with the reason, not a greeting ritual.** The first sentence after the name
  is the hook or the fact of the application. Not a wish about their well-being, not
  an account of how the profile was found.
- **Plain verbs, short sentences, his own words.** Built, shipped, fixed, broke, own.
  If a phrase could appear in any candidate's note, cut it.
- **Sound like one person.** Contractions are fine. A sentence may be a fragment. Not
  every sentence starts with "I". No three-part lists, no "not only X but Y", no
  closing summary of the message.
- **No enthusiasm words.** Interest is shown by what he bothered to read, never by
  saying he is excited, passionate or impressed.
- **No flattery.** "Your post on eval drift matched a problem I hit" is a hook.
  "I loved your insightful post" is a tell.
- **Indian office formalities stay out**: "Respected Sir", "kindly", "do the needful",
  "PFA". So do American sales formalities: "touch base", "circle back", "quick sync".
- **Plain characters only.** No em-dashes, no curly quotes, no markdown, no emoji. The
  text is pasted into a box that shows them literally.
- **End on the ask.** No sign-off paragraph, no thanks in advance, no "looking forward
  to hearing from you". A first name is
  enough on LinkedIn; an email takes a name and a phone number.

**The gate.** `tools/outreach.py load` fails a file on any banned phrase, a dash, a
curly quote, a placeholder, an over-limit count, a note that does not greet its
contact by name, a first note with no hook, or two notes that are interchangeable.
Fix the message, never the gate.

**The read-aloud test.** The gate catches patterns; it cannot hear. After it passes,
read each message as if saying it across a table. If a sentence is one nobody would say
out loud, rewrite it. Then present every message to the candidate and expect edits:
his rewrite is the point of the exercise, not a failure of the draft.

## Step 5: Write the file and load the queue

Write `cover_letters/outreach_<company>_<role>.txt`. Free text for the candidate
(who each person is, why them, the hook's source, the send order) goes outside the
blocks. Each message goes in a block:

```
@@research: documents/applications/<company>_<role>/outreach_research.md

@@ key: careers | track: careers_email | channel: email | contact: Acme Careers | ref: careers@acme.example
Subject: Senior AI Engineer application, job 4412
<body>
@@end

@@ key: hm | track: hiring_manager | channel: linkedin_connect | contact: Asha Rao | ref: https://www.linkedin.com/in/... | hook: runs the team the posting names
<note>
@@end

@@ key: hm-f1 | after: hm | channel: linkedin_message
<the longer message, sent once she accepts>
@@end
```

`track` is one of `careers_email`, `hiring_manager`, `engineer`, `recruiter`. `channel`
is one of `email`, `linkedin_connect`, `linkedin_message`, `inmail`. A follow-up names
its parent with `after:` and inherits the contact. `offset:` and `gap:` override the
default days when there is a reason.

Then load it:

```
python3 tools/outreach.py load cover_letters/outreach_<company>_<role>.txt \
    --app <company>_<role> --company "<Company>" --role "<Role>"
```

`load` lints every block and refuses the whole file if one fails. It schedules
nothing: the dates start when the application is submitted.

## Step 6: Schedule and remind

The queue is `outreach_queue.csv` at the repo root. It names real people and is
gitignored.

| When | Command | What it does |
|---|---|---|
| The application is submitted (`/outcome`) | `python3 tools/outreach.py start --app <app> --date <applied>` | Dates each first message from the application day |
| Any day | `python3 tools/outreach.py due --text` | Lists what to send today, with the text ready to paste |
| He sent one | `python3 tools/outreach.py sent <id>` | Marks it and dates its follow-up five days out |
| He decides not to send one | `python3 tools/outreach.py skip <id>` | Drops it and its follow-ups |
| A contact replied | `python3 tools/outreach.py replied <id>` | Closes everything queued for that person |
| The application is resolved | `python3 tools/outreach.py close --app <app>` | Closes the whole queue for it |

**Reminders.** `scripts/install-outreach-launchd.sh` installs a job that runs
`tools/outreach.py notify` every morning and posts a desktop notification when
something is due. The same list appears at the top of `tracker.html`, with a Copy
button for each message and a link to the profile or address. Neither one sends
anything.

**At the start of any session in this repo**, run `python3 tools/outreach.py due` and
tell the candidate what is waiting before anything else. When he says a message went
out, run `sent` in the same turn: an unmarked send breaks the follow-up dates.

## Verification before handing it over

- [ ] All four tracks are filled, or each unfilled one is named with the reason
- [ ] A research agent ran, and `outreach_research.md` records each hook with its
      source URL and the date it was read
- [ ] Every contact is a real person found on a real profile, with the URL recorded
- [ ] Every address came from the company's own page or the person's own publication;
      none was guessed
- [ ] Every factual claim traces to the grounded sources; no claim contradicts the CV
      or cover letter for the same role
- [ ] Each note is distinct, with a hook specific to that person or labelled `none`
- [ ] `tools/outreach.py load` accepted the file
- [ ] Each message passed the read-aloud test and was shown to the candidate
- [ ] A follow-up exists for each first message
- [ ] Nothing was sent, connected or messaged by the agent
