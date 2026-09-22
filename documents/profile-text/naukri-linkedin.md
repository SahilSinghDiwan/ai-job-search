# Portal profile text — Naukri and LinkedIn

**Written 2026-08-27.** Copy-paste blocks for the fields that portal search actually
ranks on. Everything here is drawn from the candidate profile in `CLAUDE.md` and the
master CV — no claim appears here that is not on the CV.

Two things worth knowing before you paste anything:

1. **Naukri's recruiter search is boolean over your headline, key-skills list and
   resume text — not over your prose summary.** The headline and the skills list do
   most of the work. The summary is read by humans after the search already matched.
2. **A flood of Naukri calls is not evidence the CV is working.** Staffing firms bulk-
   search the database and dial everything with "AI" in it. The fix for call quality
   is the *filters* in §3, not more keywords. Judge the CV by AI-product replies.

---

## 1. Naukri — Resume Headline

Naukri caps this near 250 characters and shows it directly in recruiter results. Lead
with the title a recruiter types, then the differentiator, then the stack.

```
AI/GenAI Engineer | 5 yrs shipping LLM, RAG & agentic systems from POC to production at scale | Python, LangChain, LangGraph, FastAPI, Kafka, Kubernetes, Azure | Hybrid retrieval, vector search (FAISS, Milvus) | Bengaluru / Remote
```

