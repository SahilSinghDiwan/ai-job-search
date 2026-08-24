"""Tests for salary_lookup.py — format_entry, match_score, and search_company."""

import io
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

import salary_lookup
from salary_lookup import (
    format_entry,
    normalize,
    anglicize,
    extract_core_words,
    match_score,
    search_company,
    validate_data,
    collect_validation_issues,
)


# ---------------------------------------------------------------------------
# format_entry tests (from #75 / #98)
# ---------------------------------------------------------------------------

class FormatEntryTests(unittest.TestCase):
    def test_zero_count_is_displayed_as_zero(self):
        entry = {
            "company": "Example Corp",
            "city": "",
            "categories": {
                "public_data": {
                    "count": 0,
                    "index": 100.0,
                },
            },
        }

        rendered = format_entry(entry, {"index_baseline": 100, "index_label": "Index"})

        self.assertRegex(rendered, r"Public Data\s+0\s+100\.0")

    def test_text_index_does_not_crash(self):
        entry = {
            "company": "Example Corp",
            "city": "",
            "categories": {
                "sample": {
                    "count": 3,
                    "index": "private",
                },
            },
        }

        rendered = format_entry(entry, {"index_baseline": 100, "index_label": "Index"})

        self.assertIn("private", rendered)

    def test_format_entry_with_zero_baseline(self):
        entry = {
            "company": "Example Corp",
            "city": "",
            "categories": {
                "it": {
                    "count": None,
                    "index": 45000.0,
                },
            },
        }
        rendered = format_entry(entry, {"index_baseline": 0, "index_label": "Salary"})
        self.assertIn("45000.0", rendered)
        self.assertNotIn("%", rendered)

    def test_format_entry_with_custom_baseline(self):
        entry = {
            "company": "Example Corp",
            "city": "",
            "categories": {
                "it": {
                    "count": None,
                    "index": 45000.0,
                },
            },
        }
        rendered = format_entry(entry, {"index_baseline": 40000, "index_label": "Salary"})
        self.assertIn("45000.0", rendered)
        self.assertIn("+12.5%", rendered)


# ---------------------------------------------------------------------------
# match_score tests (from #106)
# ---------------------------------------------------------------------------

class TestMatchScoreExactMatch(unittest.TestCase):
    def test_exact_match_returns_100(self):
        self.assertEqual(match_score("Novo Nordisk", "Novo Nordisk"), 100)

    def test_exact_match_case_insensitive(self):
        self.assertEqual(match_score("NOVO NORDISK", "Novo Nordisk"), 100)

    def test_exact_match_after_suffix_stripping(self):
        self.assertEqual(match_score("Mærsk", "Mærsk A/S"), 100)


class TestMatchScoreSubstring(unittest.TestCase):
    def test_query_contained_in_entry_gives_high_score(self):
        score = match_score("Carlsberg", "Carlsberg Danmark A/S")
        self.assertGreaterEqual(score, 80)

    def test_entry_contained_in_query_gives_high_score(self):
        score = match_score("Carlsberg Danmark", "Carlsberg")
        self.assertGreaterEqual(score, 80)


class TestMatchScoreShortQuery(unittest.TestCase):
    def test_short_query_no_word_overlap_returns_zero(self):
        score = match_score("ab", "Something Unrelated Company")
        self.assertEqual(score, 0)

    def test_short_query_with_word_overlap_scores(self):
        score = match_score("IBM", "IBM Corporation")
        self.assertGreater(score, 0)


class TestMatchScoreAnglicize(unittest.TestCase):
    def test_oe_variant_matches_o_with_slash(self):
        score = match_score("Maersk", "Mærsk A/S")
        self.assertGreater(score, 0)

    def test_aa_variant_matches_aa(self):
        self.assertEqual(match_score("Aarsleff", "Aarsleff"), 100)

    def test_danish_characters_roundtrip(self):
        score = match_score("Maersk", "Mærsk A/S")
        self.assertGreater(score, 0)


class TestMatchScoreNoOverlap(unittest.TestCase):
    def test_completely_unrelated_names_return_zero(self):
        self.assertEqual(match_score("Apple", "Vestas Wind Systems"), 0)

    def test_empty_query_returns_zero(self):
        self.assertEqual(match_score("", "Novo Nordisk"), 0)

    def test_empty_entry_returns_zero(self):
        self.assertEqual(match_score("Novo Nordisk", ""), 0)


