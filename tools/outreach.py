#!/usr/bin/env python3
"""Outreach queue: what to send, to whom, on which day. It never sends anything.

Backs the application-outreach rule in
.claude/skills/job-application-assistant/09-referral-outreach.md. The agent drafts
messages into a plain-text file; `load` lints every message and refuses the file if
one fails; `start` dates the queue from the day the application went in; `due` and
`notify` tell the candidate what to send today. The candidate sends each message by
hand and marks it with `sent`.

The queue (outreach_queue.csv) names real people and is gitignored. Stdlib only.

Draft-file format, one block per message:

    @@research: documents/applications/<app>/outreach_research.md
    @@ key: hm | track: hiring_manager | channel: linkedin_connect | contact: Asha Rao | ref: https://www.linkedin.com/in/... | hook: runs the team the posting names
    Hi Asha, ...
    @@end
    @@ key: hm-f1 | after: hm | channel: linkedin_message | gap: 5
    Thanks for connecting, Asha. ...
    @@end

Text outside the blocks is free notes for the candidate and is ignored here.

Usage:
    python3 tools/outreach.py load cover_letters/outreach_<company>_<role>.txt --app <company>_<role> --company "<Company>" --role "<Role>"
    python3 tools/outreach.py start --app <company>_<role> [--date YYYY-MM-DD]
    python3 tools/outreach.py due [--date YYYY-MM-DD] [--text]
    python3 tools/outreach.py sent <id> | skip <id> | replied <id> | close --app <app>
    python3 tools/outreach.py notify
    python3 tools/outreach.py lint --channel linkedin_connect --contact "Asha Rao" < note.txt
"""

import argparse
import csv
import datetime as dt
import difflib
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QUEUE = ROOT / "outreach_queue.csv"
TRACKER = ROOT / "tracker.html"

FIELDS = ["id", "app", "company", "role", "track", "channel", "contact", "ref", "hook",
          "after", "offset_days", "due", "status", "sent_on", "subject", "text", "source"]

# Day offset from the application date for the first message on each track. The
# careers email and the hiring-manager note go out on the day of the application;
# engineers follow, recruiters last.
TRACK_OFFSET = {"careers_email": 0, "hiring_manager": 0, "engineer": 2, "recruiter": 5}
CHANNELS = ("email", "linkedin_connect", "linkedin_message", "inmail")
LINKEDIN_SPACING = 2      # min days between first LinkedIn touches at one company
FOLLOWUP_GAP = 5          # default days from a sent message to its follow-up
MAX_FOLLOWUPS = 2         # per contact, same cap as /outcome's follow-up branch
OPEN = ("drafted", "waiting", "pending")

CHAR_LIMIT = {"linkedin_connect": 300}
WORD_LIMIT = {"email": 150, "linkedin_message": 120, "inmail": 100}
SUBJECT_LIMIT = 60

# Phrases that mark a message as templated or machine-written. Each one is a hard
# failure: the reader has seen it in a hundred other notes this month.
BANNED = [
    r"hope (this|my) (message|email|note) finds you",
    r"hope you('re| are) (doing )?well",
    r"\bI came across\b", r"\bstumbled (up)?on\b",
    r"\b(I am|I'm|I was) (reaching|writing) out\b", r"\breaching out\b",
    r"\bpassionate\b", r"\bthrilled\b", r"\bexcited (to|about|by)\b", r"\bkeen (to|on)\b",
    r"\bleverag(e|ing)\b", r"\bdelv(e|ing)\b", r"\bsynerg", r"\bseamless", r"\brobust\b",
    r"\bcutting[- ]edge\b", r"\binnovative\b", r"\bfast[- ]paced\b", r"\bdynamic\b",
    r"\balign(s|ed)? (well |perfectly |closely )?with\b", r"\bresonate", r"\btestament\b",
    r"\bgreat fit\b", r"\bperfect fit\b", r"\bideal candidate\b",
    r"\bpick your brain\b", r"\btouch base\b", r"\bcircle back\b",
    r"\bjust (checking|following) (in|up)\b", r"\bbump(ing)? this\b",
    r"\bI would love to\b", r"\bI'd love to\b", r"\bat your earliest convenience\b",
    r"\bimpressed by\b", r"\binspir(ed|ing)\b", r"\bjourney\b", r"\blandscape\b",
    r"\b(additionally|furthermore|moreover)\b", r"\bnot (just|only)\b.{0,60}\bbut\b",
    r"\b(tapestry|pivotal|intricate|underscores?|foster(s|ing)?|crucial|spearheaded|enhanc(e|ing))\b",
    r"\bexpress my interest\b", r"\bwelcome the opportunity\b",
    r"\blook(ing)? forward to hearing\b", r"\bthank you for your time\b", r"\bthanks in advance\b",
    r"\bkindly\b", r"\bdo the needful\b", r"\besteemed\b", r"\brespected\b",
    r"\bdear sir\b", r"\bsir/madam\b", r"\bPFA\b", r"\bto whom it may concern\b",
]
BANNED_RE = [re.compile(p, re.I) for p in BANNED]


