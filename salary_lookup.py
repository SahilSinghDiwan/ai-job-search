#!/usr/bin/env python3
"""
Salary Benchmark Lookup Tool

Looks up company salary data from a user-provided dataset.
Supports any salary data source — union statistics, AmbitionBox/levels.fyi
scrapes, Glassdoor exports, manually collected benchmarks, etc.

Two data modes (metadata.mode):
  "index"    - default when the key is absent. Category values are an index
               against metadata.index_baseline (100 = median).
  "absolute" - category values are money: fixed_lpa / variable_lpa / esop_lpa /
               total_ctc_lpa, rendered with metadata.currency + metadata.unit.
               Built for Indian offers, which are quoted as one bundled "CTC"
               number; the split is what shows whether the fixed component
               actually clears a fixed-pay floor.

This tool requires a data file (salary_data.json) that you create
from your own salary data. See tools/README_SALARY_TOOL.md for
instructions on the expected format and how to convert from Excel.

Usage:
    python salary_lookup.py "Company Name"
    python salary_lookup.py "Company Name" --city "København"
    python salary_lookup.py "Company Name" --json
    python salary_lookup.py --list-all
"""

import json
import sys
import re
import argparse
import unicodedata
from pathlib import Path

DATA_FILE = Path(__file__).parent / "salary_data.json"

# Common Danish <-> anglicized spelling variants
SPELLING_VARIANTS = {
    "ø": "o", "æ": "ae", "å": "aa",
    "ö": "o", "ä": "ae", "ü": "u",
}

# ---------------------------------------------------------------------------
# Company-name stripping
#
# Two tiers, deliberately:
#
#   STRIP_PATTERNS            - applied unconditionally. Only tokens that carry
#                               no identity at all: legal-entity suffixes and
#                               market/parenthetical noise. Dropping them can
#                               never merge two genuinely different companies.
#
#   AGGRESSIVE_STRIP_PATTERNS - STRIP_PATTERNS plus generic industry words
#                               ("technologies", "solutions", "systems",
#                               "labs", "india", "GCC", ...). These DO carry
#                               some identity: "Acme Systems" and "Acme Labs"
#                               could be different firms. So they are used only
#                               in a second, lower-confidence scoring pass whose
#                               result is capped at AGGRESSIVE_SCORE_CAP, well
#                               below the exact/substring tiers. That pass can
#                               only ever raise a weak score, never lower or
#                               override a confident one.
# ---------------------------------------------------------------------------

# Danish/Nordic legal suffixes and market noise (upstream heritage - kept intact).
DANISH_STRIP_PATTERNS = [
    r"\ba/s\b", r"\baps\b", r"\bi/s\b", r"\bp/s\b", r"\bk/s\b",
    r"\bivs\b", r"\bamba\b", r"\ba\.m\.b\.a\.\b",
    r"\bdanmark\b", r"\bdenmark\b", r"\bscandinavia\b", r"\bnordic\b",
]

# Indian (and generic international) legal-entity suffixes. Longest forms first
# so "pvt ltd" is consumed before the bare "ltd" pattern gets a chance.
# `(?!\w)` rather than `\b` at the end so a trailing "." still matches
# ("Pvt. Ltd." -> ""). Case is already lowered by the caller.
INDIAN_LEGAL_SUFFIX_PATTERNS = [
    r"\bpvt\.?\s*ltd\.?(?!\w)",
    r"\bpvt\.?\s*limited(?!\w)",
    r"\bprivate\s+ltd\.?(?!\w)",
    r"\bprivate\s+limited(?!\w)",
    r"\bpvt\.?(?!\w)",
    r"\bltd\.?(?!\w)",
    r"\blimited(?!\w)",
    r"\bllp\.?(?!\w)",
]

# Anglophone entity suffixes. Deliberately in the *lower-confidence* tier:
# unlike "Pvt Ltd" these are short English words that can be part of a real
# name (e.g. "Simple Corp"), and upstream data files were built assuming they
# are retained. Stripping them still yields a match, just a capped one.
ANGLO_SUFFIX_PATTERNS = [
    r"\binc\.?(?!\w)",
    r"\bcorporation(?!\w)",
    r"\bcorp\.?(?!\w)",
]

