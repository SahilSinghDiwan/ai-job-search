"""Invariants for tools/instrument.py.

These pin the properties that make the ledger quotable: the join key is unique
and flagged when back-filled, the event log is append-only and replays to the
ledger's current status, the status enum is closed, timings are refused across
back-filled events, and `verify` runs offline with no re-execution.
"""
import csv
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "tools"))

import instrument  # noqa: E402


LEDGER_HEADER = ["date", "company", "sector", "role", "role_type", "channel",
                 "status", "contact_person", "fit_rating", "notes", "cv_file",
                 "cover_letter_file", "source"]


def write_ledger(path, rows):
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=LEDGER_HEADER)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in LEDGER_HEADER})


class Fixture(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        d = Path(self.dir.name)
        self.ledger = str(d / "tracker.csv")
        self.events = str(d / "events.csv")
        self.costs = str(d / "costs.csv")
        self.seen = str(d / "seen_jobs.json")
        self.sync = str(d / "state.json")

        write_ledger(self.ledger, [
            {"date": "2026-06-03", "company": "Kotak Mahindra Bank",
             "role": "Data Scientist", "status": "applied"},
            {"date": "2026-06-03", "company": "Acme Robotics",
             "role": "ML Engineer", "status": "rejected"},
            {"date": "2026-06-03", "company": "Acme Robotics",
             "role": "Staff Engineer", "status": "interview"},
        ])
        Path(self.seen).write_text(json.dumps({"seen": {
            "https://example.com/jobs/1": {
                "company": "Kotak Mahindra Bank", "title": "Data Scientist",
                "rank_score": 29},
            "https://example.com/jobs/2": {
                "company": "Globex", "title": "AI Engineer", "rank_score": 31},
        }}), encoding="utf-8")
        Path(self.sync).write_text(json.dumps({"last_sync": "2026-09-03"}), encoding="utf-8")
        self.addCleanup(self.dir.cleanup)

    def run_cmd(self, *argv):
        return instrument.main([
            "--ledger", self.ledger, "--events", self.events, "--costs", self.costs,
            "--seen-jobs", self.seen, "--sync-state", self.sync, *argv,
        ])

    def report(self):
        return instrument.verify(self.ledger, self.events, self.costs, self.sync)

    def ledger_rows(self):
        return instrument.read_rows(self.ledger)[0]


class InitSpec(Fixture):
    def test_init_adds_join_key_to_every_row(self):
        self.run_cmd("init")
        rows = self.ledger_rows()
        self.assertTrue(all(r["job_id"] for r in rows))

    def test_join_key_is_unique_even_for_same_company_same_day(self):
        self.run_cmd("init")
        ids = [r["job_id"] for r in self.ledger_rows()]
        self.assertEqual(len(ids), len(set(ids)))

    def test_scraper_match_is_flagged_as_backfill_not_apply_time(self):
        self.run_cmd("init")
        rows = {r["company"]: r for r in self.ledger_rows()}
        matched = rows["Kotak Mahindra Bank"]
        self.assertTrue(matched["job_id"].startswith("scraped:"))
        self.assertEqual(matched["job_id_source"], "scraper-match-backfill")

    def test_seed_events_are_provenance_backfill(self):
        self.run_cmd("init")
        events = instrument.read_table(self.events, instrument.EVENT_FIELDS)
        self.assertTrue(events)
        self.assertTrue(all(e["provenance"] == "backfill" for e in events))

    def test_init_is_idempotent(self):
        self.run_cmd("init")
        first = Path(self.events).read_text(encoding="utf-8")
        self.run_cmd("init")
        self.assertEqual(first, Path(self.events).read_text(encoding="utf-8"))

    def test_init_backs_up_the_ledger_before_touching_it(self):
        before = Path(self.ledger).read_text(encoding="utf-8")
        self.run_cmd("init")
        self.assertEqual(Path(self.ledger + ".pre-instrument.bak").read_text(encoding="utf-8"), before)


class EnumSpec(Fixture):
    def test_enum_is_closed_and_every_legacy_value_maps_into_it(self):
        for value in instrument.LEGACY_STATUS.values():
            self.assertIn(value, instrument.STATUSES)

    def test_unmapped_status_fails_verify(self):
        self.run_cmd("init")
        rows, fields = instrument.read_rows(self.ledger)
        rows[0]["status"] = "vibes"
        instrument.write_rows(rows, fields, self.ledger)
        self.assertFalse(self.report()["ok"])

    def test_dispositions_sum_to_n(self):
        self.run_cmd("init")
        rep = self.report()
        self.assertEqual(sum(rep["dispositions"].values()), rep["ledger_rows"])

    def test_no_response_is_not_a_status(self):
        # "nobody replied" is the absence of a transition, not a state.
        self.assertNotIn("no response", instrument.STATUSES)
        self.assertEqual(instrument.canonical_status("no response"), "applied")


class RecordSpec(Fixture):
    def setUp(self):
        super().setUp()
        self.run_cmd("init")
        self.job = self.ledger_rows()[0]["job_id"]

    def test_record_appends_and_replays_to_the_ledger(self):
        self.run_cmd("record", "--job-id", self.job, "--to", "interviewing",
                     "--evidence", "gmail:abc123", "--at", "2026-09-28T10:00:00")
        rep = self.report()
        self.assertTrue(rep["ok"], rep["failures"])
        self.assertEqual(rep["observed_events"], 1)

    def test_replay_mismatch_is_a_failure(self):
        rows, fields = instrument.read_rows(self.ledger)
        rows[0]["status"] = "offer"      # hand-edited, no event
        instrument.write_rows(rows, fields, self.ledger)
        rep = self.report()
        self.assertFalse(rep["ok"])
        self.assertTrue(any("replay mismatch" in f for f in rep["failures"]))

    def test_terminal_status_is_not_silently_reopened(self):
        self.run_cmd("record", "--job-id", self.job, "--to", "rejected",
                     "--at", "2026-09-28T10:00:00")
        with self.assertRaises(SystemExit):
            self.run_cmd("record", "--job-id", self.job, "--to", "applied",
                         "--at", "2026-09-29T10:00:00")

    def test_unknown_job_id_is_refused(self):
        with self.assertRaises(SystemExit):
            self.run_cmd("record", "--job-id", "scraped:doesnotexist", "--to", "applied")

    def test_timings_are_refused_across_backfilled_events(self):
        # One observed event on top of a backfill seed is still not two observed
        # points, so no interval is claimable.
        self.run_cmd("record", "--job-id", self.job, "--to", "acknowledged",
                     "--at", "2026-09-28T10:00:00")
        self.assertEqual(self.report()["timing_eligible_jobs"], 0)
        self.run_cmd("record", "--job-id", self.job, "--to", "interviewing",
                     "--at", "2026-09-29T10:00:00")
        self.assertEqual(self.report()["timing_eligible_jobs"], 1)


class CostSpec(Fixture):
    def test_cost_is_recorded_per_application_and_per_pass(self):
        self.run_cmd("init")
        job = self.ledger_rows()[0]["job_id"]
        self.run_cmd("cost", "--job-id", job, "--pass", "rank", "--model", "m",
                     "--tokens-in", "1000", "--tokens-out", "200", "--usd", "0.004")
        rep = self.report()
        self.assertEqual(rep["cost_records"], 1)
        self.assertEqual(rep["total_usd"], 0.004)

    def test_cost_coverage_starts_at_zero_and_is_reported_as_such(self):
        self.run_cmd("init")
        self.assertEqual(self.report()["cost_covered_jobs"], 0)


class FreshnessSpec(Fixture):
    def test_stale_sync_stamps_unverified(self):
        import datetime
        stamp, age = instrument.freshness(self.sync, today=datetime.date(2026, 9, 27))
        self.assertEqual(stamp, "unverified")
        self.assertEqual(age, 24)

    def test_fresh_sync_stamps_verified(self):
        import datetime
        stamp, _ = instrument.freshness(self.sync, today=datetime.date(2026, 9, 5))
        self.assertEqual(stamp, "verified")

    def test_stale_sync_is_surfaced_as_a_warning_by_verify(self):
        self.run_cmd("init")
        self.assertTrue(any("unverified" in w for w in self.report()["warnings"]))


class VerifySpec(Fixture):
    def test_verify_makes_no_network_call(self):
        import socket
        self.run_cmd("init")
        real = socket.socket

        def boom(*a, **k):
            raise AssertionError("verify opened a socket")

        socket.socket = boom
        try:
            self.report()
        finally:
            socket.socket = real

    def test_lossy_legacy_statuses_are_warned_about(self):
        write_ledger(self.ledger, [
            {"date": "2026-06-03", "company": "Acme", "role": "X", "status": "no response"},
        ])
        self.run_cmd("init")
        self.assertTrue(any("lossy" in w for w in self.report()["warnings"]))

    def test_backfilled_join_keys_are_warned_about(self):
        self.run_cmd("init")
        self.assertTrue(any("back-filled" in w for w in self.report()["warnings"]))


if __name__ == "__main__":
    unittest.main()


class ProjectionSpec(Fixture):
    def test_written_literals_round_trip_through_the_enum(self):
        for canon, literal in instrument.LEDGER_LITERAL.items():
            self.assertEqual(instrument.canonical_status(literal), canon)

    def test_record_keeps_the_dashboard_vocabulary(self):
        self.run_cmd("init")
        job = self.ledger_rows()[0]["job_id"]
        self.run_cmd("record", "--job-id", job, "--to", "interviewing",
                     "--at", "2026-09-28T10:00:00")
        self.assertEqual(self.ledger_rows()[0]["status"], "interview")
        self.assertTrue(self.report()["ok"])


class AddSpec(Fixture):
    """The apply-time path: the only way a row earns an `apply-time` key."""

    URL = "https://example.com/jobs/2"

    def setUp(self):
        super().setUp()
        self.run_cmd("init")

    def add(self, *extra):
        return self.run_cmd("add", "--url", self.URL, "--at", "2026-10-06T10:00:00", *extra)

    def row(self):
        return [r for r in self.ledger_rows() if r["company"] == "Globex"][0]

    def test_add_writes_row_keyed_from_the_scraped_posting(self):
        self.add()
        row = self.row()
        self.assertEqual(row["job_id"], instrument.scraped_job_id(self.URL))
        self.assertEqual(row["job_id_source"], "apply-time")
        self.assertEqual(row["role"], "AI Engineer")
        self.assertEqual(row["date"], "2026-10-06")
        self.assertEqual(row["status"], "applied")
        self.assertEqual(row["source"], self.URL)

    def test_add_appends_an_observed_applied_event_and_verify_holds(self):
        self.add()
        events = [e for e in instrument.read_table(self.events, instrument.EVENT_FIELDS)
                  if e["job_id"] == instrument.scraped_job_id(self.URL)]
        self.assertEqual([(e["to_status"], e["provenance"]) for e in events],
                         [("applied", "observed")])
        rep = self.report()
        self.assertTrue(rep["ok"], rep["failures"])
        self.assertEqual(rep["apply_time_keyed_jobs"], 1)
        self.assertEqual(rep["rank_joinable_jobs"], 1)

    def test_apply_time_key_is_not_counted_as_backfilled(self):
        before = self.report()["backfilled_keys"]
        self.add()
        self.assertEqual(self.report()["backfilled_keys"], before)

    def test_added_row_becomes_timing_eligible_after_one_recorded_transition(self):
        self.add()
        self.assertEqual(self.report()["timing_eligible_jobs"], 0)
        self.run_cmd("record", "--job-id", instrument.scraped_job_id(self.URL),
                     "--to", "interviewing", "--at", "2026-10-09T10:00:00")
        rep = self.report()
        self.assertTrue(rep["ok"], rep["failures"])
        self.assertEqual(rep["timing_eligible_jobs"], 1)

    def test_add_refuses_a_posting_already_in_the_ledger(self):
        self.add()
        with self.assertRaises(SystemExit):
            self.add()
        self.assertEqual(len([r for r in self.ledger_rows() if r["company"] == "Globex"]), 1)

    def test_add_refuses_an_unknown_url_unless_declared_manual(self):
        with self.assertRaises(SystemExit):
            self.run_cmd("add", "--url", "https://example.com/nope",
                         "--at", "2026-10-06T10:00:00")

    def test_manual_add_is_apply_time_keyed_but_not_rank_joinable(self):
        self.run_cmd("add", "--manual", "--company", "Initech", "--role", "ML Lead",
                     "--at", "2026-10-06T10:00:00")
        row = [r for r in self.ledger_rows() if r["company"] == "Initech"][0]
        self.assertEqual(row["job_id_source"], "apply-time-manual")
        rep = self.report()
        self.assertTrue(rep["ok"], rep["failures"])
        self.assertEqual(rep["apply_time_keyed_jobs"], 1)
        self.assertEqual(rep["rank_joinable_jobs"], 0)

    def test_manual_add_requires_company_and_role(self):
        with self.assertRaises(SystemExit):
            self.run_cmd("add", "--manual", "--company", "Initech",
                         "--at", "2026-10-06T10:00:00")

    def test_late_logged_application_is_flagged_backfill_not_apply_time(self):
        # Logged three days after the apply date: the key is exact, but neither
        # it nor the `applied` timestamp was written at apply time.
        self.add("--date", "2026-10-03")
        row = self.row()
        self.assertEqual(row["job_id_source"], "late-logged-backfill")
        self.assertEqual(row["date"], "2026-10-03")
        events = [e for e in instrument.read_table(self.events, instrument.EVENT_FIELDS)
                  if e["job_id"] == row["job_id"]]
        self.assertEqual([(e["at"], e["provenance"]) for e in events],
                         [("2026-10-03", "backfill")])
        rep = self.report()
        self.assertTrue(rep["ok"], rep["failures"])
        self.assertEqual(rep["apply_time_keyed_jobs"], 0)

    def test_add_refuses_an_apply_date_in_the_future(self):
        with self.assertRaises(SystemExit):
            self.add("--date", "2026-10-09")

    def test_add_requires_an_initialised_ledger(self):
        write_ledger(self.ledger, [])
        with self.assertRaises(SystemExit):
            self.add()

    def test_unknown_job_id_source_fails_verify(self):
        self.add()
        rows, fields = instrument.read_rows(self.ledger)
        rows[-1]["job_id_source"] = "trust-me"
        instrument.write_rows(rows, fields, self.ledger)
        self.assertFalse(self.report()["ok"])


class RoutedWriteSpec(Fixture):
    """`/outcome` and `/gmail-sync` change status only through `record`."""

    def setUp(self):
        super().setUp()
        self.run_cmd("init")
        self.job = self.ledger_rows()[0]["job_id"]

    def test_record_note_is_appended_never_overwritten(self):
        rows, fields = instrument.read_rows(self.ledger)
        rows[0]["notes"] = "first"
        instrument.write_rows(rows, fields, self.ledger)
        self.run_cmd("record", "--job-id", self.job, "--to", "interviewing",
                     "--at", "2026-10-06T10:00:00", "--note", "2026-10-06 gmail-sync: invite")
        self.assertEqual(self.ledger_rows()[0]["notes"], "first | 2026-10-06 gmail-sync: invite")

    def test_every_status_the_commands_record_keeps_verify_green(self):
        # The canonical targets /outcome and /gmail-sync are told to use.
        for i, to in enumerate(("interviewing", "offer", "accepted")):
            self.run_cmd("record", "--job-id", self.job, "--to", to,
                         "--at", "2026-10-0%dT10:00:00" % (6 + i))
            rep = self.report()
            self.assertTrue(rep["ok"], (to, rep["failures"]))

    def test_closing_statuses_replay(self):
        for to in ("declined", "rejected", "withdrawn", "lapsed"):
            self.setUp()
            self.run_cmd("record", "--job-id", self.job, "--to", to,
                         "--at", "2026-10-06T10:00:00")
            rep = self.report()
            self.assertTrue(rep["ok"], (to, rep["failures"]))

    def test_legacy_closing_literals_the_specs_used_still_map(self):
        self.assertEqual(instrument.canonical_status("offer declined"), "declined")
        self.assertEqual(instrument.canonical_status("hired"), "accepted")

    def test_command_specs_route_status_writes_through_record(self):
        for name in ("outcome.md", "gmail-sync.md"):
            text = (REPO / ".claude" / "commands" / name).read_text(encoding="utf-8")
            self.assertIn("tools/instrument.py record", text, name)
        outcome = (REPO / ".claude" / "commands" / "outcome.md").read_text(encoding="utf-8")
        self.assertIn("tools/instrument.py add", outcome)

    def test_rank_and_apply_specs_log_cost(self):
        for name in ("rank.md", "apply.md"):
            text = (REPO / ".claude" / "commands" / name).read_text(encoding="utf-8")
            self.assertIn("tools/instrument.py cost", text, name)


class UnmeteredCostSpec(Fixture):
    def setUp(self):
        super().setUp()
        self.run_cmd("init")
        self.job = self.ledger_rows()[0]["job_id"]

    def test_first_cost_write_creates_the_file(self):
        self.assertFalse(os.path.exists(self.costs))
        self.run_cmd("cost", "--job-id", self.job, "--pass", "rank", "--model", "m")
        self.assertTrue(os.path.exists(self.costs))

    def test_unmetered_pass_is_logged_but_is_not_cost_coverage(self):
        # A pass with no token or USD figure is recorded as having happened and
        # nothing more: it must never read as "$0" or as coverage.
        self.run_cmd("cost", "--job-id", self.job, "--pass", "tailor_cv", "--model", "m")
        rep = self.report()
        self.assertTrue(rep["ok"], rep["failures"])
        self.assertEqual(rep["cost_records"], 1)
        self.assertEqual(rep["cost_unmetered_records"], 1)
        self.assertEqual(rep["cost_covered_jobs"], 0)
        self.assertEqual(rep["cost_pass_logged_jobs"], 1)
        self.assertEqual(rep["total_usd"], 0)
        record = instrument.read_table(self.costs, instrument.COST_FIELDS)[0]
        self.assertEqual(record["usd"], "")
        self.assertEqual(record["provenance"], "unmetered")

    def test_metered_pass_is_coverage(self):
        self.run_cmd("cost", "--job-id", self.job, "--pass", "rank", "--model", "m",
                     "--tokens-in", "10", "--tokens-out", "5", "--usd", "0.001")
        rep = self.report()
        self.assertEqual(rep["cost_covered_jobs"], 1)
        self.assertEqual(rep["cost_unmetered_records"], 0)

    def test_cost_on_a_posting_not_applied_to_is_not_ledger_coverage(self):
        # /rank costs postings, most of which are never applied to.
        self.run_cmd("cost", "--url", "https://example.com/jobs/2", "--pass", "rank",
                     "--model", "m", "--tokens-in", "10", "--tokens-out", "5", "--usd", "0.001")
        rep = self.report()
        self.assertEqual(rep["cost_covered_jobs"], 0)
        self.assertEqual(rep["cost_records_outside_ledger"], 1)
        record = instrument.read_table(self.costs, instrument.COST_FIELDS)[0]
        self.assertEqual(record["job_id"], instrument.scraped_job_id("https://example.com/jobs/2"))

    def test_rank_cost_joins_once_the_posting_is_applied_to(self):
        url = "https://example.com/jobs/2"
        self.run_cmd("cost", "--url", url, "--pass", "rank", "--model", "m",
                     "--tokens-in", "10", "--tokens-out", "5", "--usd", "0.001")
        self.run_cmd("add", "--url", url, "--at", "2026-10-06T10:00:00")
        self.assertEqual(self.report()["cost_covered_jobs"], 1)

    def test_cost_needs_a_job(self):
        with self.assertRaises(SystemExit):
            self.run_cmd("cost", "--pass", "rank", "--model", "m")

    def test_non_numeric_cost_is_refused_at_write_time(self):
        with self.assertRaises(SystemExit):
            self.run_cmd("cost", "--job-id", self.job, "--pass", "rank", "--model", "m",
                         "--usd", "cheap")

    def test_cost_refuses_a_url_the_scraper_never_saw(self):
        with self.assertRaises(SystemExit):
            self.run_cmd("cost", "--url", "https://example.com/nope", "--pass", "rank",
                         "--model", "m")
        self.assertFalse(os.path.exists(self.costs))

    def test_batch_pass_logs_one_unmetered_record_per_posting(self):
        self.run_cmd("cost", "--url", "https://example.com/jobs/1",
                     "--url", "https://example.com/jobs/2", "--pass", "rank", "--model", "m")
        records = instrument.read_table(self.costs, instrument.COST_FIELDS)
        self.assertEqual(len(records), 2)
        self.assertEqual(len({r["cost_id"] for r in records}), 2)
        self.assertTrue(all(r["provenance"] == "unmetered" for r in records))

    def test_batch_pass_cannot_carry_a_single_figure(self):
        with self.assertRaises(SystemExit):
            self.run_cmd("cost", "--url", "https://example.com/jobs/1",
                         "--url", "https://example.com/jobs/2", "--pass", "rank",
                         "--model", "m", "--usd", "0.01")
