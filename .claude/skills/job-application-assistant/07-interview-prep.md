---
framework_version: 1.0.0
---

# Interview Preparation Guide

<!-- SETUP: STAR examples are personalized by running /setup based on your actual experience -->

## STAR Format

Structure answers as: **Situation** (context), **Task** (your responsibility), **Action** (what you did), **Result** (outcome).

Keep answers to 1-2 minutes. Be specific. End with what you learned or would do differently.

## Ready-Made STAR Examples

<!-- Confidentiality rules (from the evidence bank): never name the incident-platform client or its
cloud vendor - say "an enterprise SRE program on a major public cloud". Never name the semiconductor
client - say "a leading semiconductor client" (convogene.ai is public and demoable). Lead with 🟢
measured numbers; offer 🔵 estimates only as estimates with the reasoning shown. -->

### 1. Incident Resolution Assistant (retrieval + production at scale) — HERO
**S:** An enterprise SRE org on a major public cloud had near-identical incident wording; finding the right prior incident by hand took SREs 15-20 min, and that "finding" step is ~70% of resolution effort.
**T:** Build the retrieval engine and pipeline for an assistant that surfaces the right prior incidents plus candidate resolution steps, at the point of work, at scale.
**A:** Ingested incidents from ServiceNow into a Kafka stream, fanning out to subscriber services (summarizer, resolution-step generator grounded on incident data + GitHub runbooks, related-incident surfacing, change analyzer). Stored data in Elasticsearch; redesigned retrieval from cosine to hybrid search + filtering; deployed Airflow on Kubernetes with Helm.
**R:** Triage time 15-20 min → ~5 min (~70% faster) 🟢. Scaled a 20-user POC → 200+-SRE beta 🟢. Delivered to production and trained the client's in-house team, who now own it. (MTTR -40-60% is a 🔵 estimate - offer only as an estimate.)
**Use for:** "Tell me about your most impactful project", "production at scale", "system design", "measuring impact"