# ---------------------------------------------------------------------------
# search_company tests (from #75 / #98 and #106)
# ---------------------------------------------------------------------------

def _make_data(*entries):
    return {"companies": list(entries)}


def _entry(company, city=""):
    return {"company": company, "city": city}


class SearchCompanyTests(unittest.TestCase):
    def test_search_company_with_none_city(self):
        data = {
            "companies": [
                {
                    "company": "Acme",
                    "city": None,
                }
            ]
        }
        results = search_company(data, "Acme", city="Aarhus")
        self.assertEqual(results, [])


class ValidateDataTests(unittest.TestCase):
    def assert_invalid_data(self, data, expected_message):
        stderr = io.StringIO()
        with self.assertRaises(SystemExit) as raised:
            with redirect_stderr(stderr):
                validate_data(data)

        self.assertEqual(raised.exception.code, 1)
        self.assertIn("Error: invalid salary_data.json", stderr.getvalue())
        self.assertIn(expected_message, stderr.getvalue())
        self.assertIn("tools/README_SALARY_TOOL.md", stderr.getvalue())

    def test_valid_minimal_data_is_returned(self):
        data = {"metadata": {}, "companies": [{"company": "Example Corp"}]}

        self.assertIs(validate_data(data), data)

    def test_top_level_value_must_be_object(self):
        self.assert_invalid_data([], "top-level JSON value must be an object")

    def test_companies_must_be_list(self):
        self.assert_invalid_data({"companies": {"company": "Example Corp"}}, "'companies' must be a list")

    def test_metadata_must_be_object_when_provided(self):
        self.assert_invalid_data(
            {"metadata": [], "companies": [{"company": "Example Corp"}]},
            "'metadata' must be an object when provided",
        )

    def test_load_data_reports_json_parse_errors_without_traceback(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            data_file = Path(tmpdir) / "salary_data.json"
            data_file.write_text('{"companies": [', encoding="utf-8")

            original_data_file = salary_lookup.DATA_FILE
            salary_lookup.DATA_FILE = data_file
            try:
                stderr = io.StringIO()
                with self.assertRaises(SystemExit) as raised:
                    with redirect_stderr(stderr):
                        salary_lookup.load_data()
            finally:
                salary_lookup.DATA_FILE = original_data_file

        self.assertEqual(raised.exception.code, 1)
        self.assertIn("invalid JSON at line", stderr.getvalue())
        self.assertIn("tools/README_SALARY_TOOL.md", stderr.getvalue())

    def test_company_entry_must_be_object(self):
        self.assert_invalid_data({"companies": ["Example Corp"]}, "companies[1] must be an object")

    def test_company_name_is_required(self):
        self.assert_invalid_data({"companies": [{"city": "Aarhus"}]}, "companies[1].company must be a non-empty string")

    def test_company_name_must_not_be_blank(self):
        self.assert_invalid_data({"companies": [{"company": "  "}]}, "companies[1].company must be a non-empty string")

    def test_city_must_be_string_when_provided(self):
        self.assert_invalid_data(
            {"companies": [{"company": "Example Corp", "city": 123}]},
            "companies[1].city must be a string when provided",
        )

    def test_categories_must_be_object_when_provided(self):
        self.assert_invalid_data(
            {"companies": [{"company": "Example Corp", "categories": []}]},
            "companies[1].categories must be an object when provided",
        )


class ValidateDataShapeTests(ValidateDataTests):
    """Category-shape and duplicate-name checks (reuses assert_invalid_data)."""

    def test_malformed_category_value_rejected(self):
        data = {"companies": [{"company": "Acme", "categories": {"eng": "not_a_dict"}}]}
        self.assert_invalid_data(data, "must be an object with 'count' and/or 'index'")

    def test_non_numeric_count_rejected(self):
        data = {
            "companies": [
                {"company": "Acme", "categories": {"eng": {"count": "many"}}}
            ]
        }
        self.assert_invalid_data(data, "count must be a number")

    def test_duplicate_company_name_is_warning(self):
        data = {
            "companies": [
                {"company": "Acme"},
                {"company": "Other Corp"},
                {"company": "Acme"},
            ]
        }
        errors, warnings = collect_validation_issues(data)
        self.assertEqual(errors, [])
        self.assertEqual(len(warnings), 1)
        self.assertIn("Duplicate company name 'Acme'", warnings[0])

    def test_valid_categories_have_no_issues(self):
        data = {
            "companies": [
                {"company": "Acme", "categories": {"eng": {"count": 5, "index": 108.5}}}
            ]
        }
        errors, warnings = collect_validation_issues(data)
        self.assertEqual(errors, [])
        self.assertEqual(warnings, [])


class ValidateFlagTests(unittest.TestCase):
    """End-to-end checks for the --validate pre-flight flow."""

    def _run_validate(self, payload):
        with tempfile.TemporaryDirectory() as tmpdir:
            data_file = Path(tmpdir) / "salary_data.json"
            data_file.write_text(payload, encoding="utf-8")
            original_data_file = salary_lookup.DATA_FILE
            salary_lookup.DATA_FILE = data_file
            argv_patch = mock.patch("sys.argv", ["salary_lookup.py", "--validate"])
            argv_patch.start()
            try:
                stdout = io.StringIO()
                with self.assertRaises(SystemExit) as raised:
                    with redirect_stdout(stdout):
                        salary_lookup.main()
                return raised.exception.code, stdout.getvalue()
            finally:
                argv_patch.stop()
                salary_lookup.DATA_FILE = original_data_file

    def test_validate_flag_exits_1_on_errors(self):
        code, out = self._run_validate(
            '{"companies": [{"company": "Acme", "categories": {"eng": "not_a_dict"}}]}'
        )
        self.assertEqual(code, 1)
        self.assertIn("must be an object with 'count' and/or 'index'", out)

    def test_validate_flag_exits_0_on_clean(self):
        code, out = self._run_validate(
            '{"companies": [{"company": "Acme", "categories": {"eng": {"count": 5}}}]}'
        )
        self.assertEqual(code, 0)
        self.assertIn("OK", out)

    def test_validate_flag_exits_0_on_duplicates_only(self):
        code, out = self._run_validate(
            '{"companies": [{"company": "Acme"}, {"company": "Acme"}]}'
        )
        self.assertEqual(code, 0)
        self.assertIn("Duplicate company name", out)


class UtilityTests(unittest.TestCase):
    def test_normalize_strips_suffix_and_noise(self):
        self.assertEqual(normalize("Novo Nordisk A/S"), "novonordisk")
        self.assertEqual(normalize("Ørsted (VG) Holding"), "ørsted")
        self.assertEqual(normalize("Chr. Hansen, Denmark Division"), "chrhansen")
        self.assertEqual(normalize("Simple Corp ApS"), "simplecorp")

    def test_anglicize_replaces_danish_chars(self):
        self.assertEqual(anglicize("ørsted"), "orsted")
        self.assertEqual(anglicize("mærsk"), "maersk")
        self.assertEqual(anglicize("ålborg"), "aalborg")

    def test_extract_core_words(self):
        self.assertEqual(extract_core_words("Novo Nordisk A/S"), ["novo", "nordisk"])
        self.assertEqual(extract_core_words("A/S"), [])
        self.assertEqual(extract_core_words("Test Company (Sub-entity)"), ["test", "company"])


class MatchScoreTests(unittest.TestCase):
    def test_exact_match_score(self):
        self.assertEqual(match_score("Novo Nordisk", "Novo Nordisk"), 100)
        self.assertEqual(match_score("novo nordisk", "Novo Nordisk A/S"), 100)

    def test_partial_match_score(self):
        self.assertGreater(match_score("Novo", "Novo Nordisk A/S"), 80)
        self.assertEqual(match_score("Novo Nordisk", "Novo"), 75)

    def test_anglicized_match_score(self):
        self.assertEqual(match_score("Orsted", "Ørsted A/S"), 85)

    def test_overlap_match_score(self):
        # Overlap of multiple words
        self.assertGreater(match_score("Novo Tech", "Novo Nordisk Tech A/S"), 30)

    def test_no_match_score(self):
        self.assertEqual(match_score("Google", "Microsoft"), 0)


class SearchCompanyRefactoredTests(unittest.TestCase):
    def setUp(self):
        self.data = {
            "companies": [
                {"company": "Novo Nordisk A/S", "city": "Bagsværd"},
                {"company": "Ørsted", "city": "Fredericia"},
                {"company": "Vestas Wind Systems", "city": "Aarhus"},
            ]
        }

    def test_search_by_name(self):
        results = search_company(self.data, "Novo")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["company"], "Novo Nordisk A/S")

    def test_search_with_city_filter(self):
        results = search_company(self.data, "Ørsted", city="Fredericia")
        self.assertEqual(len(results), 1)

        # Mismatching city
        results_wrong_city = search_company(self.data, "Ørsted", city="Bagsværd")
        self.assertEqual(len(results_wrong_city), 0)


