# Salary Benchmark Tool

## What is this?

The salary lookup tool (`salary_lookup.py`) lets you benchmark a company's compensation against your own collected data. It's used during the `/apply` workflow to show how a company compares to the market band you're targeting.

**This tool is optional.** If you don't have salary data, the salary step is simply skipped during `/apply`.

## How it works

The tool reads a `salary_data.json` file in the repo root. It fuzzy-matches companies by name, handling legal suffixes (`A/S`, `ApS`, `Pvt Ltd`, `Private Limited`, `LLP`), Nordic characters, anglicized spellings, generic market noise (`Technologies`, `Solutions`, `India`, `GCC`), and partial matches.

There are **two data modes**, selected by `metadata.mode`:

| Mode | `metadata.mode` | Category values are | Use when |
|------|-----------------|---------------------|----------|
| Index | `"index"` (default when the key is absent) | an index against a baseline, e.g. 100 = median | union statistics, relative benchmarks |
| Absolute | `"absolute"` | money, split into fixed / variable / ESOP / total CTC | Indian offers quoted as a single "CTC" number, or any market where you want real amounts |

Index mode is the historical behavior and is unchanged.

---

## Mode 1: index

```json
{
  "metadata": {
    "source": "My Union Statistics 2025",
    "index_baseline": 100,
    "index_label": "Index",
    "baseline_description": "Index 100 = median salary for private sector"
  },
  "companies": [
    {
      "company": "Acme Technologies Pvt Ltd",
      "city": "Bengaluru",
      "categories": {
        "all_employees": { "count": 500, "index": 108.5 },
        "engineering": { "count": 120, "index": 112.3 }
      }
    }
  ]
}
```

### Fields

- **metadata.source**: Where the data comes from (for reference)
- **metadata.mode**: `"index"` or `"absolute"`. Omit for index mode.
- **metadata.index_baseline**: The baseline value (e.g. 100)
- **metadata.index_label**: Label for the index column in output
- **metadata.baseline_description**: Human-readable explanation of the baseline
- **companies[].company**: Company name (required)
- **companies[].city**: City/location (optional, used for filtering)
- **companies[].categories**: Named categories, each with `count` and/or `index`

---

## Mode 2: absolute (money)

### Why the fixed / variable / ESOP split exists

Indian offers are quoted as one bundled **total CTC** number. That number mixes:

- **fixed pay** — what actually lands in your bank account monthly,
- **variable / performance bonus** — conditional, often only partly paid out,
- **ESOPs** — valued at a notional (frequently optimistic) price, illiquid,
- **statutory loading** — PF, gratuity, insurance, counted into CTC but not take-home.

A headline **₹40 LPA CTC** can decompose to **₹26 LPA fixed** — or to ₹22 LPA fixed, which is below a ₹25 LPA fixed floor. Surfacing that decomposition is the entire point of absolute mode. The tool therefore **never invents a component**: an unreported component renders as `?`, not as `0`.

### Schema

```json
{
  "metadata": {
    "source": "AmbitionBox + levels.fyi, collected 2026-08",
    "mode": "absolute",
    "currency": "INR",
    "unit": "LPA",
    "baseline_description": "Market band for AI/GenAI engineers, 3-5 yrs, Bengaluru"
  },
  "companies": [
    {
      "company": "Acme Technologies Pvt Ltd",
      "city": "Bengaluru",
      "categories": {
        "ai_engineer_3_5y": {
          "count": 42,
          "fixed_lpa": 28.0,
          "variable_lpa": 4.0,
          "esop_lpa": 6.0,
          "total_ctc_lpa": 38.0
        }
      }
    }
  ]
}
```

### Fields

- **metadata.currency**: Currency code (`INR`, `USD`, …). Drives the symbol in output.
- **metadata.unit**: Amount unit (`LPA` for lakhs per annum, `k` for thousands, …). Labels only — the tool does no conversion.
- **companies[].categories.<name>.count**: Sample size behind the figures (optional but strongly recommended — a data point backed by 3 self-reports is not a benchmark)
- **`fixed_lpa` / `variable_lpa` / `esop_lpa` / `total_ctc_lpa`**: numbers, all optional.

A `USD`/`k` setup works identically, for global-remote roles:

```json
"metadata": { "mode": "absolute", "currency": "USD", "unit": "k" }
```

### What gets derived, and what never does

