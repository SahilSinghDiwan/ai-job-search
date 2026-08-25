// `table` command: the durable side of the posting-date enrichment workflow.
//
// Bulk discovery stays on the API (35 results per request, instant). Date
// enrichment is a deliberate second pass over a shortlist, driven by a real
// browser outside this CLI (the HTML is Cloudflare-challenged, so no HTTP
// client here can do it, and this CLI must never try). This command is the
// join between the two halves:
//
//   search --format json  ->  table upsert   (seed rows, dateless)
//   table pending         ->  the browser worklist
//   browser JSON-LD read  ->  table upsert   (fill posted_date + verified_at)
//
// No network access at all lives in this file.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { dirname } from "node:path"
import {
  coerceRows,
  daysBetween,
  needsVerification,
  parseTable,
  renderTable,
  todayIso,
  upsertRows,
  type TableRow,
} from "../table.js"
import { writeError, writeWarning } from "../helpers.js"

export interface TableOpts {
  sub: string
  path: string
  json?: string
  limit?: number
  staleDays: number
  format: "json" | "table" | "plain"
  today: string
}

export function readTableFile(path: string): TableRow[] {
  if (!existsSync(path)) return []
  return parseTable(readFileSync(path, "utf8"))
}

export function writeTableFile(path: string, rows: TableRow[]): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, renderTable(rows), "utf8")
}

/** `-` reads stdin, `@file` reads a file, anything else is a literal JSON string. */
function resolveJsonInput(raw: string): string {
  if (raw === "-") return readFileSync(0, "utf8")
  if (raw.startsWith("@")) return readFileSync(raw.slice(1), "utf8")
  return raw
}

function renderRowsTable(rows: TableRow[], today: string): string {
  if (rows.length === 0) return "No rows."
  const header =
    "ID".padEnd(9) +
    " " +
    "POSTED".padEnd(11) +
    " " +
    "AGE".padEnd(6) +
    " " +
    "VERIFIED".padEnd(11) +
    " " +
    "TITLE".padEnd(40) +
    " COMPANY"
  const body = rows.map((r) => {
    const age = r.posted_date ? daysBetween(r.posted_date, today) : null
    return (
      r.id.padEnd(9) +
      " " +
      (r.posted_date ?? "—").padEnd(11) +
      " " +
      (age === null ? "—" : `${age}d`).padEnd(6) +
      " " +
      (r.verified_at ?? "—").padEnd(11) +
      " " +
      (r.title ?? "—").slice(0, 40).padEnd(40) +
      " " +
      (r.company ?? "—")
    )
  })
  return [header, "-".repeat(header.length), ...body].join("\n")
}

export function runTable(opts: TableOpts): number {
  const { sub, path, today } = opts

  if (sub === "upsert") {
    if (!opts.json) {
      writeError("table upsert requires --json <json|-|@file>", "NO_INPUT")
      return 1
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(resolveJsonInput(opts.json))
    } catch (e) {
      writeError(
        `--json could not be read as JSON (${e instanceof Error ? e.message : String(e)})`,
        "BAD_JSON",
      )
      return 1
    }
    const { rows: incoming, errors } = coerceRows(parsed, today)
    for (const err of errors) writeWarning(err)
    if (incoming.length === 0) {
      writeError("no usable rows in the input", "NO_ROWS")
      return 1
    }
    const result = upsertRows(readTableFile(path), incoming)
    writeTableFile(path, result.rows)
    process.stdout.write(
      JSON.stringify(
        {
          path,
          added: result.added,
          updated: result.updated,
          unchanged: result.unchanged,
          total: result.rows.length,
          warnings: errors.length,
        },
        null,
        2,
      ) + "\n",
    )
    return 0
  }

  if (sub === "list" || sub === "pending") {
    let rows = readTableFile(path)
    if (sub === "pending") {
      rows = rows.filter((r) => needsVerification(r, today, opts.staleDays))
    }
    rows.sort((a, b) => {
      // Newest known posting first for `list`; unverified rows first for `pending`.
      const av = a.posted_date ?? ""
      const bv = b.posted_date ?? ""
      return sub === "pending" ? av.localeCompare(bv) : bv.localeCompare(av)
    })
    if (opts.limit !== undefined && opts.limit >= 0) rows = rows.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderRowsTable(rows, today) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        (rows.length === 0 ? "No rows." : rows.map((r) => r.url ?? r.id).join("\n")) + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          {
            meta: {
              path,
              count: rows.length,
              today,
              staleDays: opts.staleDays,
              mode: sub,
            },
            rows: rows.map((r) => ({
              ...r,
              age_days: r.posted_date ? daysBetween(r.posted_date, today) : null,
            })),
          },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  }

  writeError(`Unknown table subcommand "${sub}" — expected upsert | list | pending`, "BAD_SUBCMD")
  return 1
}

export { todayIso }