# Generic industry / market-noise words. Lower-confidence tier only.
GENERIC_MARKET_NOISE_PATTERNS = [
    r"\bglobal\s+capability\s+cent(?:er|re)s?(?!\w)",
    r"\bgcc(?!\w)",
    r"\btechnologies(?!\w)", r"\btechnology(?!\w)", r"\btech(?!\w)",
    r"\bsolutions?(?!\w)",
    r"\bsoftware(?!\w)",
    r"\bsystems?(?!\w)",
    r"\blabs?(?!\w)", r"\blaboratories(?!\w)",
    r"\bindia(?!\w)",
]

# Patterns that must run last: they eat the rest of the string.
TAIL_STRIP_PATTERNS = [
    r"\(vg\)", r"\(.*?\)",  # (VG) and other parentheticals
    r"\bgroup\b", r"\bholding\b",
    r",\s*.*$",  # everything after comma (sub-entities)
]

# Unconditional pass: no-identity tokens only.
STRIP_PATTERNS = (
    DANISH_STRIP_PATTERNS
    + INDIAN_LEGAL_SUFFIX_PATTERNS
    + TAIL_STRIP_PATTERNS
)

# Lower-confidence pass: also drops generic industry words.
AGGRESSIVE_STRIP_PATTERNS = (
    DANISH_STRIP_PATTERNS
    + INDIAN_LEGAL_SUFFIX_PATTERNS
    + ANGLO_SUFFIX_PATTERNS
    + GENERIC_MARKET_NOISE_PATTERNS
    + TAIL_STRIP_PATTERNS
)

# Ceiling for scores produced by the aggressive pass. Above the 30-point search
# threshold (so those matches surface) but below the 70/75/80/85/100 tiers the
# unconditional pass produces (so it never outranks a confident match).
AGGRESSIVE_SCORE_CAP = 65

# --- Salary data modes -----------------------------------------------------
MODE_INDEX = "index"
MODE_ABSOLUTE = "absolute"
KNOWN_MODES = (MODE_INDEX, MODE_ABSOLUTE)

# Absolute-mode component fields, in render order.
ABSOLUTE_COMPONENT_FIELDS = ("fixed_lpa", "variable_lpa", "esop_lpa")
ABSOLUTE_TOTAL_FIELD = "total_ctc_lpa"
ABSOLUTE_FIELDS = ABSOLUTE_COMPONENT_FIELDS + (ABSOLUTE_TOTAL_FIELD,)

ABSOLUTE_FIELD_LABELS = {
    "fixed_lpa": "Fixed",
    "variable_lpa": "Variable",
    "esop_lpa": "ESOP",
    ABSOLUTE_TOTAL_FIELD: "Total CTC",
}

CURRENCY_SYMBOLS = {
    "INR": "\u20b9", "USD": "$", "EUR": "\u20ac", "GBP": "\u00a3",
    "DKK": "kr", "SEK": "kr", "NOK": "kr",
}


def get_mode(metadata):
    """Return the data mode declared in metadata; 'index' when absent."""
    if not isinstance(metadata, dict):
        return MODE_INDEX
    mode = metadata.get("mode")
    if not mode:
        return MODE_INDEX
    return str(mode).strip().lower()


def fail_data_error(message):
    """Exit with a user-facing salary data setup error."""
    print(f"Error: invalid salary_data.json: {message}", file=sys.stderr)
    print("", file=sys.stderr)
    print("See tools/README_SALARY_TOOL.md for the expected format.", file=sys.stderr)
    sys.exit(1)


def absolute_field_errors(entry_index, cat_label, cat_data):
    """Hard errors for absolute-mode component fields (must be numeric)."""
    errors = []
    for field in ABSOLUTE_FIELDS:
        value = cat_data.get(field)
        if value is None:
            continue
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            errors.append(
                f"companies[{entry_index}].categories.{cat_label}.{field} must be a "
                f"number when provided (got {type(value).__name__})"
            )
    return errors