| Situation | Behavior |
|-----------|----------|
| All four fields present | Rendered as stated |
| Total absent, **all three** components present | Total derived as their sum, marked `~` |
| Total absent, only **some** components present | Total shown as `?` — no partial sum |
| **One** component absent, total **and all other components** present | That component derived, marked `~` |
| Two or more components absent | Both shown as `?` — nothing inferred |

Every derived number is flagged with `~` in text output and listed in `derived_fields` in `--json` output. Nothing is inferred silently.

### Sample output

```
Found 1 match(es) for 'Acme India Pvt. Ltd.':

============================================================
  Acme Technologies Pvt Ltd
  Location: Bengaluru
============================================================
  Category                Count        Fixed     Variable         ESOP    Total CTC
  ----------------------------------------------------------------------------------
  Ai Engineer 3 5Y           42        ₹28.0         ₹4.0         ₹6.0        ₹38.0
  Senior Ai Engineer         11            ?         ₹5.0            ?        ₹45.0

  All amounts in LPA (INR)
  ? = not reported (not zero - treat as unknown)
  Market band for AI/GenAI engineers, 3-5 yrs, Bengaluru
```

`--json` returns the matched entries with each category augmented by a `resolved` block that exposes every component separately (`null` where unreported) plus `derived_fields`:

```json
"resolved": {
  "currency": "INR", "unit": "LPA",
  "fixed_lpa": 22.0, "variable_lpa": 3.0, "esop_lpa": 0.0,
  "total_ctc_lpa": 25.0,
  "derived_fields": ["total_ctc_lpa"]
}
```

In index mode `--json` returns the entries verbatim, exactly as before.

---

## Company-name matching

Matching runs in two tiers, deliberately:

1. **Confident pass (unconditional stripping).** Tokens that carry no identity at all: `A/S`, `ApS`, `I/S`, `P/S`, `K/S`, `IvS`, `AMBA`, `Danmark`, `Denmark`, `Scandinavia`, `Nordic`, `Pvt Ltd`, `Pvt. Ltd.`, `Private Limited`, `Ltd`, `Limited`, `LLP`, parentheticals, `Group`, `Holding`, and anything after a comma. Dropping these can never merge two genuinely different companies.

2. **Lower-confidence pass (aggressive stripping).** Also drops `Inc`, `Corp`, `Corporation`, `Technologies`, `Technology`, `Tech`, `Solutions`, `Software`, `Systems`, `Labs`, `Laboratories`, `India`, `Global Capability Centre/Center`, `GCC`. These words **do** carry some identity — "Acme Systems" and "Acme Labs" could be different firms — so a match that only exists after this pass is **capped at `AGGRESSIVE_SCORE_CAP` (65)**: high enough to appear in results, never high enough to outrank a confident match.

`Inc` / `Corp` / `Corporation` are in the second tier on purpose: they're short English words that can be part of a real name ("Simple Corp"), and existing upstream data files assume they're retained.

Generic words are additionally excluded from word-overlap scoring in **both** tiers, so "Acme India Pvt Ltd" does not half-match "Globex Solutions India Private Limited" on the word "India" alone.

Result: `Acme Technologies Pvt Ltd`, `Acme Technologies Private Limited`, `Acme India Pvt. Ltd.` and `Acme Technologies` all resolve to one entry.

---

## Where to actually get this data

All of these are **self-reported and noisy**. Treat the resulting file as a *directional* benchmark for anchoring a negotiation, never as a source of truth, and never quote a figure from it to an employer as fact.