(230 characters, against Naukri's 250 cap.)

Shorter variant, if you would rather it read cleanly than pack terms:

```
AI/GenAI Engineer — LLM, RAG and agentic systems taken from POC to production at scale. Retrieval, LLMOps and the infrastructure underneath. Python · LangChain · LangGraph · Kubernetes · Azure. Bengaluru or global remote.
```

---

## 2. Naukri — Key Skills

Naukri matches these as discrete tokens, so spell out both the expansion and the
acronym where recruiters search either. Paste in this order — the first ones carry
the most weight.

```
Generative AI, GenAI, Large Language Models, LLM, Retrieval-Augmented Generation, RAG,
Agentic AI, AI Agents, LangChain, LangGraph, Prompt Engineering, LLM Guardrails,
Hybrid Retrieval, Semantic Search, Vector Databases, FAISS, Milvus, ChromaDB,
Elasticsearch, Embeddings, Model Fine-Tuning, PyTorch, Python, FastAPI, Flask,
Async Python, REST API, Microservices, Apache Kafka, Apache Airflow, Event Streaming,
Distributed Systems, Docker, Kubernetes, Helm, CI/CD, GitHub Actions, MLOps, LLMOps,
Microsoft Azure, AWS, GCP, MongoDB, MySQL, Playwright, Test Automation,
LLM Code Generation, Claude Code, Applied AI, AI Engineering
```

---

## 3. Naukri — the fields that decide who calls you

This is the part that changes call quality. Keywords decide *whether* you surface;
these decide *which* recruiter thinks you are in band.

| Field | Set it to | Why |
|---|---|---|
| Expected CTC | **₹28-32 LPA** (above the ₹25 LPA floor) | Naukri recruiters filter on this. Anything vaguer or lower puts you in the bulk-staffing pool. Leave "Negotiable" **off** — it reads as "will take less". |
| Current CTC | Fill it, but argue to market band in conversation | Indian portals require it; the CV and cover letters never anchor to it. |
| Notice period | **Serving notice / LWD 12 Oct 2026** | A short or served notice is a genuine advantage here — 60-90 days is the norm. Say it early, do not bury it. |
| Preferred location | Bengaluru **and** Remote | Both, or you drop out of half the searches. |
| Preferred role | AI Engineer / GenAI Engineer / Applied AI Engineer | Not "Software Engineer" — that is what pulls the generic-services calls. |
| Profile visibility | Consider limiting to **premium recruiters** | The single biggest lever on call volume. Costs you some reach. |

---

## 4. Naukri — Profile Summary

Naukri caps this at 1000 characters; the block below is 971. It is read after the search has already matched you.

```
AI/GenAI Engineer with 5 years taking Large Language Model (LLM) and Retrieval-Augmented Generation (RAG) systems from proof-of-concept to production at scale — on real infrastructure, not notebooks.

At Infobell IT Solutions I built the retrieval engine and Kafka/Elasticsearch pipeline for an enterprise SRE incident-resolution assistant, scaling it from a 20-user POC to a 200+-SRE beta and cutting time-to-find similar incidents ~70% (15-20 min to ~5). I rebuilt a failing semantic search as hybrid retrieval with privacy-preserving identifier masking, roughly doubling measured recall (~30% to ~80%), and shipped Convogene.ai, a live near-zero-hallucination RAG product on Azure.

I now build agentic AI developer tooling — an LLM test-generation platform that maps call graphs and self-corrects its test suites under a cost budget — using Claude Code daily. Claude Certified Architect (Foundations), Anthropic.

Open to AI/GenAI roles in Bengaluru or global remote.
```

---

## 5. LinkedIn — Headline

LinkedIn caps at 220 characters and weights the headline heavily in recruiter search.
Your current one is already good; this tightens the keyword spread.

```
AI/GenAI Engineer | LLM, RAG & agentic systems from POC to production at scale | LangChain · LangGraph · Kafka · Kubernetes | Building agentic developer tooling with Claude Code
```

(177 characters — room to append `| Bengaluru / Remote` if you want the location searchable.)

---

## 6. LinkedIn — About

LinkedIn only shows the first ~2 lines before "…see more", so the hook goes first.

```
I take LLM and RAG systems from proof-of-concept to production — on real infrastructure, with real users, not notebooks.

The clearest example: an enterprise SRE incident-resolution assistant. I built its retrieval engine and the Kafka/Elasticsearch event pipeline, and it went from a 20-user proof-of-concept to a 200+-SRE beta. Time to find a similar past incident dropped roughly 70% — 15-20 minutes down to about 5, measured with the SREs themselves. When the original cosine-similarity search turned out not to work, I rebuilt it as hybrid retrieval with structured filtering and privacy-preserving identifier masking, and measured recall roughly doubled (~30% to ~80%).

Since then: Convogene.ai, a live near-zero-hallucination RAG product on Azure with two-layer data and prompt guardrails. And now an agentic AI test-generation platform — it clones a repo, maps signatures and call graphs with LLMs, then generates and self-corrects API, workflow and security test suites under an explicit inference-cost budget. Built with Claude Code, which I use every day.

The path here was not linear: mechanical engineering, then self-taught programming, then C-DAC, then a year teaching Python and AI to students across the US, UK, Singapore and India. That year is why I can explain a retrieval architecture to someone who does not have one yet.

Stack: Python · LangChain · LangGraph · FastAPI · FAISS / Milvus / ChromaDB / Elasticsearch · Kafka · Airflow · Docker · Kubernetes · Helm · Azure / AWS / GCP.

Claude Certified Architect — Foundations (Anthropic).

Open to AI/GenAI engineering roles — Bengaluru, or global remote in USD. Best reached at diwan.sahilsingh@gmail.com.
```

---

## 7. LinkedIn — the settings that matter more than the text

1. **Skills section, top 3 pinned:** Generative AI, Retrieval-Augmented Generation
   (RAG), Large Language Models (LLM). LinkedIn recruiter search weights pinned
   skills; leaving "Python" pinned buys you generic-backend traffic.
2. **Open to work → Recruiters only.** Same titles as §3: AI Engineer, GenAI
   Engineer, Applied AI Engineer, Machine Learning Engineer. Locations: Bengaluru +
   Remote.
3. **Featured section:** pin convogene.ai and the GitHub repo. It is the fastest
   proof that the production claims are real, and it is what "building in public"
   means to someone deciding whether to reply.

---

## 8. What to do about the Naukri call volume

Ranked, cheapest first:

1. Set **Expected CTC to ₹28-32 LPA** (§3). One field, filters most of the bulk pool.
2. Change **Preferred role** away from "Software Engineer" (§3).
3. Switch **profile visibility to premium recruiters only** if the calls are still
   costing you hours — real trade-off, real relief.
4. Keep applying **direct to employer ATS** (Greenhouse/Ashby/Lever) rather than
   through portals. Every interview you have run so far came from a direct or
   ATS-hosted application, not from a Naukri inbound.
