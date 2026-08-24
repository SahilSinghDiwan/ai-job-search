---
framework_version: 1.1.0
---

# Cover Letter Templates and Tailoring Guide

## Two formats, one decision

A cover letter exists in two forms here, and picking the wrong one wastes the artifact.

**The compiled LaTeX PDF** (`cover.cls`, XeLaTeX) is the formal document. It is right when the employer's process is document-shaped: an upload/attachment field, a large-employer ATS (Workday, SuccessFactors, Taleo, iCIMS, corporate Naukri portals), a GCC, a bank or other regulated employer, government, a university, a consultancy, or any posting that carries a reference/job ID and reads like it is being filed. In those processes an attached PDF is the expected register, and sending a three-line email instead reads as not having bothered.

**The plain-text variant** is the same argument compressed into something read in an inbox. It is right when the destination is an email body, a LinkedIn InMail or connection note, a recruiter reply, or a single "why you" / "anything else we should know" box in an application form. For Indian AI-first startups and global-remote startup applications this is usually the real artifact: a formal attached letter reads as heavy, and frequently goes unopened while the email body is the only thing anyone actually reads.

**When the posting does not say, ask the user** rather than defaulting. Both is a legitimate answer when a formal upload is required and the submission also goes out over email. `/apply` Step 2 encodes this decision and carries the result into its Step 5 compile-and-inspect step.

Everything in `03-writing-style.md` applies to both formats without exception — no em-dashes, no cliches, no apologetic hedging, forward-looking task-solving framing, every claim backed by a specific example, motivation for *this* company placed early. The plain-text variant is a compression of that structure, not a relaxation of it.

## Variant: plain-text cover letter (email body / InMail / form box)

**Output file:** `cover_letters/cover_<company>_<role>.txt`
**Compile with:** nothing. There is no PDF, and `/apply`'s compile-and-inspect step is skipped for this file and reported as skipped, never as a failure.

### Structure

```
Subject: [Specialty] + [keyword from the posting] - [Your Name]

Hi [Name] / Dear [Company] hiring team,

[Hook: one or two sentences. The single strongest true thing that maps
onto this role, with its number. Not "I am writing to apply for".]

[Why this company, and which of their problems you can solve. Two to
four sentences, concrete, using their own terms from the posting.]

[Proof: one short past example that backs the hook. One or two
sentences. At most three very short lines if a list genuinely helps.]

[Close: one line, forward-looking. What you would like to happen next.]

[Your Name]
[Phone] | [Email] | [LinkedIn URL]
```

### How it differs from the LaTeX letter

- **Much shorter.** 120–200 words of body, against 250–300 for the PDF. An email that fills a screen gets skimmed to nothing. If a paragraph does not carry a specific fact, cut it rather than tightening it.
- **The subject line is doing real work.** In the PDF the headline is decoration on a document someone already opened; in an inbox it decides whether the message is opened at all. Use the `03-writing-style.md` formula — `[Title/specialty] + [relevant keyword from the posting]` — and never "Application for <Role>".
- **No letterhead, so contact details move to the bottom as literal text.** The `\namesection{}` header has no equivalent here. Phone, email and LinkedIn go in a plain sign-off line, spelled out, because there is no styled header carrying them and no hyperlink to hide them in.
- **Opens on the hook, not the formalities.** The PDF earns a sentence of "I am writing regarding X" because the document format supplies the context. An email does not: the first line is the only line guaranteed to be read, so it has to be the strongest true claim, not an announcement of intent.
- **Written to be read on a phone.** Short paragraphs, blank line between each, no line that runs longer than a sentence or two. Long paragraphs that look fine on a page become a grey wall on a phone.
- **Plain characters only.** No markdown bold or headings, no smart quotes, no em-dashes, no glyphs that will mangle when pasted into a form box or a plain-text email client. What is typed is what arrives.
- **Bullets are optional and usually wrong.** The PDF's 3–5 bullet list is a strength on a page; in an email body it eats most of the word budget and reads as a pasted CV. Use prose unless the list genuinely compresses three distinct achievements.

### Adapting it further