| Source | Best for | Watch out for |
|--------|----------|---------------|
| **[AmbitionBox](https://www.ambitionbox.com/salaries)** | Broadest coverage of Indian companies, including mid-size and services firms. High submission volume. | Reports **total CTC**, rarely the fixed/variable split. Skewed by service-company salaries within the same job title. Check the sample size shown per role. |
| **[levels.fyi](https://www.levels.fyi)** | Big tech, product companies, and GCCs. The best source for the **fixed vs stock vs bonus split** — which is exactly what absolute mode needs. | Thin coverage of Indian startups and services firms. Stock figures are at grant-time valuation. |
| **[Glassdoor India](https://www.glassdoor.co.in/Salaries/index.htm)** | Cross-checking AmbitionBox; some qualitative context from reviews. | Small samples per role; older entries not inflation-adjusted. |
| **[Blind](https://www.teamblind.com)** | Fresh, candid offer numbers and current band gossip for big tech/GCC. | Anonymous, unverified, heavy survivorship bias toward high offers. Anecdote, not data. |

Practical method:

1. Pull the **total CTC** band from AmbitionBox for the role + years of experience.
2. Pull the **split** (base / stock / bonus) from levels.fyi for the closest comparable company.
3. Apply that split shape to the AmbitionBox total to estimate `fixed_lpa`, and record what you actually know — leave unknown components **out of the JSON** rather than guessing them.
4. Record `count` (sample size) and put the collection month in `metadata.source`. Data older than ~12 months is stale for Indian AI salaries.
5. Re-run `--validate` after editing.

---

## Setup options

### Option A: Create salary_data.json manually

Create the file by hand, in either mode, from any source: the sites above, salary surveys, recruiter conversations, or your own offer history.

### Option B: Convert from Excel

```bash
pip install openpyxl

# index mode (default)
python3 tools/convert_salary_excel.py path/to/salary-data.xlsx \
  --source "My Salary Data 2025" \
  --baseline 100 \
  --baseline-desc "Index 100 = median salary"

# absolute mode
python3 tools/convert_salary_excel.py path/to/india-comp.xlsx \
  --mode absolute --currency INR --unit LPA \
  --source "AmbitionBox + levels.fyi, collected 2026-08" \
  --baseline-desc "Market band for AI/GenAI engineers, 3-5 yrs, Bengaluru"
```

On Windows, use `py` if that is how Python is exposed on your PATH. If your system uses `python` instead of `python3`, substitute that in the examples.

The converter auto-detects the layout:

- Looks for a `Company`/`Firma` column and an optional `City`/`By` column.
- **Index mode:** treats remaining columns as salary data and auto-pairs count/index columns.
- **Absolute mode:** classifies remaining columns by header keyword — `Fixed`/`Base`/`Basic`, `Variable`/`Bonus`/`Incentive`, `ESOP`/`RSU`/`Stock`/`Equity`, `Total`/`CTC`/`Package`, `Count` — and groups them into one category per role using the rest of the header. Columns matching no keyword are skipped with a warning (absolute mode never guesses that an unlabelled number is money).

Example absolute-mode sheet:

| Company | City | AI Engineer 3-5y Count | AI Engineer 3-5y Fixed | AI Engineer 3-5y Variable | AI Engineer 3-5y ESOP | AI Engineer 3-5y Total CTC |
|---------|------|-----|------|-----|-----|------|
| Acme Technologies Pvt Ltd | Bengaluru | 42 | 28.0 | 4.0 | 6.0 | 38.0 |

### Option C: Build from research

Start with a stub and add companies as you research them:

```json
{
  "metadata": {
    "source": "Personal research 2026-08",
    "mode": "absolute",
    "currency": "INR",
    "unit": "LPA",
    "baseline_description": "AI/GenAI engineer market band, Bengaluru"
  },
  "companies": [
    {
      "company": "Example Labs Pvt Ltd",
      "city": "Bengaluru",
      "categories": {
        "ai_engineer_3_5y": { "count": 5, "fixed_lpa": 30.0 }
      }
    }
  ]
}
```

## Usage

```bash
python3 salary_lookup.py "Acme Technologies"
python3 salary_lookup.py "Acme India Pvt Ltd" --city "Bengaluru"
python3 salary_lookup.py "Acme" --json
python3 salary_lookup.py --list-all
python3 salary_lookup.py --validate      # pre-flight check your salary_data.json
```

## Validation

`--validate` reports **errors** (exit 1) and **warnings** (exit 0):

Errors:
- malformed top-level shape, missing/blank company names, non-string city
- `metadata.mode` that is neither `"index"` nor `"absolute"`
- non-numeric `count`, or non-numeric `fixed_lpa` / `variable_lpa` / `esop_lpa` / `total_ctc_lpa` in absolute mode

Warnings:
- duplicate company names
- absolute-mode components that don't add up to a stated `total_ctc_lpa` (tolerance: the larger of 0.5 or 5%). This is a **warning, not an error** — statutory loading, rounding, and notional ESOP valuation legitimately break the sum.

## Important notes

- The data file (`salary_data.json`) is **excluded from git** (see `.gitignore`). Your salary data may be proprietary or confidential.
- If the data file is missing, `salary_lookup.py` exits with a helpful error message and the `/apply` workflow skips the salary benchmark step.
- The tool does **no currency conversion** and no inflation adjustment. `currency` and `unit` are labels.
- Absolute-mode figures are self-reported estimates. Use them to set an anchor and to check whether a bundled CTC clears your fixed-pay floor — not as evidence in a negotiation.
