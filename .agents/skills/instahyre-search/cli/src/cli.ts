#!/usr/bin/env bun
// Self-contained CLI for searching Instahyre's public `job_search` JSON API
// (India tech/startup roles). No external CLI framework, so it runs anywhere
// `bun` is available with zero install beyond the repo clone.
//
// API-only by design: Instahyre's HTML pages sit behind a Cloudflare
// interstitial and this CLI never touches them. Personal use only — keep volume
// low; the API rate-limits with 429 and the client backs off rather than
// pushing through.

import { join } from "node:path"
import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { runTable, type TableOpts } from "./commands/table.js"
import { defaultTablePath, todayIso } from "./table.js"
import { writeError, writeWarning } from "./helpers.js"

/** The skill directory (this file lives at <skill>/cli/src/cli.ts). */
const SKILL_DIR = join(import.meta.dir, "..", "..")

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
      // A bare "-" is a value (stdin), not the start of another flag.
      if (next === undefined || (next.startsWith("-") && next !== "-")) {
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
  bun run src/cli.ts table upsert --json <json|-|@file> [--table <path>]
  bun run src/cli.ts table pending [--limit N] [--stale-days N] [--format ...]
  bun run src/cli.ts table list [--limit N] [--format json|table|plain]

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
                          Real posting dates come from the opt-in browser
                          enrichment pass instead — see 'table' below.

TABLE (posting-date enrichment — opt-in, shortlist-sized)
  Instahyre publishes each posting's date only on its HTML page, in a schema.org
  JobPosting JSON-LD block ("datePosted"). That page is Cloudflare-challenged to
  HTTP clients, so a real browser (ego-browser) reads it — never this CLI. The
  'table' command is the durable store both passes share:

    search --format json | bun run src/cli.ts table upsert --json -   # seed
    bun run src/cli.ts table pending --limit 5 --format json          # worklist
    bun run src/cli.ts table upsert --json '[{"id":"438746","posted_date":"2026-08-14"}]'

  --table <path>          Override the table file (default:
                          <skill>/job_scraper/instahyre_posting_dates.md).
  --stale-days <n>        'pending' re-lists a row verified this long ago or
                          longer. Default 21.
  --limit, -n <n>         Cap rows emitted.

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
            `so results are NOT filtered by recency. Enrich a shortlist with ` +
            `\`table\` + a browser pass to get real dates. See the skill's SKILL.md.`,
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

  if (cmd === "table") {
    const sub = (flags._ as string[])[1] ?? ""
    const fmt = (flags.format as string) || "json"
    const opts: TableOpts = {
      sub,
      path:
        typeof flags.table === "string" ? (flags.table as string) : defaultTablePath(SKILL_DIR),
      json: typeof flags.json === "string" ? (flags.json as string) : undefined,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      staleDays:
        typeof flags["stale-days"] === "string"
          ? Math.max(0, parseInt(flags["stale-days"] as string, 10) || 21)
          : 21,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as TableOpts["format"],
      today: typeof flags.today === "string" ? (flags.today as string) : todayIso(),
    }
    if (opts.limit !== undefined && isNaN(opts.limit)) {
      writeError(`--limit must be a number`, "BAD_ARG")
      return 1
    }
    return runTable(opts)
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