def lint(text, channel, contact="", track="", subject=""):
    """Return (errors, warnings) for one message. Errors block `load`."""
    errors, warnings = [], []
    body = text.strip()
    if not body:
        return ["empty message"], warnings
    if re.search(r"[—–]|--", body + subject):
        errors.append("contains an em-dash, en-dash or '--'")
    if re.search(r"[‘’“”]", body + subject):
        errors.append("contains curly quotes; use plain ' and \"")
    if "**" in body or re.search(r"^#{1,6} ", body, re.M):
        errors.append("contains markdown; the box it is pasted into shows it literally")
    if re.search(r"\[[^\]]*\]|\{\{|<[A-Z_ ]+>", body + subject):
        errors.append("contains an unfilled placeholder")
    if body.count("!") > 1:
        errors.append("more than one exclamation mark")
    for rx in BANNED_RE:
        m = rx.search(body) or rx.search(subject)
        if m:
            errors.append(f"banned phrase: \"{m.group(0)}\"")
    if channel in CHAR_LIMIT and len(body) > CHAR_LIMIT[channel]:
        errors.append(f"{len(body)} characters, limit {CHAR_LIMIT[channel]}")
    words = len(body.split())
    if channel in WORD_LIMIT and words > WORD_LIMIT[channel]:
        errors.append(f"{words} words, limit {WORD_LIMIT[channel]}")
    if channel == "email" and subject and len(subject) > SUBJECT_LIMIT:
        errors.append(f"subject is {len(subject)} characters, limit {SUBJECT_LIMIT}")
    first = contact.split()[0] if contact.split() else ""
    if first and track != "careers_email" and first.lower() not in body[:80].lower():
        errors.append(f"does not greet {first} by name in the opening")
    if len(re.findall(r"\d\s*%|\d\s*(?:->|to)\s*~?\d", body)) > 1 and channel != "email":
        warnings.append("more than one metric; pick the one that maps to their work")
    if re.search(r"[^\x00-\x7f]", body):
        warnings.append("non-ASCII characters; check they survive the paste")
    sentences = [s for s in re.split(r"(?<=[.?!])\s+", body) if s]
    if len(sentences) >= 3 and sum(s.startswith("I ") for s in sentences) == len(sentences):
        warnings.append("every sentence starts with 'I'")
    return errors, warnings


def parse_drafts(path):
    """Parse a draft file into (research_path, [block dict])."""
    research, blocks, cur = "", [], None
    for n, line in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        if cur is None:
            if line.startswith("@@research:"):
                research = line.split(":", 1)[1].strip()
            elif line.startswith("@@") and line.strip() != "@@end":
                cur = {"_line": n, "_text": []}
                for part in line[2:].split("|"):
                    if ":" in part:
                        k, v = part.split(":", 1)
                        cur[k.strip()] = v.strip()
        elif line.strip() == "@@end":
            lines = cur.pop("_text")
            cur["subject"] = ""
            if lines and lines[0].lower().startswith("subject:"):
                cur["subject"] = lines.pop(0).split(":", 1)[1].strip()
            cur["text"] = "\n".join(lines).strip()
            blocks.append(cur)
            cur = None
        else:
            cur["_text"].append(line)
    if cur is not None:
        raise SystemExit(f"{path}: block opened on line {cur['_line']} has no @@end")
    return research, blocks


def read_queue(path):
    if not Path(path).exists():
        return []
    with open(path, newline="", encoding="utf-8") as f:
        return [{k: r.get(k, "") or "" for k in FIELDS} for r in csv.DictReader(f)]