class TestSearchCompanyBasicMatch(unittest.TestCase):
    def test_exact_name_returns_match(self):
        data = _make_data(_entry("Novo Nordisk", "Bagsværd"))
        results = search_company(data, "Novo Nordisk")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["company"], "Novo Nordisk")

    def test_no_match_returns_empty_list(self):
        data = _make_data(_entry("Vestas Wind Systems", "Aarhus"))
        results = search_company(data, "Apple")
        self.assertEqual(results, [])

    def test_multiple_candidates_all_returned(self):
        data = _make_data(
            _entry("Carlsberg A/S", "Copenhagen"),
            _entry("Carlsberg Danmark", "Fredericia"),
            _entry("Unrelated Corp", "Odense"),
        )
        results = search_company(data, "Carlsberg")
        companies = [r["company"] for r in results]
        self.assertIn("Carlsberg A/S", companies)
        self.assertIn("Carlsberg Danmark", companies)
        self.assertNotIn("Unrelated Corp", companies)


class TestSearchCompanyCityFilter(unittest.TestCase):
    def test_matching_city_is_included(self):
        data = _make_data(
            _entry("Novo Nordisk", "Bagsværd"),
            _entry("Novo Nordisk", "Aarhus"),
        )
        results = search_company(data, "Novo Nordisk", city="Aarhus")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["city"], "Aarhus")

    def test_non_matching_city_is_excluded(self):
        data = _make_data(_entry("Novo Nordisk", "Bagsværd"))
        results = search_company(data, "Novo Nordisk", city="Odense")
        self.assertEqual(results, [])

    def test_no_city_filter_returns_all_cities(self):
        data = _make_data(
            _entry("Novo Nordisk", "Bagsværd"),
            _entry("Novo Nordisk", "Aarhus"),
        )
        results = search_company(data, "Novo Nordisk")
        self.assertEqual(len(results), 2)

    def test_city_filter_case_insensitive(self):
        data = _make_data(_entry("Novo Nordisk", "København"))
        results = search_company(data, "Novo Nordisk", city="københavn")
        self.assertEqual(len(results), 1)

    def test_anglicized_city_matches_danish_city(self):
        data = _make_data(_entry("Novo Nordisk", "København"))
        results = search_company(data, "Novo Nordisk", city="kobenhavn")
        self.assertEqual(len(results), 1)


