"""Guards for the outreach queue (tools/outreach.py) and the rule file it backs.

The queue is the mechanical half of the application-outreach rule: the gate that
refuses a templated message, the schedule that spaces messages out, and the
reminder. The rule's other half is prose in 09-referral-outreach.md, so the last
class pins the invariants that would otherwise erode silently, the draft-only rule
above all.
"""
import contextlib
import io
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "tools"))
import outreach  # noqa: E402

RULE = REPO / ".claude" / "skills" / "job-application-assistant" / "09-referral-outreach.md"
APPLY = REPO / ".claude" / "commands" / "apply.md"
OUTCOME = REPO / ".claude" / "commands" / "outcome.md"

HM = ("Hi Asha, I applied for the Senior AI Engineer role on your retrieval team. "
      "I rebuilt a failing cosine search as hybrid retrieval last year. "
      "Could I ask you two questions about the team?")
ENG = ("Hi Ravi, your post on eval drift matched a problem I hit in production. "
       "I applied for the Senior AI Engineer role there. Is the on-call load on the "
       "agents team as heavy as the posting suggests?")
DRAFTS = f"""Outreach: Acme, Senior AI Engineer. Nothing below has been sent.

@@research: README.md
@@ key: careers | track: careers_email | channel: email | contact: Acme Careers | ref: careers@acme.example
Subject: Senior AI Engineer application, job 4412
Hello, I applied today for the Senior AI Engineer role, job 4412. My CV is attached.
Could you tell me who is handling this requisition?
@@end
@@ key: hm | track: hiring_manager | channel: linkedin_connect | contact: Asha Rao | ref: https://www.linkedin.com/in/asha | hook: runs the retrieval team
{HM}
@@end
@@ key: hm-f1 | after: hm | channel: linkedin_message
Thanks for connecting, Asha. My two questions: what breaks most often in retrieval today, and what would a new senior engineer own first?
@@end
@@ key: eng | track: engineer | channel: linkedin_connect | contact: Ravi Iyer | ref: https://www.linkedin.com/in/ravi | hook: posted about eval drift
{ENG}
@@end
@@ key: rec | track: recruiter | channel: linkedin_connect | contact: Meera Nair | ref: https://www.linkedin.com/in/meera | hook: none
Hi Meera, I applied on Monday for the Senior AI Engineer role, job 4412. I am in Bengaluru and can join at once. Who is the right person to ask about its status?
@@end
"""


def run(*argv):
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        outreach.main(list(argv))
    return out.getvalue()


class Lint(unittest.TestCase):
    def errs(self, text, channel="linkedin_connect", contact="Asha Rao", **kw):
        return outreach.lint(text, channel, contact, **kw)[0]

    def test_clean_note_passes(self):
        self.assertEqual(self.errs(HM), [])

    def test_template_openers_fail(self):
        for bad in ("Hi Asha, I hope this message finds you well.",
                    "Hi Asha, I came across your profile.",
                    "Hi Asha, I am reaching out about a role.",
                    "Hi Asha, I am passionate about retrieval."):
            self.assertTrue(any("banned phrase" in e for e in self.errs(bad)), bad)

    def test_dashes_and_curly_quotes_fail(self):
        self.assertTrue(self.errs("Hi Asha, I build agents — in production."))
        self.assertTrue(self.errs("Hi Asha, I build agents -- in production."))
        self.assertTrue(self.errs("Hi Asha, I’ve applied."))

    def test_connection_note_capped_at_300_characters(self):
        self.assertTrue(any("limit 300" in e for e in self.errs("Hi Asha, " + "word " * 70)))

    def test_placeholder_fails(self):
        self.assertTrue(any("placeholder" in e for e in self.errs("Hi Asha, I applied to [Company].")))

    def test_wrong_name_fails(self):
        self.assertTrue(any("greet" in e for e in self.errs(HM, contact="Ravi Iyer")))


