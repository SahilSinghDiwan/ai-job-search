# wwr-cli

Zero-dependency Bun/TypeScript CLI for **We Work Remotely**, with per-listing
India-eligibility classification.

```bash
cd .agents/skills/wwr-search/cli
bun install          # dev types only — there are no runtime dependencies
bun run typecheck
bun test             # fully offline: fixture-driven, no network
```

Run it from the repo root:

```bash
bun run .agents/skills/wwr-search/cli/src/cli.ts search -q "AI engineer" --format table
bun run .agents/skills/wwr-search/cli/src/cli.ts detail <slug> --format plain
```

Full documentation, flags and the eligibility rules live in `../SKILL.md`; the
markup anchors and the robots.txt as found live in `../url-reference.md`.

## Layout

| File | Responsibility |
|------|----------------|
| `src/cli.ts` | Flag parsing, help text, validation, command dispatch |
| `src/helpers.ts` | Fetch with backoff + challenge detection, HTML parsing for cards and detail pages |
| `src/eligibility.ts` | **The classifier** — geographic scope → class + gate verdict |
| `src/dates.ts` | Relative badge → ISO date, with explicit precision and floors |
| `src/commands/search.ts` | URL building, dedupe, eligibility filtering, output rendering |
| `src/commands/detail.ts` | Slug/URL normalisation, single-listing output |

## Design rules that must not be quietly changed

1. **No runtime dependencies, and no `package.json` lifecycle scripts.**
   `tools/security_guards.py` fails the build on lifecycle scripts.
2. **A challenge is a stop sign.** `htmlFetch` aborts on a Cloudflare
   interstitial. Never add challenge solving, fingerprint spoofing or UA
   rotation to get past it.
3. **Never guess a listing into "eligible".** A listing with no stated scope is
   `unknown`, forever. India is matched on flag code points or an exact country
   name, never a substring (`Indonesia` must not match).
4. **Keep FAIL and FLAG distinct.** They map onto
   `.claude/skills/job-application-assistant/04-job-evaluation.md`'s remote gate,
   where a bare country tag is a FLAG and a stated residency requirement is a
   FAIL. Collapsing them breaks the evaluation downstream.
5. **A relative date is an estimate; a `+` badge is a floor.** Say so in the
   output rather than emitting a confident-looking ISO date.
6. **Polite pacing.** One search request per run, one detail request per
   listing you actually care about. No crawling.

## Tests

67 tests across five files, all offline:

| File | Covers |
|------|--------|
| `tests/eligibility.test.ts` | Classifier: chip shapes, the Indonesia trap, EMEA, FAIL vs FLAG, country-code lists |
| `tests/dates.test.ts` | Badge parsing, floors, UTC arithmetic, null-not-guess |
| `tests/parsing.test.ts` | Real captured HTML → cards and details, ad skipping, the re-post date conflict |
| `tests/filtering.test.ts` | URL building, filter modes, the summary line, dedupe |
| `tests/cli-contract.test.ts` | Help, exit codes, JSON errors on stderr, id normalisation |
