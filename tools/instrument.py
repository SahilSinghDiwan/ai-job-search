#!/usr/bin/env python3
"""Instrumentation for the job-search ledger: append-only events, a join key, cost, verify.

Why this exists
---------------
`job_search_tracker.csv` is a *current-state* table: one row per application, one
mutable `status` cell, one `date`. That shape cannot answer the three questions the
tool is supposed to answer:

  1. How long did anything take?          (no transition is recorded, only the latest state)
  2. Did the ranker's score predict the   (no key joins a ledger row to a `seen_jobs.json`
     outcome?                              posting; company-name string match is not a key)
  3. What did an application cost?        (nothing records tokens or USD)

This module adds the missing substrate without rewriting the tool:

  * `events.csv` — append-only status-transition log, the **source of truth**. The
    tracker CSV stays the downstream current-state projection, exactly as
    `heal-yield` keeps JSON as truth and the report as a render.
  * `job_id` + `job_id_source` columns on the ledger — the foreign key into
    `job_scraper/seen_jobs.json`, written at apply time. Rows keyed after the fact
    are flagged as such and are never treated as apply-time evidence.
  * `costs.csv` — per-application, per-pass model cost.
  * a closed status enum with a replay invariant, and
  * `verify`, which recomputes every checkable claim offline, from committed
    artifacts only, with no network and no re-execution.

Provenance is load-bearing. Every event carries `provenance`:

  observed  — recorded at the time the transition happened. Timings computed from
              `observed` events are real.
  backfill  — reconstructed from the ledger snapshot when this module was installed.
              A backfill event's `at` is the row's `date`, which is the *apply*
              date, not the transition date. **`verify` refuses to compute any
              timing that crosses a backfill event.** This is the honest cost of
              having started measuring late, and it is not papered over.

Usage
-----
    python3 tools/instrument.py init            # one-time, idempotent; backs up the ledger
    python3 tools/instrument.py add --url <posting-url>      # at apply time: row + key + event
    python3 tools/instrument.py add --manual --company <c> --role <r>   # no scraped posting
    python3 tools/instrument.py record --job-id <id> --to interviewing \
        --evidence gmail:<message-id> --note "<dated note>"
    python3 tools/instrument.py cost --job-id <id> --pass rank \
        --model <model> --tokens-in 1200 --tokens-out 300 --usd 0.0042
    python3 tools/instrument.py cost --url <posting-url> --pass rank --model <model>
        # ^ unmetered: the pass is logged, no figure is invented, and it is not coverage
    python3 tools/instrument.py verify [--json]
    python3 tools/instrument.py status          # local summary (see the privacy note)

Privacy note: `verify` and `status` print personal outcome data (companies, counts).
Their output is for the operator. It is not a publishable artifact and nothing here
decides what may be published.
"""

from __future__ import annotations

import argparse
import csv
import datetime as _dt
import hashlib
import json
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

LEDGER = os.path.join(ROOT, "job_search_tracker.csv")
EVENTS = os.path.join(ROOT, "events.csv")
COSTS = os.path.join(ROOT, "costs.csv")
SEEN_JOBS = os.path.join(ROOT, "job_scraper", "seen_jobs.json")
SYNC_STATE = os.path.join(ROOT, "gmail_sync", "state.json")

# A figure computed against a sync older than this is stamped `unverified`,
# mirroring dialproof's unverified stamp.
SYNC_STALE_DAYS = 7

EVENT_FIELDS = [
    "event_id",
    "job_id",
    "at",
    "from_status",
    "to_status",
    "evidence",
    "actor",
    "provenance",
]

COST_FIELDS = [
    "cost_id",
    "job_id",
    "at",
    "pass_name",
    "model",
    "tokens_in",
    "tokens_out",
    "usd",
    "provenance",
]

COST_PASSES = ("rank", "tailor_cv", "tailor_cover", "other")