- **Form box with a character limit:** if the box states a cap, treat it as a hard-limit field and apply the counting discipline from `08-application-forms.md` ("Field type: hard character limits") — count programmatically, never estimate.
- **LinkedIn connection note:** ~300 characters. This is the hook plus one sentence of why-this-company, nothing else. Drop the subject line and the sign-off block.
- **Reply to a recruiter:** drop the subject line (the thread has one) and keep the salutation to their first name.

### Checklist for the plain-text variant
- [ ] Subject line present, specific, follows the headline formula
- [ ] Body is 120–200 words (counted, not estimated)
- [ ] First sentence is the hook, not "I am writing to apply for"
- [ ] Why-this-company is concrete and verified, not generic praise
- [ ] Contact details present as literal text in the sign-off
- [ ] No markdown, no smart quotes, no em-dashes, no non-ASCII decoration
- [ ] Short paragraphs, phone-readable
- [ ] Language matches the posting's language
- [ ] Any agentic-coding or AI-tooling mention names **Claude Code**

## Template: Custom cover.cls (XeLaTeX)

Cover letters use a custom LaTeX document class (`cover.cls`) with Lato/Raleway fonts.

**Output file:** `cover_letters/cover_<company>_<role>.tex`
**Compile with:** XeLaTeX (cover.cls requires fontspec)
**Font directory:** `cover_letters/OpenFonts/fonts/`

### Compile command

```bash
cd cover_letters && xelatex -interaction=nonstopmode cover_<company>_<role>.tex
```

Expected output: `Output written on cover_<company>_<role>.pdf (1 page, ...)`. Any page count other than 1 is a failure that must be fixed before presenting to the user.

## Compile-and-Inspect Loop (MANDATORY on the LaTeX path)

This loop governs the compiled PDF only. The plain-text variant has nothing to compile; use its own checklist above instead, and report the compile-and-inspect step as skipped rather than failed.

After writing the cover letter and before presenting to the user, always compile and visually inspect the PDF. Iterate until the layout is clean:

1. Run `xelatex -interaction=nonstopmode cover_<company>_<role>.tex`
2. Confirm page count is exactly 1 and compile succeeded
3. Read the PDF via the Read tool and visually check: signature fits at the bottom, no text cut off, bullet font matches body

### Known template pitfall: itemize inside `\lettercontent{}`

The `\lettercontent{}` macro appends `\\` to its argument. This breaks when the argument ends in `\end{itemize}` because `\\` has no line to break after the environment closes, producing `! LaTeX Error: There's no line here to end.` and no PDF output.

**Wrong (breaks compile):**
```latex
\lettercontent{Here is how my experience maps:
\begin{itemize}
    \item ...
\end{itemize}}
```

**Correct — close `\lettercontent{}` before the list and wrap the list in the matching Raleway-Medium font so typography stays consistent:**
```latex
\lettercontent{Here is how my experience maps:}

{\raggedright\fontspec[Path = OpenFonts/fonts/raleway/]{Raleway-Medium}\fontsize{11pt}{13pt}\selectfont
\begin{itemize}
    \item ...
\end{itemize}\par}
\vspace{6pt}

\lettercontent{[next paragraph]}
```

The font wrapper is mandatory — if you just move `\begin{itemize}` outside `\lettercontent{}` without the `\fontspec` block, bullets render in the default body font (Lato) and visually mismatch the rest of the letter.

## Document Structure

