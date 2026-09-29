#!/usr/bin/env bun
import { CLIError, writeError } from "./helpers.ts";
import { runSearch } from "./commands/search.ts";
import type { SearchArgs } from "./commands/search.ts";
import { runDetail } from "./commands/detail.ts";

const HELP = `wellfound-search — browse Wellfound (formerly AngelList Talent) job listings

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|id-slug|url> [--format json|plain]
  bun run src/cli.ts roles

SEARCH FLAGS
  -q, --query <role>     Role to browse. Wellfound has no free-text browse path
                         (/search is robots-disallowed), so this is slugified onto
                         one of its role slugs. Default: ai-engineer
                         Verified slugs: run \`roles\`.
  -l, --location <city>  City slug, e.g. "bangalore". "bengaluru" is aliased.
                         Mutually exclusive with --remote.
      --remote           Browse the remote board (/role/r/<slug>) instead.
      --page <n>         Page number, 1-indexed. 20 listings/page.
  -n, --limit <n>        Cap results emitted (client-side).
      --jobage <days>    Keep only postings <= N days old (client-side; dates are exact).
      --has-salary       Keep only postings that publish compensation.
      --format <fmt>     json (default) | table | plain

DETAIL FLAGS
      --format <fmt>     plain (default) | json

NOTES
  * Salary is a first-class field. Wellfound publishes real ranges on many cards;
    detail adds a machine-readable currency and period from schema.org.
  * Posting dates are EXACT (Unix epoch embedded in the page), not "7 days ago".
  * Remote roles are often gated to one country. eligibility.tagVerdict reports
    FLAG for a non-India geography tag and never FAIL — see
    .claude/skills/job-application-assistant/04-job-evaluation.md.
  * Only robots.txt-permitted browse paths are ever requested; /search and the
    disallowed query patterns are refused in code.

EXAMPLES
  bun run src/cli.ts search -q ai-engineer -l bangalore --limit 10 --format table
  bun run src/cli.ts search -q ai-engineer -l bangalore --has-salary --jobage 30 --format plain
  bun run src/cli.ts search -q machine-learning-engineer --remote --format table
  bun run src/cli.ts detail 3534689-senior-agentic-ai-engineer
`;

/** Role slugs verified to return results on wellfound.com/role/l/<slug>/bangalore. */
const VERIFIED_ROLES = [
  ["ai-engineer", "225 jobs in Bangalore (2026-08-25)"],
  ["data-engineer", "250"],
  ["software-engineer", "190"],
  ["backend-engineer", "164"],
  ["full-stack-engineer", "82"],
  ["devops-engineer", "43"],
  ["machine-learning-engineer", "33"],
  ["data-scientist", "12"],
  ["frontend-engineer", "linked by the site; not volume-checked for Bangalore"],
  ["product-manager", "linked by the site; not volume-checked for Bangalore"],
  ["data-analyst", "linked by the site; not volume-checked for Bangalore"],
  ["product-designer", "linked by the site; not volume-checked for Bangalore"],
];

function nextValue(argv: string[], i: number, flag: string): string {
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("-")) {
    throw new CLIError(`${flag} requires a value`, "BAD_ARGS");
  }
  return v;
}

function parseIntFlag(raw: string, flag: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new CLIError(`${flag} must be a non-negative integer (got "${raw}")`, "BAD_ARGS");
  }
  return n;
}

function parseFormat(raw: string, allowed: string[]): "json" | "table" | "plain" {
  if (!allowed.includes(raw)) {
    throw new CLIError(`--format must be one of ${allowed.join("|")} (got "${raw}")`, "BAD_ARGS");
  }
  return raw as "json" | "table" | "plain";
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (!argv.length || argv[0] === "--help" || argv[0] === "-h" || argv[0] === "help") {
    process.stdout.write(HELP);
    return 0;
  }

  const command = argv[0]!;

  if (command === "roles") {
    const lines = VERIFIED_ROLES.map(([slug, note]) => `  ${slug!.padEnd(28)} ${note}`);
    process.stdout.write(
      "Verified Wellfound role slugs (use with -q):\n" + lines.join("\n") + "\n"
    );
    return 0;
  }

  if (command === "search") {
    const args: SearchArgs = {
      query: "ai-engineer",
      location: null,
      remote: false,
      page: 1,
      limit: null,
      jobage: null,
      hasSalary: false,
      format: "json",
    };
    for (let i = 1; i < argv.length; i++) {
      const flag = argv[i]!;
      switch (flag) {
        case "-q":
        case "--query":
          args.query = nextValue(argv, i, flag);
          i++;
          break;
        case "-l":
        case "--location":
          args.location = nextValue(argv, i, flag);
          i++;
          break;
        case "--remote":
          args.remote = true;
          break;
        case "--page":
          args.page = Math.max(1, parseIntFlag(nextValue(argv, i, flag), flag));
          i++;
          break;
        case "-n":
        case "--limit":
          args.limit = parseIntFlag(nextValue(argv, i, flag), flag);
          i++;
          break;
        case "--jobage":
          args.jobage = parseIntFlag(nextValue(argv, i, flag), flag);
          i++;
          break;
        case "--has-salary":
          args.hasSalary = true;
          break;
        case "--format":
          args.format = parseFormat(nextValue(argv, i, flag), ["json", "table", "plain"]);
          i++;
          break;
        default:
          throw new CLIError(`unknown flag "${flag}" for search (see --help)`, "BAD_ARGS");
      }
    }
    process.stdout.write((await runSearch(args)) + "\n");
    return 0;
  }

  if (command === "detail") {
    const ref = argv[1];
    if (!ref || ref.startsWith("-")) {
      throw new CLIError("detail requires a job id, id-slug pair, or URL", "BAD_ARGS");
    }
    let format: "json" | "plain" | "table" = "plain";
    for (let i = 2; i < argv.length; i++) {
      const flag = argv[i]!;
      if (flag === "--format") {
        format = parseFormat(nextValue(argv, i, flag), ["json", "plain"]);
        i++;
      } else {
        throw new CLIError(`unknown flag "${flag}" for detail (see --help)`, "BAD_ARGS");
      }
    }
    process.stdout.write((await runDetail(ref, format)) + "\n");
    return 0;
  }

  throw new CLIError(`unknown command "${command}" (expected search, detail, or roles)`, "BAD_ARGS");
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    if (err instanceof CLIError) writeError(err.message, err.code);
    else writeError((err as Error)?.message ?? String(err), "UNEXPECTED_ERROR");
    process.exit(1);
  });