def absolute_sum_warnings(entry_index, cat_label, cat_data):
    """Warn (never error) when stated components do not add up to the total.

    Rounding, statutory loading (PF/gratuity) and notional ESOP valuations
    legitimately break the sum, so a mismatch is informational only.
    """
    numeric = {}
    for field in ABSOLUTE_FIELDS:
        value = cat_data.get(field)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            numeric[field] = float(value)

    total = numeric.get(ABSOLUTE_TOTAL_FIELD)
    if total is None:
        return []
    if not all(f in numeric for f in ABSOLUTE_COMPONENT_FIELDS):
        return []

    component_sum = sum(numeric[f] for f in ABSOLUTE_COMPONENT_FIELDS)
    tolerance = max(0.5, abs(total) * 0.05)
    if abs(component_sum - total) <= tolerance:
        return []
    return [
        f"companies[{entry_index}].categories.{cat_label}: components sum to "
        f"{component_sum:g} but {ABSOLUTE_TOTAL_FIELD} is {total:g} "
        f"(difference {component_sum - total:+g}); this can be legitimate "
        f"(statutory loading, rounding, notional ESOP value) - verify the split"
    ]


def collect_validation_issues(data):
    """Return (errors, warnings) for the salary data shape.

    errors   -> hard problems that make lookups crash or emit wrong output
                (these cause validate_data() to exit(1)).
    warnings -> usability concerns that still work (e.g. duplicate company
                names); --validate reports them but exits 0.
    """
    errors = []
    warnings = []

    if not isinstance(data, dict):
        errors.append("top-level JSON value must be an object")
        return errors, warnings

    metadata = data.get("metadata", {})
    if metadata is not None and not isinstance(metadata, dict):
        errors.append("'metadata' must be an object when provided")

    mode = MODE_INDEX
    if isinstance(metadata, dict):
        raw_mode = metadata.get("mode")
        if raw_mode is not None:
            if not isinstance(raw_mode, str) or raw_mode.strip().lower() not in KNOWN_MODES:
                errors.append(
                    "'metadata.mode' must be one of "
                    + ", ".join(f"'{m}'" for m in KNOWN_MODES)
                    + f" (got {raw_mode!r})"
                )
            else:
                mode = raw_mode.strip().lower()

    companies = data.get("companies")
    if not isinstance(companies, list):
        errors.append("'companies' must be a list")
        return errors, warnings

    seen_companies = {}
    for index, entry in enumerate(companies, start=1):
        if not isinstance(entry, dict):
            errors.append(f"companies[{index}] must be an object")
            continue

        company = entry.get("company")
        if not isinstance(company, str) or not company.strip():
            errors.append(f"companies[{index}].company must be a non-empty string")
        else:
            key = company.lower()
            if key in seen_companies:
                warnings.append(
                    f"Duplicate company name '{company}' "
                    f"(companies[{seen_companies[key]}] and companies[{index}])"
                )
            else:
                seen_companies[key] = index

        city = entry.get("city")
        if city is not None and not isinstance(city, str):
            errors.append(f"companies[{index}].city must be a string when provided")

        categories = entry.get("categories", {})
        if categories is not None and not isinstance(categories, dict):
            errors.append(f"companies[{index}].categories must be an object when provided")
        elif categories:
            for cat_label, cat_data in categories.items():
                if not isinstance(cat_data, dict):
                    errors.append(
                        f"companies[{index}].categories.{cat_label} must be an object "
                        f"with 'count' and/or 'index' (got {type(cat_data).__name__})"
                    )
                    continue
                count = cat_data.get("count")
                if count is not None and not isinstance(count, (int, float)):
                    errors.append(
                        f"companies[{index}].categories.{cat_label}.count must be a "
                        f"number (got {type(count).__name__})"
                    )
                index_val = cat_data.get("index")
                if index_val is not None and not isinstance(index_val, (int, float, str)):
                    errors.append(
                        f"companies[{index}].categories.{cat_label}.index must be a "
                        f"number or string (got {type(index_val).__name__})"
                    )

                if mode == MODE_ABSOLUTE:
                    errors.extend(absolute_field_errors(index, cat_label, cat_data))
                    warnings.extend(absolute_sum_warnings(index, cat_label, cat_data))

    return errors, warnings


def validate_data(data):
    """Validate the salary data shape before lookups use it.

    Preserves historical behavior: exits(1) on the first hard error with the
    same user-facing message, and returns data unchanged when valid.
    """
    errors, _ = collect_validation_issues(data)
    if errors:
        fail_data_error(errors[0])
    return data