def write_queue(path, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)


def parse_date(s):
    return dt.date.fromisoformat(s) if s else dt.date.today()


def workday(d):
    """A message that lands on a weekend is sent on Monday instead."""
    return d + dt.timedelta(days={5: 2, 6: 1}.get(d.weekday(), 0))


def find(rows, rid):
    hits = [r for r in rows if r["id"] == rid]
    if not hits:
        raise SystemExit(f"no queue row with id {rid}")
    return hits[0]


def chain_root(by_key, b):
    seen = set()
    while b.get("after"):
        if b["key"] in seen or b["after"] not in by_key:
            raise SystemExit(f"block {b['key']}: 'after: {b['after']}' does not resolve")
        seen.add(b["key"])
        b = by_key[b["after"]]
    return b


def cmd_load(a):
    research, blocks = parse_drafts(a.file)
    problems = []
    if not research:
        problems.append("no '@@research:' line; the research pass is not optional")
    elif not (ROOT / research).is_file():
        problems.append(f"research notes not found at {research}")
    if not blocks:
        problems.append("no message blocks found")
    by_key = {}
    for b in blocks:
        if not b.get("key"):
            problems.append(f"line {b['_line']}: block has no key")
        elif b["key"] in by_key:
            problems.append(f"duplicate key {b['key']}")
        else:
            by_key[b["key"]] = b
    if problems:
        raise SystemExit("REFUSED " + a.file + "\n  " + "\n  ".join(problems))

    followups = {}
    for b in blocks:
        root = chain_root(by_key, b)
        for k in ("track", "contact", "ref", "hook"):
            b.setdefault(k, root.get(k, ""))
        where = f"{b['key']} (line {b['_line']})"
        if b.get("track") not in TRACK_OFFSET:
            problems.append(f"{where}: track must be one of {', '.join(TRACK_OFFSET)}")
        if b.get("channel") not in CHANNELS:
            problems.append(f"{where}: channel must be one of {', '.join(CHANNELS)}")
        if not b.get("contact") or not b.get("ref"):
            problems.append(f"{where}: needs contact and ref (profile URL or email address)")
        if b.get("after"):
            followups[root["key"]] = followups.get(root["key"], 0) + 1
            if followups[root["key"]] > MAX_FOLLOWUPS:
                problems.append(f"{where}: more than {MAX_FOLLOWUPS} follow-ups to one contact")
        else:
            if b.get("track") != "careers_email" and not b.get("hook"):
                problems.append(f"{where}: needs a hook, or 'hook: none' to label a generic note")
            if b.get("channel") == "email" and not b.get("subject"):
                problems.append(f"{where}: an email needs a 'Subject:' first line")
        errors, warnings = lint(b["text"], b.get("channel", ""), b.get("contact", ""),
                                b.get("track", ""), b.get("subject", ""))
        problems += [f"{where}: {e}" for e in errors]
        for w in warnings:
            print(f"warning  {where}: {w}")

    # Two notes that survive swapping the names were not written for a person.
    firsts = [b for b in blocks if not b.get("after") and b.get("track") != "careers_email"]
    strip = lambda b: re.sub(re.escape(b.get("contact", "").split()[0]) if b.get("contact") else "$^",
                             "", b["text"], flags=re.I)
    for i, x in enumerate(firsts):
        for y in firsts[i + 1:]:
            if difflib.SequenceMatcher(None, strip(x), strip(y)).ratio() > 0.8:
                problems.append(f"{x['key']} and {y['key']} are interchangeable; "
                                "give each its own hook")
    if problems:
        raise SystemExit("REFUSED " + a.file + "\n  " + "\n  ".join(problems))

    rows = read_queue(a.queue)
    existing = {r["id"]: r for r in rows}
    added = updated = kept = 0
    for b in blocks:
        rid = f"{a.app}:{b['key']}"
        after = f"{a.app}:{b['after']}" if b.get("after") else ""
        offset = b.get("gap", FOLLOWUP_GAP) if after else b.get("offset", TRACK_OFFSET[b["track"]])
        new = {"id": rid, "app": a.app, "company": a.company, "role": a.role,
               "track": b["track"], "channel": b["channel"], "contact": b["contact"],
               "ref": b["ref"], "hook": b.get("hook", ""), "after": after,
               "offset_days": str(int(offset)), "due": "", "status": "drafted",
               "sent_on": "", "subject": b["subject"], "text": b["text"], "source": a.file}
        old = existing.get(rid)
        if old is None:
            rows.append(new)
            added += 1
        elif old["status"] in OPEN:
            # Redrafting must not lose the schedule a started queue already has.
            new.update(due=old["due"], status=old["status"])
            old.update(new)
            updated += 1
        else:
            kept += 1
    write_queue(a.queue, rows)
    print(f"loaded {a.app}: {added} added, {updated} redrafted, {kept} already resolved. "
          "Nothing is scheduled until `start`.")