```latex
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Cover Letter - [Company], [Role]
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\documentclass[]{cover}
\usepackage{fancyhdr}

\pagestyle{fancy}
\fancyhf{}

\rfoot{Page \thepage \hspace{0pt}}
\thispagestyle{empty}
\renewcommand{\headrulewidth}{0pt}
\begin{document}

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%     TITLE NAME
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
\namesection{}{\Huge{[YOUR_NAME]}}{  \href{mailto:[YOUR_EMAIL]}{[YOUR_EMAIL]} | [YOUR_PHONE] |  \urlstyle{same}\href{[YOUR_LINKEDIN_URL]}{LinkedIn}
}

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%     MAIN COVER LETTER CONTENT
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\currentdate{\today}
\lettercontent{Dear [Name/Team],}

\lettercontent{[Opening paragraph - role, connection to background, 2-3 sentences]}

\lettercontent{[Body paragraph - most relevant experience, introducing the bullet list]}

{\raggedright\fontspec[Path = OpenFonts/fonts/raleway/]{Raleway-Medium}\fontsize{11pt}{13pt}\selectfont
\begin{itemize}
    \item [Concrete achievement/skill 1]
    \item [Concrete achievement/skill 2]
    \item [Concrete achievement/skill 3]
\end{itemize}\par}

\lettercontent{[Connection to company - why this role, why this company specifically]}

\lettercontent{[Personal fit paragraph - behavioral strengths, team contribution, 2-3 sentences]}

\lettercontent{I look forward to hearing from you.}

\begin{flushright}
% No trailing \\ inside \closing{} - cover.cls appends its own \\, and a
% doubled break triggers "! LaTeX Error: There's no line here to end."
\closing{Kind regards,}

\signature{[YOUR_NAME]}
\end{flushright}
\end{document}
```

## Key Commands Reference

| Command | Purpose |
|---------|---------|
| `\namesection{}{Name}{contact info}` | Header with name and contact |
| `\currentdate{date}` | Date field (use `\today` or explicit date) |
| `\lettercontent{text}` | Body paragraph (adds spacing after) |
| `\closing{text}` | Closing line |
| `\signature{name}` | Printed name below signature |

## Tailoring Guidelines

### Salutation
- If you know the hiring manager's name: "Dear [First Last],"
- If you know the team: "Dear [Company] hiring team,"
- Generic: "Dear [Company]," (avoid "To whom it may concern")

### Length - Hard 1-Page Limit
- Target: 1 page including signature block
- Maximum: **never exceed 1 page**
- **Word budget: 250-300 words** of body text (not counting LaTeX markup). This is the safe maximum. 350 words will overflow.
- **Always count**: opening paragraph + bullet list paragraph + closing paragraph = 3 blocks. Add a 4th only if the others are short.
- When adding company-specific content, trim other content to compensate rather than adding net length

### Line Spacing
- Add `\usepackage{setspace}` and `\setstretch{1.0}` if the letter is long and needs to fit on one page
- Use `\vspace{.5cm}` between major sections for readability (only if space permits)

### Bullet Lists
- Place `\begin{itemize}...\end{itemize}` **outside** a `\lettercontent{}` block (see "Known template pitfall" above), wrapped in the matching Raleway-Medium `\fontspec` so the bullet font matches the body
- 3-5 bullets is ideal
- Start each bullet with bold label or action verb
- Use `\textbf{Label:}` for category-style bullets

### LaTeX Special Characters
- Underscore: `\_`
- Ampersand: `\&`

### Non-English Cover Letters
- Same template structure, just write content in the posting's language
- Adjust date format to local convention
- Adjust closing to local convention (e.g. "Med venlig hilsen," for Danish)

## Checklist Before Finalizing (LaTeX PDF path)

For the plain-text variant use the shorter checklist in its own section above; the page-count and font items below do not apply to it.

- [ ] No em-dashes (use commas or periods instead)
- [ ] No cliches or empty filler
- [ ] Every claim backed by specific example
- [ ] Forward-looking framing: focuses on tasks you'll solve, not just past duties
- [ ] Motivation section references this specific company's mission/values
- [ ] Company name and role are correct throughout
- [ ] Date is current
- [ ] Fits on one page
- [ ] Language matches the job posting language
- [ ] Salutation is appropriate (named person if possible)
- [ ] Headline is engaging and specific, not generic

## Submission Guidelines (Best Practice)
- **Send the format the employer's process actually consumes** — a PDF into an upload field, a plain-text body into an inbox or a form box. Attaching a PDF where an email body was asked for, or pasting a bare paragraph where a document was required, is a targeting failure regardless of how good the content is
- Submit only the documents the employer requests
- Export as PDF to preserve formatting
- Name files clearly: "[Your Name] CV" and "[Your Name] Cover Letter"
- Follow all employer instructions regarding anonymity or specific materials