def read_raw_data():
    """Load and JSON-parse salary_data.json; exit with a helpful message if missing/invalid."""
    if not DATA_FILE.exists():
        print("Error: salary_data.json not found.", file=sys.stderr)
        print("", file=sys.stderr)
        print("This tool requires a salary data file.", file=sys.stderr)
        print("See tools/README_SALARY_TOOL.md for setup instructions.", file=sys.stderr)
        print("", file=sys.stderr)
        print("If you don't have salary data, the salary lookup", file=sys.stderr)
        print("step will be skipped during /apply.", file=sys.stderr)
        sys.exit(1)
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as exc:
        fail_data_error(f"invalid JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}")
    return data


def load_data():
    """Load, parse, and validate salary_data.json for lookups."""
    return validate_data(read_raw_data())


def normalize(s, aggressive=False):
    """Normalize string for robust fuzzy matching.

    aggressive=True additionally strips generic industry words
    (see AGGRESSIVE_STRIP_PATTERNS) — lower confidence, used by the
    secondary scoring pass only.
    """
    patterns = AGGRESSIVE_STRIP_PATTERNS if aggressive else STRIP_PATTERNS
    s = s.lower().strip()
    for pat in patterns:
        s = re.sub(pat, "", s)
    s = re.sub(r"[^a-zæøåöäü0-9]", "", s)
    return s.strip()


def anglicize(s):
    """Convert Danish/Nordic characters to anglicized equivalents."""
    s = s.lower()
    for danish, english in SPELLING_VARIANTS.items():
        s = s.replace(danish, english)
    return s


def extract_core_words(s, aggressive=False):
    """Extract meaningful words from a company name, ignoring noise.

    Always uses the aggressive pattern list, in both tiers. Word-overlap is the
    weakest scoring signal, and generic words must never be what produces the
    overlap: without this, "Acme India Pvt Ltd" would half-match
    "Globex Solutions India Private Limited" purely on the word "india".
    The `aggressive` flag is accepted for symmetry with normalize().
    """
    patterns = AGGRESSIVE_STRIP_PATTERNS
    s = s.lower()
    for pat in patterns:
        s = re.sub(pat, "", s)
    words = re.findall(r"[a-zæøåöäü0-9]+", s)
    return [w for w in words if len(w) > 1]


def build_query_terms(query, aggressive=False):
    """Precompute the normalized representations of a query used for scoring."""
    q_norm = normalize(query, aggressive=aggressive)
    q_ang = anglicize(q_norm)
    q_words = extract_core_words(query, aggressive=aggressive)
    return {
        "norm": q_norm,
        "ang": q_ang,
        "words": set(q_words),
        "words_ang": {anglicize(w) for w in q_words},
    }


def score_pass(q_norm, q_ang, q_words_set, q_words_ang_set, entry_name, aggressive=False):
    """Score one query/entry pair under a single normalization tier (0-100)."""
    n_norm = normalize(entry_name, aggressive=aggressive)

    if not q_norm or not n_norm:
        return 0

    if q_norm == n_norm:
        return 100

    if q_norm in n_norm:
        ratio = len(q_norm) / len(n_norm)
        if len(q_norm) <= 4 and ratio < 0.5:
            n_words = set(extract_core_words(entry_name, aggressive=aggressive))
            if not q_words_set & n_words:
                pass
            else:
                return 80 + int(ratio * 10)
        else:
            return 80 + int(ratio * 10)
    if n_norm in q_norm:
        ratio = len(n_norm) / len(q_norm)
        if len(n_norm) <= 4 and ratio < 0.5:
            pass
        else:
            return 80 + int(ratio * 10)

    n_ang = anglicize(n_norm)
    if q_ang == n_ang:
        return 85
    if q_ang in n_ang or n_ang in q_ang:
        shorter = min(len(q_ang), len(n_ang))
        longer = max(len(q_ang), len(n_ang))
        if shorter <= 4 and shorter / longer < 0.5:
            n_words_ang = {anglicize(w) for w in extract_core_words(entry_name, aggressive=aggressive)}
            if q_words_ang_set & n_words_ang:
                return 75
        else:
            return 75

    n_words = set(extract_core_words(entry_name, aggressive=aggressive))
    if not q_words_set or not n_words:
        return 0

    overlap = q_words_set & n_words
    if not overlap:
        n_words_ang = {anglicize(w) for w in n_words}
        overlap = q_words_ang_set & n_words_ang

    if overlap:
        if len(q_words_set) == 1:
            q_word = list(q_words_set)[0]
            if q_word in n_words or anglicize(q_word) in {anglicize(w) for w in n_words}:
                return 70
            else:
                return 0

        coverage = len(overlap) / len(q_words_set)
        return int(30 + coverage * 40)

    return 0