def cmd_start(a):
    rows = read_queue(a.queue)
    mine = [r for r in rows if r["app"] == a.app]
    if not mine:
        raise SystemExit(f"no queue rows for {a.app}; run `load` first")
    day0 = parse_date(a.date)
    last_linkedin = None
    for r in sorted(mine, key=lambda r: int(r["offset_days"] or 0)):
        if r["status"] != "drafted":
            continue
        if r["after"]:
            r["status"] = "waiting"
            continue
        due = workday(day0 + dt.timedelta(days=int(r["offset_days"] or 0)))
        if r["channel"] != "email":
            if last_linkedin and due < last_linkedin + dt.timedelta(days=LINKEDIN_SPACING):
                due = workday(last_linkedin + dt.timedelta(days=LINKEDIN_SPACING))
            last_linkedin = due
        r["due"], r["status"] = due.isoformat(), "pending"
    write_queue(a.queue, rows)
    for r in sorted(mine, key=lambda r: r["due"] or "9"):
        print(f"{r['due'] or 'after ' + r['after'].split(':', 1)[1]:<14} {r['track']:<15} "
              f"{r['channel']:<17} {r['contact']}")


def due_rows(rows, today):
    return sorted((r for r in rows if r["status"] == "pending" and r["due"]
                   and dt.date.fromisoformat(r["due"]) <= today),
                  key=lambda r: (r["due"], r["company"]))


def cmd_due(a):
    today = parse_date(a.date)
    hits = due_rows(read_queue(a.queue), today)
    if not hits:
        print("Nothing to send today.")
        return
    for r in hits:
        late = (today - dt.date.fromisoformat(r["due"])).days
        print(f"{r['id']}\n  {r['company']}, {r['role']}\n  {r['track']} via {r['channel']} "
              f"to {r['contact']}  {r['ref']}\n  due {r['due']}" + (f" ({late}d late)" if late else ""))
        if r["after"] and r["channel"] != "email":
            print("  send only if they accepted the connection; otherwise `skip` it")
        if a.text:
            if r["subject"]:
                print(f"  Subject: {r['subject']}")
            print("  " + r["text"].replace("\n", "\n  "))
        print()
    print(f"{len(hits)} to send. Mark each: python3 tools/outreach.py sent <id>")


def close_children(rows, rid, status="closed"):
    for r in rows:
        if r["after"] == rid and r["status"] in OPEN:
            r["status"] = status
            close_children(rows, r["id"], status)


def cmd_sent(a):
    rows = read_queue(a.queue)
    r = find(rows, a.id)
    day = parse_date(a.date)
    r["status"], r["sent_on"] = "sent", day.isoformat()
    for c in rows:
        if c["after"] == r["id"] and c["status"] in ("drafted", "waiting"):
            c["due"] = workday(day + dt.timedelta(days=int(c["offset_days"] or FOLLOWUP_GAP))).isoformat()
            c["status"] = "pending"
            print(f"follow-up {c['id']} is due {c['due']}")
    write_queue(a.queue, rows)
    print(f"marked sent: {r['id']}")


def cmd_skip(a):
    rows = read_queue(a.queue)
    r = find(rows, a.id)
    r["status"] = "skipped"
    close_children(rows, r["id"])
    write_queue(a.queue, rows)
    print(f"skipped {r['id']} and its follow-ups")


def cmd_replied(a):
    """They answered: nothing further is owed to this person from the queue."""
    rows = read_queue(a.queue)
    r = find(rows, a.id)
    n = 0
    for c in rows:
        if c["app"] == r["app"] and c["contact"] == r["contact"] and c["status"] in OPEN:
            c["status"] = "closed"
            n += 1
    write_queue(a.queue, rows)
    print(f"{r['contact']} replied: closed {n} queued message(s) to them")


