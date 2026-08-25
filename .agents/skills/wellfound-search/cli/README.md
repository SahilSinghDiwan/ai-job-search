# wellfound-cli

Zero-dependency Bun/TypeScript CLI for browsing Wellfound (formerly AngelList
Talent) job listings from its robots.txt-permitted, server-rendered browse pages.

```bash
bun install          # dev types only — there are no runtime dependencies
bun run typecheck
bun test             # offline: every test runs against checked-in fixtures
```

## Commands

```bash
bun run src/cli.ts search -q ai-engineer -l bangalore --limit 15 --format table
bun run src/cli.ts search -q ai-engineer -l bangalore --has-salary --jobage 30
bun run src/cli.ts search -q machine-learning-engineer --remote --format table
bun run src/cli.ts detail 3534689-senior-agentic-ai-engineer
bun run src/cli.ts roles
bun run src/cli.ts --help
```

Full flag reference and portal caveats: `../SKILL.md`.
Endpoints, response shapes, parsing anchors and the verbatim robots.txt:
`../url-reference.md`.

## Layout

| Path | Role |
|---|---|
| `src/cli.ts` | Argument parsing, help text, command dispatch, error convention |
| `src/helpers.ts` | robots.txt guard, fetch + backoff, `__NEXT_DATA__` / JSON-LD extraction, salary parser, eligibility classifier |
| `src/types.ts` | Result types. The eligibility union deliberately has no `FAIL` member |
| `src/table.ts` | `table` / `plain` renderers, lakh/crore-aware money formatting |
| `src/commands/search.ts` | Browse-page search; `finalize()` is split out so filtering is testable offline |
| `src/commands/detail.ts` | Single-posting fetch and plain-text rendering |
| `tests/fixtures/` | Real responses captured 2026-08-25, trimmed. No test hits the network |

## Three things worth knowing before you edit

1. **`assertRobotsAllowed()` runs before every fetch.** `/search` and the
   disallowed query patterns raise `ROBOTS_DISALLOWED` rather than being requested.
   `tests/robots.test.ts` locks this down. Don't route around it.

2. **`redirect: "manual"` is load-bearing.** An unknown role or location slug 303s
   to the *unfiltered* role page, which returns 200 with real-looking listings for
   the wrong query. Following it silently is how a "Bengaluru" search fills up with
   San Francisco jobs. Both the fetcher and the parser check for this.

3. **`salary.period` is `null` on search results on purpose.** The browse card
   states an amount with no period; `₹10,000 – ₹20,000` on an intern posting is
   monthly. `detail` fills the period in from schema.org `unitText`. Do not default
   it to `"YEAR"`.