# ---------------------------------------------------------------------------
# Where a row's join key came from. Closed, and `verify` rejects anything else.
# ---------------------------------------------------------------------------
# Only the two `apply-time` values are written by `add` on the day of the
# application. Everything ending in `backfill` was keyed after the fact and is
# never treated as apply-time evidence, however exact the key itself is.
KEY_APPLY_TIME = "apply-time"                  # keyed from the scraped posting URL
KEY_APPLY_TIME_MANUAL = "apply-time-manual"    # applied outside the scraper; no posting to join
KEY_LATE = "late-logged-backfill"              # `add` run after the apply date
KEY_SCRAPER_BACKFILL = "scraper-match-backfill"
KEY_MANUAL_BACKFILL = "manual-backfill"
APPLY_TIME_SOURCES = (KEY_APPLY_TIME, KEY_APPLY_TIME_MANUAL)
KEY_SOURCES = APPLY_TIME_SOURCES + (KEY_LATE, KEY_SCRAPER_BACKFILL, KEY_MANUAL_BACKFILL)

# The columns `add` may fill on a new ledger row beyond the ones it derives.
ADD_OPTIONAL_COLUMNS = ("sector", "role_type", "channel", "contact_person", "fit_rating",
                        "notes", "cv_file", "cover_letter_file")

# ---------------------------------------------------------------------------
# The closed status enum.
# ---------------------------------------------------------------------------
# Closed, disjoint, and every value is a *state of the application*, never a
# non-event. `no response` is deliberately absent: "nobody replied" is not a
# state, it is the absence of a transition, and treating it as a state is what
# made the old funnel an artifact of when a cell was last hand-edited. It maps
# to `applied` (still open, nothing came back) or `lapsed` (given up on),
# and which one it is cannot be inferred, so backfill takes the conservative
# reading and flags it.

NON_TERMINAL = ("sourced", "applied", "acknowledged", "screening", "interviewing", "offer")
TERMINAL = ("skipped", "accepted", "declined", "rejected", "withdrawn", "lapsed")
STATUSES = NON_TERMINAL + TERMINAL

# Legacy free-text ledger values -> canonical enum. Read-only: this module does
# not rewrite the `status` column, because tracker.html and tools/gen_dashboard.py
# read those literals and a silent value migration would break both. The mapping
# lives here instead, and `verify` applies it.
LEGACY_STATUS = {
    "sourced": "sourced",
    "ranked": "sourced",
    "not_applied": "sourced",
    "not applied": "sourced",
    "skipped": "skipped",
    "applied": "applied",
    "no response": "applied",
    "no_response": "applied",
    "acknowledged": "acknowledged",
    "on hold": "acknowledged",
    "on_hold": "acknowledged",
    "screening": "screening",
    "phone screen": "screening",
    "interview": "interviewing",
    "interviewing": "interviewing",
    "interview_only": "lapsed",
    "offer": "offer",
    "offer_received": "offer",
    "offer_accepted": "accepted",
    "accepted": "accepted",
    "hired": "accepted",
    "declined": "declined",
    "offer_declined": "declined",
    "offer declined": "declined",
    "rejected": "rejected",
    "withdrawn": "withdrawn",
    "lapsed": "lapsed",
}

# Writing back to the projection. `tracker.html` and `tools/gen_dashboard.py` read
# the ledger's `status` literals, so `record` writes the literal those already
# understand wherever the round-trip is lossless
# (`canonical_status(LEDGER_LITERAL[x]) == x`). Canonical values with no known
# literal are written verbatim and the dashboard's own default bucketing applies;
# teaching the dashboard the full enum is a separate change and is not made here.
LEDGER_LITERAL = {
    "applied": "applied",
    "interviewing": "interview",
    "offer": "offer",
    "accepted": "offer_accepted",
    "declined": "declined",
    "rejected": "rejected",
    "withdrawn": "withdrawn",
    "sourced": "not_applied",
}

# Statuses whose legacy spelling loses information on the way in. Any row that
# arrived through one of these is flagged by `verify`, so no figure computed
# over it can be quoted as if it were observed.
LOSSY_LEGACY = {"no response", "no_response", "on hold", "on_hold", "interview_only"}


class VerifyError(Exception):
    pass


def _now() -> str:
    return _dt.datetime.now().replace(microsecond=0).isoformat()


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-") or "unknown"


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()


def canonical_status(raw: str):
    """Map a ledger status literal to the closed enum, or None if unmappable."""
    return LEGACY_STATUS.get((raw or "").strip().lower())


