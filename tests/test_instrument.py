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