def match_score_optimized(q_norm, q_ang, q_words_set, q_words_ang_set, query, entry_name,
                          aggressive_terms=None):
    """Compute a match score between 0 and 100 using precalculated query values.

    Runs the confident (unconditional-strip) pass first. If that pass is not
    already decisive, a second pass over the aggressive normalization runs and
    its score - capped at AGGRESSIVE_SCORE_CAP - can raise, but never lower,
    the result. This is what lets "Acme India Pvt. Ltd." match
    "Acme Technologies Pvt Ltd" without letting generic words like
    "technologies" manufacture a high-confidence match.
    """
    score = score_pass(q_norm, q_ang, q_words_set, q_words_ang_set, entry_name)
    if score >= AGGRESSIVE_SCORE_CAP:
        return score

    if aggressive_terms is None:
        aggressive_terms = build_query_terms(query, aggressive=True)
    if not aggressive_terms["norm"]:
        return score

    agg = score_pass(
        aggressive_terms["norm"], aggressive_terms["ang"],
        aggressive_terms["words"], aggressive_terms["words_ang"],
        entry_name, aggressive=True,
    )
    return max(score, min(agg, AGGRESSIVE_SCORE_CAP))


def match_score(query, entry_name):
    """Compute a match score between 0 and 100 for ranking results."""
    terms = build_query_terms(query)
    return match_score_optimized(
        terms["norm"], terms["ang"], terms["words"], terms["words_ang"],
        query, entry_name,
    )


def search_company(data, query, city=None):
    """Search for a company by name. Returns matching entries sorted by relevance."""
    companies = data.get("companies", [])
    scored = []

    # Pre-calculate query representations once to avoid redundant computations inside the loop
    terms = build_query_terms(query)
    aggressive_terms = build_query_terms(query, aggressive=True)
    q_norm, q_ang = terms["norm"], terms["ang"]
    q_words_set, q_words_ang_set = terms["words"], terms["words_ang"]

    for entry in companies:
        if city:
            city_lower = city.lower()
            entry_city = (entry.get("city") or "").lower()
            if city_lower not in entry_city and anglicize(city_lower) not in anglicize(entry_city):
                continue

        score = match_score_optimized(
            q_norm, q_ang, q_words_set, q_words_ang_set, query, entry["company"],
            aggressive_terms=aggressive_terms,
        )
        if score > 0:
            scored.append((score, entry))

    scored.sort(key=lambda x: (-x[0], x[1]["company"]))

    min_score = 30
    return [entry for score, entry in scored if score >= min_score]


def currency_prefix(metadata):
    """Return the symbol/code used to prefix money amounts."""
    currency = (metadata.get("currency") or "").strip().upper()
    if not currency:
        return ""
    return CURRENCY_SYMBOLS.get(currency, currency + " ")


def unit_label(metadata):
    """Return the unit suffix for money amounts (e.g. 'LPA', 'k')."""
    return (metadata.get("unit") or "").strip()


