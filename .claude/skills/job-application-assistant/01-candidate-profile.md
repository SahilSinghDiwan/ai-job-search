---
framework_version: 1.1.1
---

# Candidate Profile

## Identity
- **Name:** Sahil Singh Diwan
- **Location:** Bengaluru, India
- **Phone:** +91 800-7192-680
- **Email:** diwan.sahilsingh@gmail.com
- **LinkedIn:** https://linkedin.com/in/diwan-sahil
- **GitHub:** https://github.com/SahilSinghDiwan
- **Portfolio:** https://myprofile.nostalkers.shop (ships live AI features - resume chatbot, AI project summaries)
- **Live demo:** https://convogene.ai (RAG chatbot built & shipped)
- **Status:** Employed as Software Engineer, AI at Infobell IT Solutions; on notice, last working day 12 Oct 2026; actively interviewing
- **Constraints:** Bengaluru-based; open to on-site/hybrid in Bangalore or global remote (USD). Relocation is not a hard blocker for the right AI role.

### Languages

| Language | Level | Notes |
|----------|-------|-------|
| English | Professional / fluent | CV language; taught AI & Python to students across US/UK/Singapore/India |
| Hindi | Native | |
| Marathi | Native | |

## Education

| Degree | Period | Institution | Key Topics |
|--------|--------|-------------|------------|
| Post Graduate Diploma (6 months) | Sep 2023 - Feb 2024 | Centre for Development of Advanced Computing (C-DAC) | Applied software engineering, systems, transition into production AI/ML |
| B.E. Mechanical Engineering | 2015 - 2018 | G H Raisoni Academy of Engineering and Technology, Nagpur | Mechanical engineering fundamentals |

## Professional Experience

### Software Engineer, AI - Infobell IT Solutions (March 2024 - Present)
Bengaluru, India
- **AI Test-Automation Platform (agentic):** Building a system that clones a repository, uses LLMs to map its signatures, call graph, and workflows, then generates test suites (API, workflow, and security/edge-case) under budget-driven or coverage-driven modes. Added an LLM self-review loop to correct schema-mismatched generated tests, PR blast-radius analysis (1/2/3-hop impact), and a specification-coverage "certification" scoring PRD coverage, security, and API surface. Front-end automation driven with Playwright.
- **Incident Resolution Assistant:** Built the retrieval engine and event-driven pipeline for an enterprise SRE incident-resolution assistant on a major public cloud; scaled from a 20-user POC to a 200+-SRE beta, and cut time-to-find similar incidents ~70% (15-20 min → ~5 min, measured with SREs). Delivered to production and transitioned ownership to the client's in-house team.
- **Advanced Retrieval:** Diagnosed the failure of semantic (cosine) search on near-duplicate incident data and rebuilt it as hybrid retrieval with structured filtering and identifier masking (privacy-preserving design), roughly doubling similar-incident recall (~30% → ~80%). Deployed on Kubernetes with custom Helm charts.
- **Event Pipeline:** Engineered a Kafka + Elasticsearch pipeline ingesting incidents from ServiceNow into fan-out services - summarization, resolution-step generation grounded on incident data and GitHub runbooks, related-incident surfacing, and change analysis.
- **Convogene.ai (shipped RAG product):** Built and deployed a live RAG chatbot (convogene.ai) answering detailed processor-lineup questions for a semiconductor client; scheduled scraping via LangGraph/LangChain with two-layer (data + prompt) guardrails, driving hallucinations from frequent to near-zero. Deployed on Microsoft Azure.
- **Kernel Backporting Automation:** Built tooling to accelerate multi-month Linux-kernel patch backporting, auto-applying ordered patch sequences (5-120 patches) and localizing failures for engineer review.
- **Cloud-Native Anomaly Detection:** Built and deployed an automated anomaly-detection system on Apache Airflow, processing data-center-scale datasets on a Kubernetes cluster.
- **Multimodal AI:** Fine-tuned an instruct-pix2pix model and owned application rollout for a generative-media solution.

### Master Trainer, AI & Python - India STEM Foundation (Aug 2022 - Aug 2023)
Remote & On-site, India
- Led online Python and AI training for an international student base (USA, UK, Singapore, India).
- Designed hands-on robotics curricula (Python, C, Raspberry Pi, Arduino), translating complex concepts into accessible modules.

### Junior Software Developer - Koderoom (June 2020 - June 2022)
Remote, India
- Built and maintained backend APIs for a legal contract-management platform - document parsing, data structuring, and secure retrieval of sensitive contracts.

## Independent Projects
- **Portfolio site (myprofile.nostalkers.shop):** Personal portfolio that itself ships live AI features - a resume chatbot, AI project summaries, and a tech-filter - a working proof of applied GenAI engineering.
- **Convogene.ai:** Publicly deployed RAG chatbot (see experience above); live and demonstrable.

## Technical Skills

### Programming & ML
- **Python** (primary): FastAPI, Flask, async Python, Pandas, NumPy, PyTorch
- **AI / GenAI:** RAG pipelines, hybrid retrieval, LLM integration, prompt engineering & guardrails, agentic systems, model fine-tuning, LangChain, LangGraph
- **Vector search & retrieval:** FAISS, Milvus, ChromaDB, Elasticsearch
- **Test automation:** Playwright, LLM-based test generation, call-graph analysis

### Domain Expertise
- Production GenAI (POC → production at scale) on real infrastructure, not notebooks
- Retrieval-augmented generation, hybrid retrieval, and LLMOps
- Event-driven data pipelines (Apache Kafka, Apache Airflow)

### Software & Tools
- Docker, Kubernetes, Helm, GitHub Actions
- Microsoft Azure, AWS, GCP
- MongoDB, MySQL, ServiceNow / Jira integrations
- Claude Code (agentic coding)

## Publications
1. IEEE conference paper on a hexapod robot (2019). *(Full citation to be confirmed. Real, but kept off the master CV per positioning decisions - can be added back for research-flavored roles.)*

## Awards
<!-- None recorded yet. -->

## References
<!-- Add referees here (name, title, company, contact) as they are confirmed. -->

More references available upon request.