class TestSearchCompanyScoreThreshold(unittest.TestCase):
    def test_low_score_matches_excluded(self):
        data = _make_data(_entry("Novo Nordisk", "Bagsværd"))
        results = search_company(data, "xyz")
        self.assertEqual(results, [])

    def test_results_sorted_by_relevance_descending(self):
        data = _make_data(
            _entry("Novo Nordisk International", "Bagsværd"),
            _entry("Novo Nordisk", "Bagsværd"),
        )
        results = search_company(data, "Novo Nordisk")
        self.assertEqual(results[0]["company"], "Novo Nordisk")


# ---------------------------------------------------------------------------
# Indian company-name matching (two-tier stripping)
# ---------------------------------------------------------------------------

class IndianCompanyNameTests(unittest.TestCase):
    """Indian legal suffixes strip unconditionally; generic industry words
    only in the lower-confidence pass."""

    def test_pvt_ltd_variants_normalize_identically(self):
        for name in [
            "Acme Technologies Pvt Ltd",
            "Acme Technologies Pvt. Ltd.",
            "Acme Technologies Private Limited",
            "Acme Technologies Ltd",
            "Acme Technologies Limited",
            "Acme Technologies LLP",
        ]:
            with self.subTest(name=name):
                self.assertEqual(normalize(name), "acmetechnologies")

    def test_generic_words_are_not_stripped_unconditionally(self):
        # "technologies" carries some identity, so the confident pass keeps it.
        self.assertEqual(normalize("Acme Technologies"), "acmetechnologies")
        self.assertEqual(normalize("Acme Solutions India"), "acmesolutionsindia")

    def test_aggressive_normalize_strips_generic_words(self):
        self.assertEqual(normalize("Acme Technologies Pvt Ltd", aggressive=True), "acme")
        self.assertEqual(normalize("Acme India Pvt. Ltd.", aggressive=True), "acme")
        self.assertEqual(normalize("Acme Solutions", aggressive=True), "acme")
        self.assertEqual(normalize("Acme Software Labs", aggressive=True), "acme")
        self.assertEqual(
            normalize("Acme Global Capability Centre India", aggressive=True), "acme"
        )
        self.assertEqual(normalize("Acme GCC", aggressive=True), "acme")

    def test_all_indian_variants_match_one_entry(self):
        entry = "Acme Technologies Pvt Ltd"
        for query in [
            "Acme Technologies Pvt Ltd",
            "Acme Technologies Private Limited",
            "Acme India Pvt. Ltd.",
            "Acme Technologies",
            "Acme",
        ]:
            with self.subTest(query=query):
                self.assertGreaterEqual(match_score(query, entry), 30)

    def test_generic_word_match_never_reads_as_exact(self):
        # "Acme India Pvt Ltd" and "Acme Technologies Pvt Ltd" match on "acme"
        # alone, so the score must clear the search threshold without claiming
        # the exact-match confidence a literally identical name would get.
        score = match_score("Acme India Pvt. Ltd.", "Acme Technologies Pvt Ltd")
        self.assertGreaterEqual(score, 30)
        self.assertLess(score, 100)

    def test_aggressive_cap_sits_between_threshold_and_confident_tiers(self):
        # Documented invariant: capped matches surface in search results
        # (>= the 30 threshold) but can never outrank the 70+ tiers the
        # unconditional pass produces.
        self.assertGreater(salary_lookup.AGGRESSIVE_SCORE_CAP, 30)
        self.assertLess(salary_lookup.AGGRESSIVE_SCORE_CAP, 70)

    def test_exact_match_outranks_generic_word_match(self):
        data = _make_data(
            _entry("Acme India Pvt Ltd", "Bengaluru"),
            _entry("Acme Technologies Pvt Ltd", "Bengaluru"),
        )
        results = search_company(data, "Acme Technologies Private Limited")
        self.assertEqual(results[0]["company"], "Acme Technologies Pvt Ltd")

    def test_generic_words_alone_do_not_create_a_match(self):
        # Two different companies that share only noise words.
        self.assertEqual(
            match_score("Acme India Pvt Ltd", "Globex Solutions India Private Limited"), 0
        )
        self.assertEqual(match_score("Acme Systems", "Globex Systems"), 0)

    def test_search_finds_indian_entry_across_name_variants(self):
        data = _make_data(
            _entry("Acme Technologies Pvt Ltd", "Bengaluru"),
            _entry("Globex Solutions India Private Limited", "Bengaluru"),
        )
        for query in ["Acme Technologies Pvt Ltd", "Acme India Pvt. Ltd.", "Acme Technologies"]:
            with self.subTest(query=query):
                results = search_company(data, query)
                self.assertEqual([r["company"] for r in results], ["Acme Technologies Pvt Ltd"])

    def test_danish_matching_is_unaffected(self):
        self.assertEqual(normalize("Novo Nordisk A/S"), "novonordisk")
        self.assertEqual(match_score("Orsted", "Ørsted A/S"), 85)