def cmd_close(a):
    rows = read_queue(a.queue)
    n = 0
    for r in rows:
        if r["app"] == a.app and r["status"] in OPEN:
            r["status"] = "closed"
            n += 1
    write_queue(a.queue, rows)
    print(f"closed {n} queued message(s) for {a.app}")


def cmd_status(a):
    rows = read_queue(a.queue)
    apps = {}
    for r in rows:
        apps.setdefault(r["app"], {}).setdefault(r["status"], 0)
        apps[r["app"]][r["status"]] += 1
    for app, counts in sorted(apps.items()):
        print(f"{app:<50} " + ", ".join(f"{k} {v}" for k, v in sorted(counts.items())))
    if not apps:
        print("The outreach queue is empty.")


def cmd_notify(a):
    hits = due_rows(read_queue(a.queue), parse_date(a.date))
    if not hits:
        print("nothing due")
        return
    per = {}
    for r in hits:
        per[r["company"]] = per.get(r["company"], 0) + 1
    body = ", ".join(f"{c} ({n})" for c, n in per.items())
    title = f"{len(hits)} outreach message{'s' if len(hits) != 1 else ''} to send"
    print(f"{title}: {body}")
    if a.dry_run or sys.platform != "darwin":
        return
    esc = lambda s: s.replace("\\", "\\\\").replace('"', '\\"')
    subprocess.run(["osascript", "-e",
                    f'display notification "{esc(body)}. Open {TRACKER}" '
                    f'with title "{esc(title)}" sound name "Glass"'], check=False)


def cmd_lint(a):
    text = sys.stdin.read()
    subject = ""
    if text.lower().startswith("subject:"):
        head, _, text = text.partition("\n")
        subject = head.split(":", 1)[1].strip()
    errors, warnings = lint(text, a.channel, a.contact, a.track, subject)
    for w in warnings:
        print(f"warning  {w}")
    for e in errors:
        print(f"FAIL     {e}")
    n = len(text.strip())
    print(f"{n} characters, {len(text.split())} words")
    return 1 if errors else 0


def main(argv=None):
    p = argparse.ArgumentParser(prog="outreach", description=__doc__.split("\n\n")[0])
    p.add_argument("--queue", default=str(QUEUE))
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("load", help="lint a draft file and add its messages to the queue")
    s.add_argument("file")
    s.add_argument("--app", required=True, help="<company>_<role> slug, as in documents/applications/")
    s.add_argument("--company", required=True)
    s.add_argument("--role", required=True)
    s.set_defaults(fn=cmd_load)

    s = sub.add_parser("start", help="date the queue from the day the application went in")
    s.add_argument("--app", required=True)
    s.add_argument("--date")
    s.set_defaults(fn=cmd_start)

    s = sub.add_parser("due", help="list what to send today")
    s.add_argument("--date")
    s.add_argument("--text", action="store_true", help="print each message, ready to paste")
    s.set_defaults(fn=cmd_due)

    for name, fn, hlp in (("sent", cmd_sent, "mark a message sent and date its follow-up"),
                          ("skip", cmd_skip, "drop a message and its follow-ups"),
                          ("replied", cmd_replied, "the contact answered: stop messaging them")):
        s = sub.add_parser(name, help=hlp)
        s.add_argument("id")
        if name == "sent":
            s.add_argument("--date")
        s.set_defaults(fn=fn)

    s = sub.add_parser("close", help="the application is resolved: close its whole queue")
    s.add_argument("--app", required=True)
    s.set_defaults(fn=cmd_close)

    s = sub.add_parser("status", help="queue counts per application")
    s.set_defaults(fn=cmd_status)

    s = sub.add_parser("notify", help="desktop notification when something is due")
    s.add_argument("--date")
    s.add_argument("--dry-run", action="store_true")
    s.set_defaults(fn=cmd_notify)

    s = sub.add_parser("lint", help="check one message from stdin against the voice rules")
    s.add_argument("--channel", required=True, choices=CHANNELS)
    s.add_argument("--contact", default="")
    s.add_argument("--track", default="")
    s.set_defaults(fn=cmd_lint)

    a = p.parse_args(argv)
    return a.fn(a) or 0


if __name__ == "__main__":
    sys.exit(main())
