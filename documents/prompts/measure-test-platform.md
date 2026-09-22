# Prompt: instrument the agentic test-automation platform for real metrics

Paste this into Claude Code (or your cloud agent) with the repo checked out.
It does two jobs at once: it makes the platform *measure itself* going forward,
and it back-fills whatever numbers already exist in logs/DB so there is
something to report today.

---

You have access to this repository, its runtime logs, and its database.
This is an agentic test-automation platform: it ingests a repo, maps signatures /
call graphs / workflows with an LLM, generates test suites (API, workflow,
security/edge), executes them, and self-heals failing tests with an LLM during
the run. It reports through Allure and runs in GitHub Actions.

I need defensible, auditable metrics — for engineering decisions, for the client
alpha readout, and for my own record of what I built. Do NOT estimate, guess, or
extrapolate. Every number must trace to a query, a log line, or a counter you
can point me at. If a number cannot be derived from what exists today, say so
explicitly and tell me what instrumentation is missing.

## Step 1 — Inventory what is already measurable

Read the codebase, the Allure output schema, the CI workflow definitions, and the
database schema. Produce a table: `metric | currently derivable? | source (table/
log/file) | confidence`. Cover at minimum the metrics in Step 3. Flag anything
that looks derivable but is actually lossy (e.g. overwritten runs, logs with
retention limits, counters reset per run).

## Step 2 — Back-fill from existing data

For every metric marked derivable, compute it now over all available history.
Show the query or command you used for each. Report both the value and the
window it covers (e.g. "last 43 runs, 12 Jun – 1 Sep"). Where sample size is too
small to be meaningful, say the sample size and label it provisional rather
than dropping it.

## Step 3 — The metrics that matter

Group them and give the definition you used for each, because the definition is
what makes the number defensible.

**Scale / coverage**
- Repos and services onboarded; distinct languages and frameworks seen
- Endpoints / functions / workflows discovered per repo by the mapping stage
- Tests generated: total, and split by suite type (API, workflow, security/edge)
- Line/branch coverage achieved, and the spec-coverage certification score
  distribution across runs

**Quality — the headline numbers**
- First-pass rate: % of generated tests that execute green with no self-heal
- Post-heal pass rate: % green after the LLM self-healing loop, and therefore
  the *lift attributable to self-healing* (post-heal minus first-pass)
- Self-heal attempts per failing test, and the distribution of attempts-to-green
- False-positive rate: tests that failed against correct code (sample and
  hand-label ~30 if there is no automatic signal — report it as a labelled sample)
- Flake rate: tests whose result changes across identical re-runs

**Cost / efficiency**
- Inference cost per run, per repo, and per generated test — broken out by
  stage (mapping, generation, self-healing) and by model
- Tokens in/out per stage; cache-hit rate if caching is in play
- Wall-clock: mapping, generation, execution, self-healing, and total per run
- Budget-mode accuracy: for budget-capped runs, actual spend vs the declared
  budget (over/under, and how often the cap is breached)

**Human baseline — the comparison that sells the platform**
- Estimated engineer-hours to hand-write an equivalent suite. Get this by
  sampling 3–5 generated suites and asking the owning engineer for a written
  estimate. Record who estimated and when. Label it clearly as a
  human estimate, never as a measured result.

**Blast radius**
- PR analyses run; 1/2/3-hop impacted-surface sizes
- Precision of the impacted set where after-the-fact truth is available

## Step 4 — Close the gaps

For every metric that was NOT derivable, write the instrumentation:
- Emit one structured JSON event per run and per stage — run id, repo, commit,
  stage, model, tokens in/out, cost, duration, outcome, self-heal attempt index
- Persist it durably (not just stdout), keyed so runs are comparable over time
- Add the derived rates to the Allure report as a summary block, so every run
  publishes its own first-pass rate, post-heal lift, and cost

Open a PR with the instrumentation. Keep it additive and behind a flag if it
touches the hot path.

## Step 5 — Two outputs

1. `METRICS.md` in the repo: every metric, its definition, its source query, its
   current value, its window and sample size, and its confidence. This is the
   living document — it is the thing I point at when someone challenges a number.
2. A short readout block: the five numbers most worth putting in front of a
   client team lead, each written as `<number> (<definition>, <window>, n=<N>)`.

Mark anything provisional as provisional. I would rather report three numbers I
can defend than ten I cannot.