# ---------------------------------------------------------------------------
# Absolute (money) mode
# ---------------------------------------------------------------------------

ABSOLUTE_METADATA = {
    "source": "AmbitionBox + levels.fyi, collected 2026-08",
    "mode": "absolute",
    "currency": "INR",
    "unit": "LPA",
    "baseline_description": "Market band for AI/GenAI engineers, 3-5 yrs, Bengaluru",
}


def _absolute_entry(**category):
    return {
        "company": "Acme Technologies Pvt Ltd",
        "city": "Bengaluru",
        "categories": {"ai_engineer_3_5y": dict(category)},
    }


class ModeTests(unittest.TestCase):
    def test_missing_mode_defaults_to_index(self):
        self.assertEqual(salary_lookup.get_mode({}), "index")
        self.assertEqual(salary_lookup.get_mode(None), "index")

    def test_explicit_modes_are_read(self):
        self.assertEqual(salary_lookup.get_mode({"mode": "absolute"}), "absolute")
        self.assertEqual(salary_lookup.get_mode({"mode": "INDEX"}), "index")


class ResolveAbsoluteComponentsTests(unittest.TestCase):
    def test_all_components_present_nothing_derived(self):
        values, derived = salary_lookup.resolve_absolute_components(
            {"fixed_lpa": 28.0, "variable_lpa": 4.0, "esop_lpa": 6.0, "total_ctc_lpa": 38.0}
        )
        self.assertEqual(values["fixed_lpa"], 28.0)
        self.assertEqual(values["total_ctc_lpa"], 38.0)
        self.assertEqual(derived, set())

    def test_total_derived_when_all_components_present(self):
        values, derived = salary_lookup.resolve_absolute_components(
            {"fixed_lpa": 22.0, "variable_lpa": 3.0, "esop_lpa": 0.0}
        )
        self.assertEqual(values["total_ctc_lpa"], 25.0)
        self.assertEqual(derived, {"total_ctc_lpa"})

    def test_total_not_derived_from_partial_components(self):
        values, derived = salary_lookup.resolve_absolute_components(
            {"fixed_lpa": 22.0, "variable_lpa": 3.0}
        )
        self.assertIsNone(values["total_ctc_lpa"])
        self.assertIsNone(values["esop_lpa"])
        self.assertEqual(derived, set())

    def test_fixed_not_inferred_from_total_minus_variable_alone(self):
        values, derived = salary_lookup.resolve_absolute_components(
            {"total_ctc_lpa": 40.0, "variable_lpa": 5.0}
        )
        self.assertIsNone(values["fixed_lpa"])
        self.assertEqual(derived, set())

    def test_single_missing_component_inferred_from_complete_total(self):
        values, derived = salary_lookup.resolve_absolute_components(
            {"total_ctc_lpa": 40.0, "variable_lpa": 5.0, "esop_lpa": 7.0}
        )
        self.assertEqual(values["fixed_lpa"], 28.0)
        self.assertEqual(derived, {"fixed_lpa"})

    def test_missing_component_is_none_not_zero(self):
        values, _ = salary_lookup.resolve_absolute_components({"fixed_lpa": 30.0})
        self.assertIsNone(values["esop_lpa"])
        self.assertNotEqual(values["esop_lpa"], 0)