def resolve_absolute_components(cat_data):
    """Resolve the fixed/variable/esop/total picture for one category.

    Returns (values, derived) where `values` maps each of the four fields to a
    float or None (None == not reported; never guessed as zero), and `derived`
    is the set of fields whose value was computed rather than stated.

    Derivation rules, deliberately conservative:
      * total absent, at least one component present -> total = sum of the
        components that are present, ONLY if every component is present.
      * one component absent while the total and all other components are
        present -> that component = total - others.
    Anything less complete is left as unknown rather than silently inferred,
    because a partial sum would understate the fixed-pay floor that this whole
    split exists to expose.
    """
    values = {}
    for field in ABSOLUTE_FIELDS:
        raw = cat_data.get(field)
        values[field] = float(raw) if isinstance(raw, (int, float)) else None

    derived = set()
    components = ABSOLUTE_COMPONENT_FIELDS
    present = [f for f in components if values[f] is not None]
    missing = [f for f in components if values[f] is None]

    if values[ABSOLUTE_TOTAL_FIELD] is None and not missing:
        values[ABSOLUTE_TOTAL_FIELD] = sum(values[f] for f in components)
        derived.add(ABSOLUTE_TOTAL_FIELD)
    elif values[ABSOLUTE_TOTAL_FIELD] is not None and len(missing) == 1:
        field = missing[0]
        values[field] = values[ABSOLUTE_TOTAL_FIELD] - sum(values[f] for f in present)
        derived.add(field)

    return values, derived


def format_absolute_categories(categories, metadata):
    """Render absolute-mode categories as a money table."""
    prefix = currency_prefix(metadata)
    unit = unit_label(metadata)
    headers = [ABSOLUTE_FIELD_LABELS[f] for f in ABSOLUTE_FIELDS]

    lines = []
    header = f"  {'Category':<22} {'Count':>6}"
    for h in headers:
        header += f" {h:>12}"
    lines.append(header)
    lines.append(f"  {'-'*(30 + 13*len(headers))}")

    any_unknown = False
    any_derived = False
    for label, cat_data in categories.items():
        if not isinstance(cat_data, dict):
            continue
        display_label = label.replace("_", " ").title()
        count = cat_data.get("count")
        count_str = str(count) if count is not None else "-"
        values, derived = resolve_absolute_components(cat_data)
        row = f"  {display_label:<22} {count_str:>6}"
        for field in ABSOLUTE_FIELDS:
            value = values[field]
            if value is None:
                any_unknown = True
                cell = "?"
            else:
                cell = f"{prefix}{value:.1f}"
                if field in derived:
                    any_derived = True
                    cell += "~"
            row += f" {cell:>12}"
        lines.append(row)

    if unit:
        lines.append(f"\n  All amounts in {unit}"
                     + (f" ({metadata['currency']})" if metadata.get("currency") else ""))
    if any_unknown:
        lines.append("  ? = not reported (not zero - treat as unknown)")
    if any_derived:
        lines.append("  ~ = derived from the other components, not stated in the data")
    if metadata.get("baseline_description"):
        lines.append(f"  {metadata['baseline_description']}")
    return lines


def format_entry(entry, metadata):
    """Format a single company entry for display."""
    metadata = metadata or {}
    lines = []
    lines.append(f"\n{'='*60}")
    lines.append(f"  {entry['company']}")
    if entry.get("city"):
        lines.append(f"  Location: {entry['city']}")
    lines.append(f"{'='*60}")

    # Get category data (everything except company/city fields)
    categories = entry.get("categories", {})
    if not categories:
        # Fallback: treat any numeric fields as categories
        skip_keys = {"company", "city", "categories"}
        for key, value in entry.items():
            if key not in skip_keys and isinstance(value, dict):
                categories[key] = value

    if categories and get_mode(metadata) == MODE_ABSOLUTE:
        lines.extend(format_absolute_categories(categories, metadata))
    elif categories:
        index_label = metadata.get("index_label", "Index")
        baseline = metadata.get("index_baseline", 100)

        lines.append(f"  {'Category':<22} {'Count':>6} {index_label:>8}  {'vs Baseline':>10}")
        lines.append(f"  {'-'*50}")

        for label, data in categories.items():
            display_label = label.replace("_", " ").title()
            count = data.get("count")
            index = data.get("index")
            if count is not None or index is not None:
                count_str = str(count) if count is not None else "-"
                if isinstance(index, (int, float)):
                    index_str = f"{index:.1f}"
                    if baseline == 0:
                        diff_str = ""
                    else:
                        diff_pct = ((index - baseline) / baseline) * 100
                        sign = "+" if diff_pct >= 0 else ""
                        diff_str = f"{sign}{diff_pct:.1f}%"
                elif index is not None:
                    index_str = str(index)
                    diff_str = ""
                else:
                    index_str = "N/A*"
                    diff_str = ""
                lines.append(f"  {display_label:<22} {count_str:>6} {index_str:>8}  {diff_str:>10}")

        lines.append(f"\n  * N/A = Too few employees to publish (privacy)")
        if metadata.get("baseline_description"):
            lines.append(f"  {metadata['baseline_description']}")
        else:
            lines.append(f"  {index_label} {baseline} = baseline")
    else:
        # Simple format: just show all non-standard fields
        skip_keys = {"company", "city", "categories"}
        for key, value in entry.items():
            if key not in skip_keys:
                display_key = key.replace("_", " ").title()
                lines.append(f"  {display_key}: {value}")

    return "\n".join(lines)


