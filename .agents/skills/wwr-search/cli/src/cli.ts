#!/usr/bin/env bun
// Self-contained CLI for searching We Work Remotely, a global remote-only job
// board. Zero runtime dependencies — it runs anywhere `bun` is available.
//
// robots.txt is fully open (re-verified 2026-08-25; see url-reference.md), so
// this is ordinary polite HTTP scraping of public pages for one person's job
// search: a handful of requests, no bulk enumeration, no parallel hammering.
//
// The point of this CLI is the eligibility classifier. WWR is a global board
// where most listings are gated to a region the candidate does not live in, and
// a board's own location filter is not trustworthy evidence of that. So every
// listing's stated geographic scope is re-parsed and classified, gated-elsewhere
// listings are dropped by default, and the count of what was dropped and why is
// reported instead of being swallowed.

import { runSearch, PAGE_SIZE, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { writeError, writeWarning } from "./helpers.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

const BOOLEAN_FLAGS = new Set(["include-gated", "eligible-only", "help", "h"])

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit", c: "country" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      if (BOOLEAN_FLAGS.has(key)) {
        flags[key] = true
        continue
      }
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        // --country may repeat: --country IN --country SG
        const prev = flags[key]
        if (key === "country") {
          flags[key] = Array.isArray(prev) ? [...prev, next] : prev ? [prev as string, next] : [next]
        } else {
          flags[key] = next
        }
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `wwr-cli — search We Work Remotely, with per-listing India-eligibility classification

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <slug|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>     Keywords, e.g. "AI engineer", "LLM", "machine learning".
  --location, -l <text>  Client-side filter over the stated scope + company HQ.
                         WWR has no server-side location parameter.
  --country, -c <ISO>    WWR's own country[] filter (repeatable), e.g. -c IN.
                         Never trusted on its own — every listing is still
                         re-classified from its own stated scope.
  --salary <range>       WWR's salary_range[] facet, e.g. "$100,000 or more USD".
  --jobage <days>        Client-side max posting age. WWR has no recency param.
  --include-gated        Also show listings gated to regions that exclude India.
  --eligible-only        Also drop listings that state no scope at all.
  --page <n>             1-indexed page (${PAGE_SIZE}/page, client-side — WWR returns
                         the whole result set on one page).
  --limit, -n <n>        Cap results emitted.
  --format <fmt>         json (default) | table | plain.

ELIGIBILITY CLASSES (in every result, and summarised in meta)
  india-eligible   India is inside the listing's own stated scope        -> gate PASS
  worldwide        "Anywhere in the World"                               -> gate PASS
  gated-elsewhere  a scope is stated and India is not in it              -> gate FAIL or FLAG
  unknown          the listing states no scope — never guessed either way -> gate FLAG

EXAMPLES
  bun run src/cli.ts search -q "AI engineer" --format table
  bun run src/cli.ts search -q "LLM" --jobage 14 --format table
  bun run src/cli.ts search -q "machine learning" --include-gated --format table
  bun run src/cli.ts search -q "RAG" -c IN --format json
  bun run src/cli.ts detail a-team-senior-independent-ai-engineer-architect --format plain

Public pages, open robots.txt. Keep volume low and human-paced. If WWR ever
serves a bot challenge, this CLI stops and reports it rather than working around it.
`

function parseIntFlag(name: string, raw: string | boolean | string[]): number | null {
  const val = parseInt(raw as string, 10)
  if (isNaN(val)) {
    writeError(`--${name} must be a number, got "${String(raw)}"`, "BAD_ARG")
    return null
  }
  return val
}

async function main(): Promise<number> {
  const flags = parseFlags(process.argv.slice(2))
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  if (cmd === "search") {
    const fmt = (flags.format as string) || "json"
    if (!["json", "table", "plain"].includes(fmt)) {
      writeError(`--format must be json, table or plain (got "${fmt}")`, "BAD_ARG")
      return 1
    }

    for (const name of ["jobage", "page", "limit"] as const) {
      if (flags[name] !== undefined) {
        const v = parseIntFlag(name, flags[name])
        if (v === null) return 1
        flags[name] = String(v)
      }
    }

    const countryRaw = flags.country
    const countries = (Array.isArray(countryRaw) ? countryRaw : typeof countryRaw === "string" ? [countryRaw] : [])
      .flatMap((c) => c.split(","))
      .map((c) => c.trim())
      .filter(Boolean)
    for (const c of countries) {
      if (!/^[A-Za-z]{2}$/.test(c)) {
        writeError(`--country expects ISO 3166-1 alpha-2 codes (e.g. IN, SG), got "${c}"`, "BAD_ARG")
        return 1
      }
    }
    if (countries.length) {
      writeWarning(
        "WWR's country[] filter is applied server-side but never trusted: every listing is still classified from its own stated scope, and disagreements show up as gated-elsewhere in the output.",
      )
    }

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      location: typeof flags.location === "string" ? flags.location : undefined,
      countries,
      salaryRange: typeof flags.salary === "string" ? flags.salary : undefined,
      jobage: flags.jobage ? parseInt(flags.jobage as string, 10) : undefined,
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      includeGated: flags["include-gated"] === true,
      eligibleOnly: flags["eligible-only"] === true,
      format: fmt as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      writeError("detail requires a <slug|url>", "NO_ID")
      return 1
    }
    const fmt = (flags.format as string) || "json"
    if (!["json", "plain"].includes(fmt)) {
      writeError(`--format must be json or plain (got "${fmt}")`, "BAD_ARG")
      return 1
    }
    const opts: DetailOpts = { id, format: fmt as DetailOpts["format"] }
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