### 2. Hybrid Retrieval Redesign (hard engineering / RAG depth) — DEPTH
**S:** Pure vector (cosine) retrieval was failing on the incident data: incidents were textually near-identical, so it clustered on surface features (same region/wording) and missed genuinely similar incidents from other regions.
**T:** Return incidents similar in root cause / semantics, not surface text.
**A:** Moved to hybrid search (semantic + keyword/structured filtering), added metadata filtering, and masked region/time/identifiers so the model matched on the incident's essence (privacy-preserving by design). Logged retrieval quality on spawning incidents to keep evaluating.
**R:** Recall roughly doubled, ~30% → ~80% 🟡 (present conservatively as "recall roughly doubled"; retreat to the qualitative story if pressed - it's airtight).
**Use for:** "Describe a hard technical problem", "when the naive approach failed", "RAG/retrieval depth"

### 3. Convogene.ai (shipped RAG product) — BREADTH
**S:** Users needed accurate, specific answers about a semiconductor client's processor lineup; early versions hallucinated heavily, and much of the client's corpus was embargoed/restricted.
**T:** Ship a grounded chatbot that answers accurately and avoids ungrounded claims.
**A:** Scheduled scraping of product data via LangGraph + LangChain, embeddings in a vector store, Python backend + JS front-end, deployed on Microsoft Azure. Guardrails at two layers: scraped-data filtering (exclude embargoed material) + prompt guardrails.
**R:** Went from frequent hallucination to near-zero in practice 🔵 (qualitative, not a measured rate). Live, public, demonstrable at convogene.ai - the strongest proof; best move is to demo it.
**Use for:** "Ship something end-to-end", "working with constraints/confidentiality", "product sense"

### 4. Agentic Test-Automation Platform (frontier agentic tooling) — RANGE
**S:** Testing a codebase end-to-end is slow and manual; generated tests often guess response schemas wrong.
**T:** Build an agentic platform that explores any repo, generates and self-corrects tests, and scores coverage.
**A:** Clone repo → LLM maps signatures/call-graph/workflows; generate tests (API, workflow, security/edge) in budget or coverage modes; added an LLM self-review loop to fix schema mismatches; built PR blast-radius (1/2/3-hop) analysis and a PRD-coverage "certification" score. Front-end automation via Playwright; uses Claude Code for agentic coding.
**R:** Notable eval finding: reasoning models over-fit expected outputs and were less reliable for faithful test execution than non-reasoning models - a concrete, credible insight.
**Use for:** "agentic systems", "an eval/finding that surprised you", "LLM tooling", "current work"

<!-- Add more STAR examples as needed. Aim for 4-6 covering different competencies. -->

## Common Tough Questions

### "Why are you leaving Infobell?"
> At Infobell I got to build real production GenAI end-to-end - the incident-resolution retrieval engine, the hybrid-retrieval redesign, Convogene, and now the agentic test-automation platform. I'm looking for a role where applied AI is the core of the product and I can keep working at the frontier with more scope. It's about the next step, not away from anything - I'm proud of what shipped there.

### "What's your current CTC / expected CTC?" (India-specific - do not anchor to current)
> Deflect to band, never disclose current CTC as the anchor. "I'd rather align on the value of the role than on my current number - my current compensation is below market for the production GenAI work I do, which is part of why I'm looking. Based on the scope here and the market for AI/GenAI engineers with my experience, I'm targeting the ₹25-40 LPA fixed band. Happy to discuss where this role sits in that range." Keep the walk-away floor (~₹25 LPA) private; engineer competing offers for leverage where possible.

### "You don't have [specific skill/experience]." (e.g. deep MLOps platform, a non-Python stack, DSA depth)
> Acknowledge honestly, bridge to adjacent production experience, show fast-learning evidence. "I haven't owned [X] specifically, but I've done the adjacent thing - [e.g. deployed Airflow on K8s/Helm and ran a Kafka pipeline in production]. My track record is learning hard things fast: Mechanical engineer → self-taught → C-DAC → five years shipping production GenAI. Here's how I'd get up to speed on [X]."

### "Where do you see yourself in 5 years?"
> Deeper ownership of agentic-AI systems - architecting applied-AI products end-to-end, not just building components - while staying at the frontier of the field. I want to be the person a team trusts to take an ambiguous AI problem from POC to a system that stays up in production.

### "What's your biggest weakness?"
> I gravitate to greenfield, frontier work and have to be deliberate about the operate-and-maintain side. I've made a point of proving I do it - I didn't just build the incident platform, I delivered it to production and trained the client's in-house team to own it. So I channel the bias into building things that are handoff-ready rather than avoiding maintenance.

### "Why this company specifically?"
> Customize per company. Must reference: specific projects, company values, market position, or team structure. Never give a generic answer.

## Questions You Should Ask Interviewers

### About the Role
- "What does a typical week look like in this role?"
- "What would success look like in the first 6 months?"
- "What's the biggest challenge the team is facing right now?"

### About the Team
- "How big is the team, and how do you divide work?"
- "What does the development/project lifecycle look like, from idea to production?"
- "How do you onboard new team members?"

### About Tech & Growth
- "What's your current tech stack for [relevant area]?"
- "Is there room to grow into more architectural or strategic decisions?"
- "How does the team stay current with new tools and methods?"

### About Culture (use these to prevent disappointment)
- "How would you describe the team culture?"
- "What does professional development look like here?"
- "Is there flexibility for remote/hybrid work?"
- "What's the balance between development/new projects and maintenance work?"
- "How would you describe the leadership style in this team?"
- "What do people who thrive here have in common?"

## Phone/Video Interview Tips
- Have STAR examples written out (use this file)
- Keep a glass of water nearby
- Smile when speaking (it changes your tone)
- Ask for clarification if a question is vague
- It's OK to take 5 seconds to think before answering
- End with: "Is there anything else you'd like to know about my background?"

## After the Application (Best Practice)

### Follow-Up Etiquette
- **Don't call to "stand out"** or to learn more about the role post-submission - this risks a negative impression
- If the employer specified a timeline, respect it and wait
- If no timeline was given and significant time has passed (2+ weeks), a brief call to ask about status is acceptable
- If you have genuinely new, relevant information to share, a short follow-up is fine

### Thank-You Notes
- When you receive any update (interview invitation, rejection, or status update), send a brief thank-you message
- Express appreciation for their time and the process
- Keep it short (2-3 sentences)

## Roleplay Guidelines
When the user asks for interview practice:
1. Ask which role/company to simulate
2. Start with easy warm-up questions ("Tell me about yourself")
3. Progress to role-specific technical questions
4. Include 1-2 behavioral questions using the competencies from the job posting
5. End with a tough question or curveball
6. After each answer, give brief feedback: what worked, what to sharpen
7. Suggest which STAR example would work best for each question
