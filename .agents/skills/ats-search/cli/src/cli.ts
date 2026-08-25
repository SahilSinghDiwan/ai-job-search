#!/usr/bin/env bun
// Self-contained CLI over three unauthenticated ATS job-board APIs —
// Greenhouse, Ashby, and Lever. No CLI framework, no runtime dependencies: it
// runs anywhere `bun` is available with nothing but the repo clone.
//
// This is a LOOKUP tool, not a crawler. None of the three providers offers a
// way to enumerate company slugs, so the search surface is the company list at
// <skill>/companies.txt. Adding companies is how you widen it.
//
// Host policy in one line: api.lever.co is open (Crawl-delay: 1, honored);
// jobs.lever.co names ClaudeBot in a Disallow and is NEVER fetched. See
// url-reference.md.

import { join } from "node:path"
import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { runCheck, type CheckOpts } from "./commands/check.js"
import { DEFAULT_DELAY_MS, isProvider, todayIso, writeError } from "./helpers.js"

/** This file lives at <skill>/cli/src/cli.ts. */
const SKILL_DIR = join(import.meta.dir, "..", "..")
const DEFAULT_COMPANIES = join(SKILL_DIR, "companies.txt")

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
    c: "company",
    p: "provider",
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string
    if (a.startsWith("-")) {
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

const HELP = `ats-search — open jobs straight from companies' own ATS boards
              (Greenhouse · Ashby · Lever)

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <provider:slug:jobId | job URL> [--format json|plain]
  bun run src/cli.ts check [<provider> <slug>] [--format json|table]
  bun run src/cli.ts companies [--format json|table]

HOW IT FINDS COMPANIES
  No ATS provider lets you enumerate board slugs, so this is a lookup over a
  list you maintain: <skill>/companies.txt (one "<provider>  <slug>  # note"
  per line). 'search' only sees companies listed there — add more to widen it.

SEARCH FLAGS
  --query, -q <text>     Keyword, matched client-side over title, department and
                         location (and description with --content).
  --location, -l <text>  Location substring. "Bangalore"/"Bengaluru" and
                         "Gurgaon"/"Gurugram" are treated as equivalent.
  --remote               Only postings the ATS itself marks remote-eligible
                         (Ashby isRemote/workplaceType, Greenhouse "Location
                         Type" metadata, Lever workplaceType).
  --jobage <days>        Max posting age. These are REAL employer dates, so this
                         filter is trustworthy. Undated postings are excluded.
  --since <YYYY-MM-DD>   Posted on or after this date.
  --provider, -p <name>  Restrict to greenhouse | ashby | lever.
  --company, -c <slugs>  Comma-separated slugs to restrict to (e.g. "anthropic,sarvam").
  --content              Also fetch/keep descriptions so --query searches the
                         full posting text. Much slower and much larger.
  --page <n>             1-indexed window over the pooled, date-sorted results.
  --limit, -n <n>        Window size. Default 50.
  --delay <ms>           Pause between company requests. Default ${DEFAULT_DELAY_MS}ms
                         (clears api.lever.co's Crawl-delay: 1 for every host).
  --companies <path>     Use a different company list.
  --format <fmt>         json (default) | table | plain.
  --today <YYYY-MM-DD>   Override "today" for age maths (testing).

EXAMPLES
  # Everything AI-ish posted in the last 3 weeks, across the whole list
  bun run src/cli.ts search -q "AI" --jobage 21 --format table

  # Bengaluru engineering roles
  bun run src/cli.ts search -q engineer -l Bengaluru --format table

  # Remote-eligible LLM roles, newest first
  bun run src/cli.ts search -q "LLM" --remote --limit 20 --format table

  # One company only
  bun run src/cli.ts search -c sarvam --format table

  # Full text of one posting
  bun run src/cli.ts detail greenhouse:anthropic:4461450008 --format plain

  # Verify a slug before adding it to companies.txt
  bun run src/cli.ts check ashby elevenlabs

  # Re-verify the whole list
  bun run src/cli.ts check --format table

Reads public, unauthenticated ATS APIs only. Personal use — keep volume low.
`

function intFlag(flags: Flags, name: string): number | null | undefined {
  const raw = flags[name]
  if (raw === undefined) return undefined
  const v = parseInt(raw as string, 10)
  if (isNaN(v)) {
    writeError(`--${name} must be a number, got "${String(raw)}"`, "BAD_ARG")
    return null
  }
  return v
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  const fmtRaw = (flags.format as string) || "json"
  const companiesPath =
    typeof flags.companies === "string" ? flags.companies : DEFAULT_COMPANIES
  const delayFlag = intFlag(flags, "delay")
  if (delayFlag === null) return 1

  if (cmd === "search") {
    const page = intFlag(flags, "page")
    if (page === null) return 1
    const limit = intFlag(flags, "limit")
    if (limit === null) return 1
    const jobage = intFlag(flags, "jobage")
    if (jobage === null) return 1

    if (typeof flags.provider === "string" && !isProvider(flags.provider.toLowerCase())) {
      writeError(
        `--provider must be greenhouse, ashby or lever (got "${flags.provider}")`,
        "BAD_ARG",
      )
      return 1
    }
    if (typeof flags.since === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(flags.since)) {
      writeError(`--since must be YYYY-MM-DD (got "${flags.since}")`, "BAD_ARG")
      return 1
    }

    const opts: SearchOpts = {
      companiesPath,
      query: typeof flags.query === "string" ? flags.query : undefined,
      location: typeof flags.location === "string" ? flags.location : undefined,
      remoteOnly: flags.remote === true,
      jobage: jobage === undefined ? undefined : Math.max(0, jobage),
      since: typeof flags.since === "string" ? flags.since : undefined,
      provider: typeof flags.provider === "string" ? flags.provider.toLowerCase() : undefined,
      only:
        typeof flags.company === "string"
          ? flags.company.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined,
      content: flags.content === true,
      page: page === undefined ? 1 : Math.max(1, page),
      limit: limit === undefined ? 50 : Math.max(1, limit),
      delayMs: delayFlag === undefined ? DEFAULT_DELAY_MS : Math.max(0, delayFlag),
      format: (["json", "table", "plain"].includes(fmtRaw) ? fmtRaw : "json") as SearchOpts["format"],
      today: typeof flags.today === "string" ? flags.today : todayIso(),
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      writeError("detail requires a <provider:slug:jobId> or a job URL", "NO_ID")
      return 1
    }
    const opts: DetailOpts = { id, format: fmtRaw === "plain" ? "plain" : "json" }
    return runDetail(opts)
  }

  if (cmd === "check") {
    const rest = (flags._ as string[]).slice(1)
    let provider: CheckOpts["provider"]
    let slug: string | undefined
    if (rest.length >= 2) {
      const p = (rest[0] as string).toLowerCase()
      if (!isProvider(p)) {
        writeError(`unknown provider "${rest[0]}" (expected greenhouse|ashby|lever)`, "BAD_ARG")
        return 1
      }
      provider = p
      slug = rest[1]
    } else if (rest.length === 1) {
      writeError(`check takes "<provider> <slug>" or no arguments at all`, "BAD_ARG")
      return 1
    }
    const opts: CheckOpts = {
      companiesPath,
      provider,
      slug,
      all: !slug,
      delayMs: delayFlag === undefined ? DEFAULT_DELAY_MS : Math.max(0, delayFlag),
      format: (fmtRaw === "json" ? "json" : "table") as CheckOpts["format"],
    }
    return runCheck(opts)
  }

  if (cmd === "companies") {
    // Offline: prints the list as parsed, so a format mistake is visible
    // without spending a single HTTP request.
    const { loadCompanies } = await import("./companies.js")
    try {
      const parsed = loadCompanies(companiesPath)
      for (const p of parsed.problems) writeError(p, "COMPANY_LIST_PROBLEM")
      if (fmtRaw === "json") {
        process.stdout.write(
          JSON.stringify(
            { meta: { count: parsed.companies.length, path: companiesPath }, results: parsed.companies },
            null,
            2,
          ) + "\n",
        )
      } else {
        const lines = parsed.companies.map(
          (c) => `${c.provider.padEnd(11)} ${c.slug.padEnd(34)} ${c.note ?? ""}`.trimEnd(),
        )
        lines.push(`-- ${parsed.companies.length} companies (${companiesPath})`)
        process.stdout.write(lines.join("\n") + "\n")
      }
      return parsed.problems.length ? 1 : 0
    } catch (e) {
      writeError(e instanceof Error ? e.message : String(e), "COMPANY_LIST_FAILED")
      return 1
    }
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