class FormatEntryAbsoluteTests(unittest.TestCase):
    def test_renders_rupee_amounts_and_headers(self):
        rendered = format_entry(
            _absolute_entry(count=42, fixed_lpa=28.0, variable_lpa=4.0,
                            esop_lpa=6.0, total_ctc_lpa=38.0),
            ABSOLUTE_METADATA,
        )
        for expected in ["Fixed", "Variable", "ESOP", "Total CTC",
                         "\u20b928.0", "\u20b94.0", "\u20b96.0", "\u20b938.0"]:
            self.assertIn(expected, rendered)
        self.assertIn("All amounts in LPA (INR)", rendered)
        self.assertNotIn("vs Baseline", rendered)

    def test_unknown_component_rendered_as_unknown_not_zero(self):
        rendered = format_entry(
            _absolute_entry(count=11, variable_lpa=5.0, total_ctc_lpa=45.0),
            ABSOLUTE_METADATA,
        )
        self.assertIn("?", rendered)
        self.assertIn("not reported", rendered)
        self.assertNotIn("\u20b90.0", rendered)

    def test_derived_total_is_flagged(self):
        rendered = format_entry(
            _absolute_entry(count=7, fixed_lpa=22.0, variable_lpa=3.0, esop_lpa=0.0),
            ABSOLUTE_METADATA,
        )
        self.assertIn("\u20b925.0~", rendered)
        self.assertIn("derived", rendered)

    def test_currency_and_unit_drive_labels(self):
        metadata = {"mode": "absolute", "currency": "USD", "unit": "k"}
        rendered = format_entry(_absolute_entry(fixed_lpa=180.0), metadata)
        self.assertIn("$180.0", rendered)
        self.assertIn("All amounts in k (USD)", rendered)

    def test_index_mode_rendering_untouched_when_mode_absent(self):
        entry = {"company": "Acme", "city": "",
                 "categories": {"eng": {"count": 5, "index": 108.5}}}
        rendered = format_entry(entry, {"index_baseline": 100, "index_label": "Index"})
        self.assertIn("vs Baseline", rendered)
        self.assertIn("108.5", rendered)