def scraped_job_id(url: str) -> str:
    """Stable id for a scraped posting. Keyed on the posting URL, which is the
    only field of `seen_jobs.json` that is both present on every entry and
    stable across re-scrapes."""
    return "scraped:" + hashlib.sha1(url.encode("utf-8")).hexdigest()[:12]


def manual_job_id(company: str, date: str) -> str:
    return "manual:%s-%s" % (_slug(company), (date or "undated").strip())


# ---------------------------------------------------------------------------
# I/O helpers
# ---------------------------------------------------------------------------

def read_rows(path=LEDGER):
    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        return list(reader), list(reader.fieldnames or [])


def write_rows(rows, fieldnames, path=LEDGER):
    tmp = path + ".tmp"
    with open(tmp, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, "") for k in fieldnames})
    os.replace(tmp, path)


def read_table(path, fields):
    if not os.path.exists(path):
        return []
    with open(path, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def append_table(path, fields, record):
    exists = os.path.exists(path)
    with open(path, "a", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields)
        if not exists:
            writer.writeheader()
        writer.writerow({k: record.get(k, "") for k in fields})


def load_seen_jobs(path=SEEN_JOBS):
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    return data.get("seen", data) if isinstance(data, dict) else {}


def sync_age_days(path=SYNC_STATE, today=None):
    """Days since the last gmail sync, or None if unknown."""
    if not os.path.exists(path):
        return None
    try:
        with open(path, encoding="utf-8") as fh:
            last = json.load(fh).get("last_sync")
        stamp = _dt.date.fromisoformat(str(last)[:10])
    except Exception:
        return None
    return ((today or _dt.date.today()) - stamp).days


def freshness(path=SYNC_STATE, today=None):
    """(stamp, age_days) where stamp is 'verified' | 'unverified' | 'unknown'."""
    age = sync_age_days(path, today)
    if age is None:
        return "unknown", None
    return ("verified" if age <= SYNC_STALE_DAYS else "unverified"), age


# ---------------------------------------------------------------------------
# init: add the join key, seed the event log
# ---------------------------------------------------------------------------

def _match_scraped(row, seen):
    """Best-effort company+role match into seen_jobs. Backfill only — never the
    path a new application takes, which gets its job_id at apply time."""
    company, role = _norm(row.get("company")), _norm(row.get("role"))
    if not company:
        return None
    best = None
    for url, posting in seen.items():
        pc = _norm(posting.get("company"))
        if not pc or not (pc in company or company in pc):
            continue
        pr = _norm(posting.get("title"))
        score = 2 if (pr and role and (pr in role or role in pr)) else 1
        if best is None or score > best[0]:
            best = (score, url)
    return best[1] if best else None


def cmd_init(args):
    rows, fields = read_rows(args.ledger)
    seen = load_seen_jobs(args.seen_jobs)

    added_cols = [c for c in ("job_id", "job_id_source") if c not in fields]
    if added_cols:
        shutil.copyfile(args.ledger, args.ledger + ".pre-instrument.bak")
        fields = fields + added_cols

    keyed = matched = 0
    for row in rows:
        if row.get("job_id"):
            continue
        url = _match_scraped(row, seen)
        if url:
            row["job_id"] = scraped_job_id(url)
            row["job_id_source"] = KEY_SCRAPER_BACKFILL
            matched += 1
        else:
            row["job_id"] = manual_job_id(row.get("company", ""), row.get("date", ""))
            row["job_id_source"] = KEY_MANUAL_BACKFILL
        keyed += 1

    # Duplicate manual ids (same company, same day) get a discriminator so the
    # key stays unique — a non-unique join key is not a join key.
    seen_ids = {}
    for row in rows:
        jid = row["job_id"]
        if jid in seen_ids:
            seen_ids[jid] += 1
            row["job_id"] = "%s-%d" % (jid, seen_ids[jid])
        else:
            seen_ids[jid] = 1

    write_rows(rows, fields, args.ledger)

    existing = {e["job_id"] for e in read_table(args.events, EVENT_FIELDS)}
    seeded = 0
    for row in rows:
        if row["job_id"] in existing:
            continue
        canon = canonical_status(row.get("status", ""))
        if canon is None:
            continue
        append_table(
            args.events,
            EVENT_FIELDS,
            {
                "event_id": hashlib.sha1(
                    ("seed:" + row["job_id"]).encode("utf-8")
                ).hexdigest()[:16],
                "job_id": row["job_id"],
                "at": (row.get("date") or "").strip(),
                "from_status": "",
                "to_status": canon,
                "evidence": "ledger-snapshot:" + (row.get("status") or "").strip(),
                "actor": "instrument-init",
                "provenance": "backfill",
            },
        )
        seeded += 1

    print(
        "init: %d rows keyed (%d matched to a scraped posting, %d manual), "
        "%d seed events written.\n"
        "Seed events are provenance=backfill: their `at` is the APPLY date, not the\n"
        "transition date, so no timing may be computed across them. Real timings start\n"
        "accruing from the first `record` call." % (keyed, matched, keyed - matched, seeded)
    )
    if added_cols:
        print("ledger backed up to %s" % (args.ledger + ".pre-instrument.bak"))
    return 0


# ---------------------------------------------------------------------------
# add: the apply-time path
# ---------------------------------------------------------------------------

def cmd_add(args):
    """Log one application at the moment it is made: ledger row, join key, and
    an observed `applied` event, in one step. This is the only path that earns
    an `apply-time` key; `init` can only ever back-fill."""
    rows, fields = read_rows(args.ledger)
    if "job_id" not in fields or "job_id_source" not in fields:
        raise SystemExit("the ledger has no job_id columns yet; run `init` first")

    at = args.at or _now()
    logged_on = at[:10]
    applied_on = (args.date or logged_on).strip()
    try:
        _dt.date.fromisoformat(applied_on)
        _dt.date.fromisoformat(logged_on)
    except ValueError:
        raise SystemExit("--date and --at must be ISO-8601 (YYYY-MM-DD[THH:MM:SS])")
    if applied_on > logged_on:
        raise SystemExit("apply date %s is after the logging time %s" % (applied_on, at))
    # Logged after the day it happened: the key is exact but it was not written
    # at apply time, and neither was the timestamp. Say so rather than pass it off.
    late = applied_on < logged_on

    company, role = (args.company or "").strip(), (args.role or "").strip()
    if args.manual:
        if not company or not role:
            raise SystemExit("--manual needs both --company and --role")
        job_id = manual_job_id(company, applied_on)
        taken = {r.get("job_id") for r in rows}
        n = 1
        while job_id in taken:
            n += 1
            job_id = "%s-%d" % (manual_job_id(company, applied_on), n)
        source = KEY_LATE if late else KEY_APPLY_TIME_MANUAL
        posting_url = (args.url or "").strip()
    else:
        if not args.url:
            raise SystemExit("give --url <scraped posting url>, or --manual with --company/--role")
        posting = load_seen_jobs(args.seen_jobs).get(args.url)
        if posting is None:
            raise SystemExit(
                "%s is not in seen_jobs.json. A key that does not join to a scraped posting "
                "is not a scraper key: re-run with --manual --company ... --role ... "
                "(keeping --url as the source link) if this was applied to outside the scraper."
                % args.url
            )
        job_id = scraped_job_id(args.url)
        if any(r.get("job_id") == job_id for r in rows):
            raise SystemExit(
                "job %s is already in the ledger; use `record` to change its status" % job_id
            )
        company = company or (posting.get("company") or "").strip()
        role = role or (posting.get("title") or "").strip()
        source = KEY_LATE if late else KEY_APPLY_TIME
        posting_url = args.url

    row = {k: "" for k in fields}
    row.update({
        "date": applied_on,
        "company": company,
        "role": role,
        "status": LEDGER_LITERAL["applied"],
        "source": posting_url,
        "job_id": job_id,
        "job_id_source": source,
    })
    for col in ADD_OPTIONAL_COLUMNS:
        value = getattr(args, col, None)
        if value and col in fields:
            row[col] = value
    rows.append(row)
    write_rows(rows, fields, args.ledger)

    event_at = applied_on if late else at
    append_table(
        args.events,
        EVENT_FIELDS,
        {
            "event_id": hashlib.sha1(
                ("%s|%s|%s" % (job_id, event_at, "applied")).encode("utf-8")
            ).hexdigest()[:16],
            "job_id": job_id,
            "at": event_at,
            "from_status": "",
            "to_status": "applied",
            "evidence": args.evidence or "manual",
            "actor": args.actor,
            "provenance": "backfill" if late else "observed",
        },
    )
    print("added %s (%s): applied at %s" % (job_id, source, event_at))
    if late:
        print(
            "NOTE logged %s, applied %s: flagged %s with a backfill `applied` event.\n"
            "No timing is claimable from the apply date and the row is not apply-time evidence."
            % (logged_on, applied_on, KEY_LATE)
        )
    return 0


# ---------------------------------------------------------------------------
# record / cost
# ---------------------------------------------------------------------------

def cmd_record(args):
    if args.to_status not in STATUSES:
        raise SystemExit("unknown status %r; allowed: %s" % (args.to_status, ", ".join(STATUSES)))

    rows, fields = read_rows(args.ledger)
    by_id = {r.get("job_id"): r for r in rows if r.get("job_id")}
    if args.job_id not in by_id:
        raise SystemExit("no ledger row with job_id %r (run `init` first?)" % args.job_id)

    events = read_table(args.events, EVENT_FIELDS)
    prior = [e for e in events if e["job_id"] == args.job_id]
    from_status = prior[-1]["to_status"] if prior else ""
    if from_status in TERMINAL and not args.force:
        raise SystemExit(
            "job %s is already terminal (%s); pass --force if that is genuinely wrong"
            % (args.job_id, from_status)
        )

    at = args.at or _now()
    append_table(
        args.events,
        EVENT_FIELDS,
        {
            "event_id": hashlib.sha1(
                ("%s|%s|%s" % (args.job_id, at, args.to_status)).encode("utf-8")
            ).hexdigest()[:16],
            "job_id": args.job_id,
            "at": at,
            "from_status": from_status,
            "to_status": args.to_status,
            "evidence": args.evidence or "manual",
            "actor": args.actor,
            "provenance": "observed",
        },
    )

    # Keep the projection in step. The ledger's literal vocabulary is preserved
    # where one exists, so the dashboard keeps rendering.
    row = by_id[args.job_id]
    row["status"] = LEDGER_LITERAL.get(args.to_status, args.to_status)
    if args.note and "notes" in fields:
        # Append, never overwrite: the notes cell is history too.
        existing = (row.get("notes") or "").strip()
        row["notes"] = (existing + " | " + args.note) if existing else args.note
    write_rows(rows, fields, args.ledger)
    print("recorded %s: %s -> %s at %s" % (args.job_id, from_status or "(none)", args.to_status, at))
    return 0


def cmd_cost(args):
    if args.pass_name not in COST_PASSES:
        raise SystemExit("unknown pass %r; allowed: %s" % (args.pass_name, ", ".join(COST_PASSES)))
    urls = args.url or []
    if args.job_id and urls:
        raise SystemExit("give --job-id or --url, not both")
    if urls:
        seen = load_seen_jobs(args.seen_jobs)
        missing = [u for u in urls if u not in seen]
        if missing:
            # An id derived from a url the scraper never saw would join to nothing.
            raise SystemExit("not in seen_jobs.json, so no job_id to cost: %s" % ", ".join(missing))
        job_ids = [scraped_job_id(u) for u in urls]
    elif args.job_id:
        job_ids = [args.job_id]
    else:
        raise SystemExit("give --job-id, or --url for a scraped posting")
    if len(job_ids) > 1 and any(v not in (None, "") for v in (args.tokens_in, args.tokens_out, args.usd)):
        raise SystemExit(
            "a token or USD figure belongs to one job; with several --url the pass can only "
            "be logged unmetered"
        )

    def numeric(name, value, cast):
        if value in (None, ""):
            return ""
        try:
            if cast(value) < 0:
                raise ValueError
        except ValueError:
            raise SystemExit("--%s must be a non-negative number, got %r" % (name, value))
        return str(value)

    tokens_in = numeric("tokens-in", args.tokens_in, int)
    tokens_out = numeric("tokens-out", args.tokens_out, int)
    usd = numeric("usd", args.usd, float)
    # A pass with no USD figure is logged as having happened and nothing more.
    # It is never written as 0 and `verify` never counts it as coverage: an
    # unmeasured cost is not a free one.
    metered = usd != ""

    at = args.at or _now()
    for job_id in job_ids:
        append_table(
            args.costs,
            COST_FIELDS,
            {
                "cost_id": hashlib.sha1(
                    ("%s|%s|%s" % (job_id, at, args.pass_name)).encode("utf-8")
                ).hexdigest()[:16],
                "job_id": job_id,
                "at": at,
                "pass_name": args.pass_name,
                "model": args.model,
                "tokens_in": tokens_in,
                "tokens_out": tokens_out,
                "usd": usd,
                "provenance": "observed" if metered else "unmetered",
            },
        )
        if metered:
            print("cost recorded: %s %s $%s" % (job_id, args.pass_name, usd))
        else:
            print("pass logged, UNMETERED: %s %s (no USD figure; not counted as cost coverage)"
                  % (job_id, args.pass_name))
    return 0


# ---------------------------------------------------------------------------
# verify
# ---------------------------------------------------------------------------

def verify(ledger=LEDGER, events_path=EVENTS, costs_path=COSTS, sync_path=SYNC_STATE, today=None):
    """Recompute every checkable claim from stored artifacts. No network, no
    re-execution. Returns a report dict; `ok` is False if any invariant fails."""
    rows, _ = read_rows(ledger)
    events = read_table(events_path, EVENT_FIELDS)
    costs = read_table(costs_path, COST_FIELDS)

    failures, warnings = [], []

    # 1. Every ledger row has exactly one job_id, and job_ids are unique.
    ids = [r.get("job_id", "") for r in rows]
    for i, jid in enumerate(ids):
        if not jid:
            failures.append("row %d has no job_id" % (i + 2))
    dupes = sorted({j for j in ids if j and ids.count(j) > 1})
    for jid in dupes:
        failures.append("job_id %s appears on %d rows; the join key is not unique" % (jid, ids.count(jid)))

    # 2. Every status maps into the closed enum.
    for i, row in enumerate(rows):
        if canonical_status(row.get("status", "")) is None:
            failures.append("row %d: status %r is outside the closed enum" % (i + 2, row.get("status")))

    # 3. Event-log integrity: unique ids, known job_ids, non-decreasing time.
    eids = [e["event_id"] for e in events]
    for eid in sorted({e for e in eids if eids.count(e) > 1}):
        failures.append("event_id %s is not unique; the log is not append-only" % eid)
    known = set(ids)
    per_job = {}
    for e in events:
        if e["job_id"] not in known:
            failures.append("event %s references unknown job_id %s" % (e["event_id"], e["job_id"]))
        per_job.setdefault(e["job_id"], []).append(e)
    for jid, evs in per_job.items():
        times = [e["at"] for e in evs]
        if times != sorted(times):
            failures.append("events for %s are out of order; the log is not append-only" % jid)

    # 4. Replay invariant: the log replays to the ledger's current status.
    for row in rows:
        jid, canon = row.get("job_id"), canonical_status(row.get("status", ""))
        evs = per_job.get(jid, [])
        if not evs:
            failures.append("job %s has no events; the log is not the source of truth for it" % jid)
            continue
        replayed = evs[-1]["to_status"]
        if canon is not None and replayed != canon:
            failures.append(
                "replay mismatch on %s: log ends at %r, ledger says %r" % (jid, replayed, canon)
            )

    # 5. Dispositions sum to N.
    dispositions = {}
    for row in rows:
        canon = canonical_status(row.get("status", "")) or "UNMAPPED"
        dispositions[canon] = dispositions.get(canon, 0) + 1
    if sum(dispositions.values()) != len(rows):
        failures.append("dispositions do not sum to N")

    # 6. Provenance accounting — what may be claimed at all.
    observed = [e for e in events if e["provenance"] == "observed"]
    backfilled_jobs = {
        jid for jid, evs in per_job.items() if any(e["provenance"] == "backfill" for e in evs)
    }
    timing_eligible = []
    for jid, evs in per_job.items():
        obs = [e for e in evs if e["provenance"] == "observed"]
        # A timing is real only between two observed events on the same job.
        if len(obs) >= 2:
            timing_eligible.append(jid)

    lossy = sum(1 for r in rows if (r.get("status") or "").strip().lower() in LOSSY_LEGACY)
    if lossy:
        warnings.append(
            "%d rows carry a legacy status whose canonical mapping is lossy (%s); "
            "no figure over them is observed evidence"
            % (lossy, ", ".join(sorted(LOSSY_LEGACY)))
        )

    for i, row in enumerate(rows):
        src = row.get("job_id_source", "")
        if row.get("job_id") and src not in KEY_SOURCES:
            failures.append("row %d: job_id_source %r is outside the closed set" % (i + 2, src))
    apply_time_keyed = sum(1 for r in rows if r.get("job_id_source") in APPLY_TIME_SOURCES)
    rank_joinable = sum(1 for r in rows if r.get("job_id_source") == KEY_APPLY_TIME)

    backfilled_keys = sum(1 for r in rows if r.get("job_id_source", "").endswith("backfill"))
    if backfilled_keys:
        warnings.append(
            "%d job_ids were back-filled (company match or late logging), not written at "
            "apply time; rank-vs-outcome over them is suggestive, not evidence" % backfilled_keys
        )

    # 7. Cost coverage.
    # Coverage means a USD figure exists for a job that is in the ledger. An
    # unmetered pass (no figure) and a costed posting that was never applied to
    # are both reported, and neither is coverage.
    metered = [c for c in costs if (c.get("usd") or "").strip() != ""]
    unmetered = len(costs) - len(metered)
    costed_jobs = {c["job_id"] for c in metered} & known
    pass_logged_jobs = {c["job_id"] for c in costs} & known
    outside_ledger = sum(1 for c in costs if c["job_id"] not in known)
    try:
        total_usd = round(sum(float(c["usd"]) for c in metered), 6)
    except ValueError:
        failures.append("costs.csv has a non-numeric usd value")
        total_usd = None
    if unmetered:
        warnings.append(
            "%d of %d cost records are unmetered (pass logged, no USD figure); "
            "they are not cost coverage" % (unmetered, len(costs))
        )

    # 8. Freshness.
    stamp, age = freshness(sync_path, today)
    if stamp != "verified":
        warnings.append(
            "gmail_sync is %s (last sync %s days ago); every figure derived from replies "
            "is stamped `unverified`" % (stamp, age)
        )

    return {
        "ok": not failures,
        "checked_at": _now(),
        "ledger_rows": len(rows),
        "events": len(events),
        "observed_events": len(observed),
        "backfilled_jobs": len(backfilled_jobs),
        "timing_eligible_jobs": len(timing_eligible),
        "apply_time_keyed_jobs": apply_time_keyed,
        "rank_joinable_jobs": rank_joinable,
        "backfilled_keys": backfilled_keys,
        "dispositions": dispositions,
        "cost_records": len(costs),
        "cost_unmetered_records": unmetered,
        "cost_covered_jobs": len(costed_jobs),
        "cost_pass_logged_jobs": len(pass_logged_jobs),
        "cost_records_outside_ledger": outside_ledger,
        "total_usd": total_usd,
        "sync_stamp": stamp,
        "sync_age_days": age,
        "failures": failures,
        "warnings": warnings,
    }


def cmd_verify(args):
    report = verify(args.ledger, args.events, args.costs, args.sync_state)
    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print("verify: %s" % ("OK" if report["ok"] else "FAILED"))
        print("  ledger rows          %s" % report["ledger_rows"])
        print("  events               %s (%s observed)" % (report["events"], report["observed_events"]))
        print("  timing-eligible jobs %s" % report["timing_eligible_jobs"])
        print("  apply-time keyed     %s (%s joinable to a ranked posting)"
              % (report["apply_time_keyed_jobs"], report["rank_joinable_jobs"]))
        print("  cost-covered jobs    %s / %s  ($%s)"
              % (report["cost_covered_jobs"], report["ledger_rows"], report["total_usd"]))
        print("  cost records         %s (%s unmetered, %s on postings not in the ledger)"
              % (report["cost_records"], report["cost_unmetered_records"],
                 report["cost_records_outside_ledger"]))
        print("  gmail sync           %s (%s days)" % (report["sync_stamp"], report["sync_age_days"]))
        for w in report["warnings"]:
            print("  WARN  %s" % w)
        for f in report["failures"]:
            print("  FAIL  %s" % f)
    return 0 if report["ok"] else 1


def cmd_status(args):
    report = verify(args.ledger, args.events, args.costs, args.sync_state)
    print("dispositions (local only — not a publishable figure):")
    for k in STATUSES:
        if report["dispositions"].get(k):
            print("  %-14s %s" % (k, report["dispositions"][k]))
    print("  %-14s %s" % ("TOTAL", report["ledger_rows"]))
    print("gmail sync: %s (%s days)" % (report["sync_stamp"], report["sync_age_days"]))
    return 0


# ---------------------------------------------------------------------------

def build_parser():
    p = argparse.ArgumentParser(prog="instrument", description=__doc__.split("\n")[0])
    p.add_argument("--ledger", default=LEDGER)
    p.add_argument("--events", default=EVENTS)
    p.add_argument("--costs", default=COSTS)
    p.add_argument("--seen-jobs", dest="seen_jobs", default=SEEN_JOBS)
    p.add_argument("--sync-state", dest="sync_state", default=SYNC_STATE)
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("init", help="add the join key and seed the event log (idempotent)")

    a = sub.add_parser("add", help="log an application at apply time: row + job_id + event")
    a.add_argument("--url", default=None, help="the scraped posting's url (the seen_jobs key)")
    a.add_argument("--manual", action="store_true",
                   help="applied outside the scraper; needs --company and --role")
    a.add_argument("--company", default=None)
    a.add_argument("--role", default=None)
    a.add_argument("--date", default=None,
                   help="apply date, YYYY-MM-DD; defaults to today. An earlier date is "
                        "logged as %s, not apply-time" % KEY_LATE)
    for col in ADD_OPTIONAL_COLUMNS:
        a.add_argument("--" + col.replace("_", "-"), dest=col, default=None)
    a.add_argument("--evidence", default="manual", help="manual | url | gmail:<message-id>")
    a.add_argument("--actor", default=os.environ.get("USER", "operator"))
    a.add_argument("--at", default=None, help="ISO-8601 logging time; defaults to now")

    r = sub.add_parser("record", help="append one status transition")
    r.add_argument("--job-id", dest="job_id", required=True)
    r.add_argument("--to", dest="to_status", required=True, choices=STATUSES)
    r.add_argument("--evidence", default="manual", help="gmail:<message-id> | manual | url")
    r.add_argument("--actor", default=os.environ.get("USER", "operator"))
    r.add_argument("--at", default=None, help="ISO-8601; defaults to now")
    r.add_argument("--force", action="store_true")
    r.add_argument("--note", default=None, help="appended to the row's notes cell")

    c = sub.add_parser("cost", help="append one per-application cost record")
    c.add_argument("--job-id", dest="job_id", default=None)
    c.add_argument("--url", action="append", default=None,
                   help="a scraped posting's url, instead of --job-id; repeatable for a "
                        "batch pass, which is then logged unmetered")
    c.add_argument("--pass", dest="pass_name", required=True, choices=COST_PASSES)
    c.add_argument("--model", required=True)
    # Optional on purpose: when the figure is not observable at the call site the
    # pass is logged unmetered. Never pass an estimate here.
    c.add_argument("--tokens-in", dest="tokens_in", default=None)
    c.add_argument("--tokens-out", dest="tokens_out", default=None)
    c.add_argument("--usd", default=None)
    c.add_argument("--at", default=None)

    v = sub.add_parser("verify", help="recompute every checkable claim offline")
    v.add_argument("--json", action="store_true")

    sub.add_parser("status", help="local disposition summary")
    return p


HANDLERS = {
    "init": cmd_init,
    "add": cmd_add,
    "record": cmd_record,
    "cost": cmd_cost,
    "verify": cmd_verify,
    "status": cmd_status,
}


def main(argv=None):
    args = build_parser().parse_args(argv)
    return HANDLERS[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