class Queue(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.q = str(Path(self.tmp.name) / "queue.csv")
        self.f = Path(self.tmp.name) / "outreach_acme.txt"
        self.f.write_text(DRAFTS, encoding="utf-8")

    def load(self):
        return run("--queue", self.q, "load", str(self.f), "--app", "acme_sae",
                   "--company", "Acme", "--role", "Senior AI Engineer")

    def rows(self):
        return {r["id"].split(":")[1]: r for r in outreach.read_queue(self.q)}

    def test_load_schedules_nothing(self):
        self.load()
        self.assertTrue(all(r["status"] == "drafted" and not r["due"] for r in self.rows().values()))
        self.assertIn("Nothing to send", run("--queue", self.q, "due", "--date", "2026-12-31"))

    def test_start_orders_and_spaces_the_tracks(self):
        self.load()
        run("--queue", self.q, "start", "--app", "acme_sae", "--date", "2026-10-12")  # a Monday
        r = self.rows()
        self.assertEqual(r["careers"]["due"], "2026-10-12")
        self.assertEqual(r["hm"]["due"], "2026-10-12")
        self.assertEqual(r["eng"]["due"], "2026-10-14")
        self.assertGreaterEqual(r["rec"]["due"], "2026-10-16")
        self.assertEqual(r["hm-f1"]["status"], "waiting")

    def test_weekend_moves_to_monday(self):
        self.load()
        run("--queue", self.q, "start", "--app", "acme_sae", "--date", "2026-10-17")  # a Saturday
        self.assertEqual(self.rows()["hm"]["due"], "2026-10-19")

    def test_followup_is_dated_from_the_send(self):
        self.load()
        run("--queue", self.q, "start", "--app", "acme_sae", "--date", "2026-10-12")
        run("--queue", self.q, "sent", "acme_sae:hm", "--date", "2026-10-13")
        f = self.rows()["hm-f1"]
        self.assertEqual((f["status"], f["due"]), ("pending", "2026-10-19"))

    def test_reply_stops_messages_to_that_contact_only(self):
        self.load()
        run("--queue", self.q, "start", "--app", "acme_sae", "--date", "2026-10-12")
        run("--queue", self.q, "sent", "acme_sae:hm", "--date", "2026-10-12")
        run("--queue", self.q, "replied", "acme_sae:hm")
        r = self.rows()
        self.assertEqual(r["hm-f1"]["status"], "closed")
        self.assertEqual(r["eng"]["status"], "pending")

    def test_close_empties_the_application(self):
        self.load()
        run("--queue", self.q, "start", "--app", "acme_sae", "--date", "2026-10-12")
        run("--queue", self.q, "close", "--app", "acme_sae")
        self.assertIn("Nothing to send", run("--queue", self.q, "due", "--date", "2026-12-31"))

    def test_redraft_keeps_sent_rows_and_the_schedule(self):
        self.load()
        run("--queue", self.q, "start", "--app", "acme_sae", "--date", "2026-10-12")
        run("--queue", self.q, "sent", "acme_sae:hm", "--date", "2026-10-12")
        self.load()
        r = self.rows()
        self.assertEqual(r["hm"]["status"], "sent")
        self.assertEqual(r["eng"]["due"], "2026-10-14")

    def refused(self, drafts):
        self.f.write_text(drafts, encoding="utf-8")
        with self.assertRaises(SystemExit) as cm:
            self.load()
        return str(cm.exception)

    def test_refuses_a_file_with_no_research(self):
        self.assertIn("research", self.refused(DRAFTS.replace("@@research: README.md\n", "")))

    def test_refuses_a_banned_phrase(self):
        self.assertIn("banned phrase", self.refused(DRAFTS.replace("Hi Ravi, your post", "Hi Ravi, I came across your post")))

    def test_refuses_a_missing_hook(self):
        self.assertIn("hook", self.refused(DRAFTS.replace(" | hook: posted about eval drift", "")))

    def test_refuses_interchangeable_notes(self):
        self.assertIn("interchangeable", self.refused(DRAFTS.replace(ENG, HM.replace("Asha", "Ravi"))))

    def test_notify_reports_due_count(self):
        self.load()
        run("--queue", self.q, "start", "--app", "acme_sae", "--date", "2026-10-12")
        out = run("--queue", self.q, "notify", "--date", "2026-10-12", "--dry-run")
        self.assertIn("2 outreach messages to send", out)


class RuleSpec(unittest.TestCase):
    def test_tool_cannot_send(self):
        src = (REPO / "tools" / "outreach.py").read_text(encoding="utf-8")
        for needle in ("smtplib", "urllib", "requests", "http.client", "send_message", "mailto"):
            self.assertNotIn(needle, src, f"outreach.py must never be able to send: found {needle}")

    def test_rule_file_keeps_its_hard_rules(self):
        text = RULE.read_text(encoding="utf-8")
        for needle in ("Never send", "every submitted application", "research agent",
                       "tools/outreach.py load", "careers_email", "hiring_manager"):
            self.assertIn(needle, text, f"09-referral-outreach.md lost: {needle}")

    def test_apply_makes_outreach_mandatory(self):
        text = APPLY.read_text(encoding="utf-8")
        self.assertIn("### Application Outreach (Mandatory)", text)
        self.assertNotIn("Want me to find referral contacts", text,
                         "apply.md went back to offering outreach instead of requiring it")

    def test_outcome_starts_and_closes_the_queue(self):
        text = OUTCOME.read_text(encoding="utf-8")
        self.assertIn("tools/outreach.py start", text)
        self.assertIn("tools/outreach.py close", text)


if __name__ == "__main__":
    unittest.main()