class JsonResultsTests(unittest.TestCase):
    def test_index_mode_json_is_unchanged(self):
        results = [{"company": "Acme", "categories": {"eng": {"count": 5, "index": 108.5}}}]
        self.assertIs(salary_lookup.json_results(results, {}), results)

    def test_absolute_mode_json_exposes_components_separately(self):
        results = [_absolute_entry(count=7, fixed_lpa=22.0, variable_lpa=3.0, esop_lpa=0.0)]
        payload = salary_lookup.json_results(results, ABSOLUTE_METADATA)
        resolved = payload[0]["categories"]["ai_engineer_3_5y"]["resolved"]
        self.assertEqual(resolved["fixed_lpa"], 22.0)
        self.assertEqual(resolved["variable_lpa"], 3.0)
        self.assertEqual(resolved["esop_lpa"], 0.0)
        self.assertEqual(resolved["total_ctc_lpa"], 25.0)
        self.assertEqual(resolved["derived_fields"], ["total_ctc_lpa"])
        self.assertEqual(resolved["currency"], "INR")
        self.assertEqual(resolved["unit"], "LPA")

    def test_absolute_mode_json_marks_unknown_components_null(self):
        results = [_absolute_entry(count=11, variable_lpa=5.0, total_ctc_lpa=45.0)]
        payload = salary_lookup.json_results(results, ABSOLUTE_METADATA)
        resolved = payload[0]["categories"]["ai_engineer_3_5y"]["resolved"]
        self.assertIsNone(resolved["fixed_lpa"])
        self.assertIsNone(resolved["esop_lpa"])

    def test_absolute_mode_json_does_not_mutate_input(self):
        results = [_absolute_entry(count=7, fixed_lpa=22.0)]
        salary_lookup.json_results(results, ABSOLUTE_METADATA)
        self.assertNotIn("resolved", results[0]["categories"]["ai_engineer_3_5y"])


class ValidateAbsoluteModeTests(unittest.TestCase):
    def _issues(self, category, metadata=None):
        data = {
            "metadata": metadata if metadata is not None else {"mode": "absolute"},
            "companies": [{"company": "Acme", "categories": {"eng": category}}],
        }
        return collect_validation_issues(data)

    def test_valid_absolute_entry_has_no_issues(self):
        errors, warnings = self._issues(
            {"count": 42, "fixed_lpa": 28.0, "variable_lpa": 4.0,
             "esop_lpa": 6.0, "total_ctc_lpa": 38.0}
        )
        self.assertEqual(errors, [])
        self.assertEqual(warnings, [])

    def test_unknown_mode_is_an_error(self):
        errors, _ = collect_validation_issues(
            {"metadata": {"mode": "sideways"}, "companies": []}
        )
        self.assertTrue(any("metadata.mode" in e for e in errors))

    def test_non_numeric_component_is_an_error(self):
        errors, _ = self._issues({"fixed_lpa": "28 lakh"})
        self.assertTrue(any("fixed_lpa must be a number" in e for e in errors))

    def test_inconsistent_sum_is_a_warning_not_an_error(self):
        errors, warnings = self._issues(
            {"fixed_lpa": 28.0, "variable_lpa": 4.0, "esop_lpa": 6.0, "total_ctc_lpa": 50.0}
        )
        self.assertEqual(errors, [])
        self.assertEqual(len(warnings), 1)
        self.assertIn("components sum to 38", warnings[0])

    def test_small_rounding_difference_is_tolerated(self):
        _, warnings = self._issues(
            {"fixed_lpa": 28.0, "variable_lpa": 4.0, "esop_lpa": 6.0, "total_ctc_lpa": 39.0}
        )
        self.assertEqual(warnings, [])

    def test_absolute_checks_do_not_run_in_index_mode(self):
        errors, _ = self._issues({"fixed_lpa": "28 lakh"}, metadata={})
        self.assertEqual(errors, [])


class ValidateFlagAbsoluteTests(ValidateFlagTests):
    def test_validate_flag_reports_absolute_sum_warning(self):
        code, out = self._run_validate(
            '{"metadata": {"mode": "absolute"}, "companies": ['
            '{"company": "Acme", "categories": {"eng": {"fixed_lpa": 28, '
            '"variable_lpa": 4, "esop_lpa": 6, "total_ctc_lpa": 50}}}]}'
        )
        self.assertEqual(code, 0)
        self.assertIn("components sum to 38", out)

    def test_validate_flag_rejects_unknown_mode(self):
        code, out = self._run_validate('{"metadata": {"mode": "sideways"}, "companies": []}')
        self.assertEqual(code, 1)
        self.assertIn("metadata.mode", out)



if __name__ == "__main__":
    unittest.main()
