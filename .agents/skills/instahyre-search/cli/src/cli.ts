#!/usr/bin/env bun
// Self-contained CLI for searching Instahyre's public `job_search` JSON API
// (India tech/startup roles). No external CLI framework, so it runs anywhere
// `bun` is available with zero install beyond the repo clone.
//
// API-only by design: Instahyre's HTML pages sit behind a Cloudflare
// interstitial and this CLI never touches them. Personal use only — keep volume
// low; the API rate-limits with 429 and the client backs off rather than
// pushing through.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { writeError, writeWarning } from "./helpers.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = {
    q: "query",
    l: "location",
    n: "limit",
    f: "function",
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `instahyre-cli — search jobs on Instahyre (India tech/startup roles)

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords (skill or title), e.g. "LLM", "RAG", "Python".
                          Maps to the API's free-text 'skills' parameter.
  --location, -l <text>   City filter, e.g. "Bangalore", "Remote". Applied
                          CLIENT-SIDE to the fetched page (the API has no
                          location parameter) — see SKILL.md.
  --function, -f <name>   Job-function facet: machine-learning | data-science |
                          backend | full-stack | other-software, or a numeric id.
  --job-type <n>          1 = full-time (default), 2 = internship.
  --page <n>              1-indexed page (35 results/page). Default 1.
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.

NOT SUPPORTED BY THIS PORTAL
  --jobage / --since      Instahyre's API exposes no posting date and no recency
                          filter. These flags are accepted but cannot filter;
                          the CLI warns and reports "recencyFilter":"unsupported".

EXAMPLES
  bun run src/cli.ts search -q "LLM" -f machine-learning -l Bangalore --limit 10 --format table
  bun run src/cli.ts search -q "RAG" -l Bangalore --format json
  bun run src/cli.ts search -q "Generative AI" -l Remote --format table
  bun run src/cli.ts detail 437616 --format plain

Personal use only — keep volume low.
`

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  if (cmd === "search") {
    const fmt = (flags.format as string) || "json"

    // Recency flags are accepted for interface compatibility with the other
    // portal skills, but the portal cannot honor them. Warn loudly rather than
    // filtering silently or pretending to filter.
    for (const name of ["jobage", "since"]) {
      if (flags[name] !== undefined) {
        writeWarning(
          `--${name} is not supported by Instahyre: the API exposes no posting date, ` +
            `so results are NOT filtered by recency. See the skill's SKILL.md.`,
        )
      }
    }

    const parseIntFlag = (name: string, raw: string | boolean | string[]): number | null => {
      const val = parseInt(raw as string, 10)
      if (isNaN(val)) {
        writeError(`--${name} must be a number, got "${raw}"`, "BAD_ARG")
        return null
      }
      return val
    }

    if (flags.page !== undefined) {
      const v = parseIntFlag("page", flags.page)
      if (v === null) return 1
      flags.page = String(v)
    }
    if (flags.limit !== undefined) {
      const v = parseIntFlag("limit", flags.limit)
      if (v === null) return 1
      flags.limit = String(v)
    }
    if (flags["job-type"] !== undefined) {
      const v = parseIntFlag("job-type", flags["job-type"])
      if (v === null) return 1
      flags["job-type"] = String(v)
    }

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      location: typeof flags.location === "string" ? flags.location : undefined,
      jobFunction: typeof flags.function === "string" ? flags.function : undefined,
      jobType: typeof flags["job-type"] === "string" ? (flags["job-type"] as string) : "1",
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      writeError("detail requires an <id|url>", "NO_ID")
      return 1
    }
    const fmt = (flags.format as string) || "json"
    const opts: DetailOpts = {
      id,
      format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"],
    }
    return runDetail(opts)
  }

  writeError(`Unknown command "${cmd}"`, "BAD_CMD")
  return 1
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    writeError(e instanceof Error ? e.message : String(e), "INTERNAL_ERROR")
    process.exit(1)
  })