def json_results(results, metadata):
    """Build the --json payload.

    Index mode returns the matched entries verbatim (unchanged from earlier
    versions, so existing consumers keep working). Absolute mode returns the
    same entries with each category augmented by a `resolved` block that
    exposes every component separately, marks unreported components as null,
    and lists which values were derived rather than stated.
    """
    if get_mode(metadata) != MODE_ABSOLUTE:
        return results

    enriched = []
    for entry in results:
        copy = dict(entry)
        categories = {}
        for label, cat_data in (entry.get("categories") or {}).items():
            if not isinstance(cat_data, dict):
                categories[label] = cat_data
                continue
            values, derived = resolve_absolute_components(cat_data)
            cat_copy = dict(cat_data)
            cat_copy["resolved"] = {
                "currency": metadata.get("currency"),
                "unit": metadata.get("unit"),
                **{field: values[field] for field in ABSOLUTE_FIELDS},
                "derived_fields": sorted(derived),
            }
            categories[label] = cat_copy
        copy["categories"] = categories
        enriched.append(copy)
    return enriched


def print_validation_report(errors, warnings):
    """Print an actionable validation report. Returns the process exit code."""
    if not errors and not warnings:
        print("OK - no issues found.")
        return 0
    print(f"Found {len(errors) + len(warnings)} issue(s):")
    if errors:
        print("  Errors:")
        for i, msg in enumerate(errors, start=1):
            print(f"    [{i}] {msg}")
    if warnings:
        print("  Warnings:")
        for i, msg in enumerate(warnings, start=1):
            print(f"    [{i}] {msg}")
    if errors:
        print("")
        print("Fix the errors above, then re-run. See tools/README_SALARY_TOOL.md "
              "for the expected format.")
        return 1
    return 0


def main():
    parser = argparse.ArgumentParser(description="Salary Benchmark Lookup")
    parser.add_argument("company", nargs="?", help="Company name to search for")
    parser.add_argument("--city", help="Filter by city name")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--list-all", action="store_true", help="List all companies")
    parser.add_argument("--validate", action="store_true",
                        help="Validate salary_data.json and print a report, then exit")
    args = parser.parse_args()

    if args.validate:
        data = read_raw_data()
        errors, warnings = collect_validation_issues(data)
        print(f"Validating {DATA_FILE.name} ...")
        print("")
        sys.exit(print_validation_report(errors, warnings))

    data = load_data()
    metadata = data.get("metadata", {})
    companies = data.get("companies", [])

    if args.list_all:
        for entry in companies:
            city = entry.get("city", "")
            city_str = f" ({city})" if city else ""
            print(f"{entry['company']}{city_str}")
        return

    if not args.company:
        parser.print_help()
        sys.exit(1)

    results = search_company(data, args.company, args.city)

    if not results:
        print(f"No results found for '{args.company}'")
        if args.city:
            print(f"  (filtered by city: {args.city})")
        print("\nTry a shorter or different name. Company names in the dataset")
        print("may include legal suffixes like 'A/S', 'ApS', 'Pvt Ltd' or")
        print("'Private Limited', or market noise like 'India' or 'Technologies'.")
        sys.exit(1)

    if args.json:
        print(json.dumps(json_results(results, metadata), ensure_ascii=False, indent=2))
    else:
        print(f"\nFound {len(results)} match(es) for '{args.company}':")
        for entry in results:
            print(format_entry(entry, metadata))
        print()


if __name__ == "__main__":
    main()
