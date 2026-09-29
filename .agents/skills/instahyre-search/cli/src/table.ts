// Posting-date tracking table for Instahyre.
//
// Why this file exists: Instahyre's `job_search` API exposes no posting date at
// all (see url-reference.md), so `/rank`'s posting-age urgency signal has
// nothing to work with. The date IS published on the job's HTML page, inside a
// schema.org `JobPosting` JSON-LD block (`datePosted`), which only a real
// browser can reach — the HTML is Cloudflare-challenged to plain HTTP clients.
//
// The browser pass is therefore a deliberate, opt-in second step over a
// shortlist, and this table is the durable handoff between the two: the API
// seeds rows in bulk (cheaply, dateless), the browser fills `posted_date` for
// the handful of rows worth verifying, and `verified_at` records when — so a
// stale verification is visible as stale rather than silently trusted.
//
// Format is a GitHub-flavoured Markdown table, not CSV. Two reasons, in order:
// (1) the repo already gitignores `**/job_scraper/*.md`, so the file lands
// ignored by an existing personal-data rule with no .gitignore change and no
// negation — a CSV at any path in this repo would need a new rule; (2) it
// renders when opened. The usual cost of Markdown ("painful to update
// programmatically") is paid here once, by this module: nothing hand-edits the
// file, `table upsert` rewrites it whole and keys on job id, so re-running
// enrichment updates rows instead of appending duplicates.
//
// Zero runtime dependencies — the parser and renderer are both in this file.

import { join } from "node:path"

/** Cell value meaning "not known". Written literally so columns stay aligned. */
export const NULL_CELL = "-"

export const TABLE_COLUMNS = [
  "id",
  "title",
  "company",
  "location",
  "url",
  "api_date",
  "posted_date",
  "verified_at",
  "source",
] as const

export type TableColumn = (typeof TABLE_COLUMNS)[number]

export interface TableRow {
  /** Instahyre numeric job id — the primary key. */
  id: string
  title: string | null
  company: string | null
  location: string | null
  url: string | null
  /** Posting date as reported by the API. Always null today; kept so a future
   *  API that starts exposing one is visibly different from a browser read. */
  api_date: string | null
  /** Posting date read off the job page's JSON-LD `datePosted`. ISO YYYY-MM-DD. */
  posted_date: string | null
  /** ISO date the browser pass last looked at this posting. */
  verified_at: string | null
  /** How `posted_date` was obtained, e.g. `jsonld`. */
  source: string | null
}

/**
 * Default table location: `job_scraper/instahyre_posting_dates.md` inside the
 * skill directory. Already covered by the repo's `**\/job_scraper/*.md` ignore
 * rule (personal job-search data), so it is never committed.
 */
export function defaultTablePath(skillDir: string): string {
  return join(skillDir, "job_scraper", "instahyre_posting_dates.md")
}

const HEADER_LINE = `| ${TABLE_COLUMNS.join(" | ")} |`
const DIVIDER_LINE = `|${TABLE_COLUMNS.map(() => " --- ").join("|")}|`

export const TABLE_PREAMBLE = [
  "# Instahyre posting dates",
  "",
  "Tracked by `instahyre-search`. **Do not hand-edit** — the CLI rewrites this file",
  "whole on every `table upsert`, keyed on `id`.",
  "",
  "- `api_date` — what the `job_search` API reported. Always `-`: the API has no date field.",
  "- `posted_date` — `datePosted` from the job page's schema.org JSON-LD, read with a real browser.",
  "- `verified_at` — when that browser read happened. An old value means the row is stale, not wrong.",
  "",
].join("\n")

/** Markdown cells are pipe-delimited and single-line; neutralise both. */
export function escapeCell(value: string | null): string {
  if (value === null) return NULL_CELL
  const flat = value.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim()
  return flat === "" ? NULL_CELL : flat
}

export function unescapeCell(value: string): string | null {
  const raw = value.trim().replace(/\\\|/g, "|")
  return raw === "" || raw === NULL_CELL ? null : raw
}

/**
 * Split one Markdown table line into cells, honouring `\|` escapes. A plain
 * `split("|")` would tear a title containing a pipe into two columns.
 */
export function splitRow(line: string): string[] {
  const cells: string[] = []
  let current = ""
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === "\\" && line[i + 1] === "|") {
      current += "\\|"
      i++
    } else if (ch === "|") {
      cells.push(current)
      current = ""
    } else {
      current += ch
    }
  }
  cells.push(current)
  // A well-formed row is `| a | b |`, so the first and last splits are empty.
  if (cells.length >= 2 && cells[0].trim() === "" && cells[cells.length - 1].trim() === "") {
    return cells.slice(1, -1)
  }
  return cells
}

function isDividerLine(line: string): boolean {
  return /^\s*\|[\s:|-]+\|\s*$/.test(line) && line.includes("-")
}

/**
 * Parse a table file back into rows. Tolerant by design: anything that is not a
 * data row (prose, the header, the divider, a short/garbled row) is skipped
 * rather than throwing, so a partially corrupted file still yields its good
 * rows instead of losing the lot.
 */
export function parseTable(markdown: string): TableRow[] {
  const rows: TableRow[] = []
  let headerSeen = false
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.trim().startsWith("|")) continue
    if (isDividerLine(line)) continue
    const cells = splitRow(line.trim())
    if (cells.length < TABLE_COLUMNS.length) continue
    if (!headerSeen && cells[0].trim() === "id" && cells[1].trim() === "title") {
      headerSeen = true
      continue
    }
    const id = unescapeCell(cells[0])
    if (!id) continue
    rows.push({
      id,
      title: unescapeCell(cells[1]),
      company: unescapeCell(cells[2]),
      location: unescapeCell(cells[3]),
      url: unescapeCell(cells[4]),
      api_date: unescapeCell(cells[5]),
      posted_date: unescapeCell(cells[6]),
      verified_at: unescapeCell(cells[7]),
      source: unescapeCell(cells[8]),
    })
  }
  return rows
}

/** Render rows back to the full file body (preamble + table). */
export function renderTable(rows: TableRow[]): string {
  const sorted = [...rows].sort((a, b) => Number(a.id) - Number(b.id) || a.id.localeCompare(b.id))
  const body = sorted.map(
    (r) => `| ${TABLE_COLUMNS.map((c) => escapeCell(r[c])).join(" | ")} |`,
  )
  return [TABLE_PREAMBLE, HEADER_LINE, DIVIDER_LINE, ...body, ""].join("\n")
}

export interface UpsertResult {
  rows: TableRow[]
  added: number
  updated: number
  unchanged: number
}

/**
 * Merge incoming rows into existing ones, keyed on `id`.
 *
 * Field-level merge, not row replacement: an incoming row that only carries a
 * date must not blank out the title the API seeded, and an API re-seed must not
 * blank out a `posted_date` the browser already verified. So a null incoming
 * field leaves the stored value alone; only a non-null incoming value writes.
 * That is what makes re-running either pass idempotent.
 */
export function upsertRows(existing: TableRow[], incoming: TableRow[]): UpsertResult {
  const byId = new Map<string, TableRow>()
  for (const row of existing) byId.set(row.id, { ...row })

  let added = 0
  let updated = 0
  let unchanged = 0

  for (const next of incoming) {
    const prev = byId.get(next.id)
    if (!prev) {
      byId.set(next.id, { ...next })
      added++
      continue
    }
    const merged: TableRow = { ...prev }
    let changed = false
    for (const col of TABLE_COLUMNS) {
      if (col === "id") continue
      const value = next[col]
      if (value === null || value === undefined) continue
      if (merged[col] !== value) {
        merged[col] = value
        changed = true
      }
    }
    byId.set(next.id, merged)
    if (changed) updated++
    else unchanged++
  }

  return { rows: [...byId.values()], added, updated, unchanged }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number | null {
  if (!isIsoDate(from) || !isIsoDate(to)) return null
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

/**
 * A row needs (re-)verification when it has never been verified, or when its
 * last verification is older than `staleDays`. Rows already carrying a
 * `posted_date` verified recently are skipped — that is the whole point of the
 * table: the browser pass never re-visits what it already knows.
 */
export function needsVerification(row: TableRow, today: string, staleDays: number): boolean {
  if (!row.posted_date || !row.verified_at) return true
  const age = daysBetween(row.verified_at, today)
  return age === null || age >= staleDays
}

/**
 * Coerce arbitrary JSON — a bare array of rows, or the `{meta, results}`
 * envelope that `search --format json` emits — into TableRows.
 *
 * This is what lets the two passes share one input format: piping a search
 * straight in seeds the table, and posting `[{"id":"1","posted_date":"..."}]`
 * from the browser fills the dates.
 */
export function coerceRows(input: unknown, today: string): { rows: TableRow[]; errors: string[] } {
  const errors: string[] = []
  const list = Array.isArray(input)
    ? input
    : input && typeof input === "object" && Array.isArray((input as { results?: unknown }).results)
      ? ((input as { results: unknown[] }).results as unknown[])
      : null

  if (!list) {
    return { rows: [], errors: ["expected a JSON array of rows, or a {results: [...]} envelope"] }
  }

  const str = (v: unknown): string | null => {
    if (typeof v === "string") return v.trim() || null
    if (typeof v === "number" && Number.isFinite(v)) return String(v)
    return null
  }

  const rows: TableRow[] = []
  for (const [i, item] of list.entries()) {
    if (!item || typeof item !== "object") {
      errors.push(`row ${i}: not an object`)
      continue
    }
    const o = item as Record<string, unknown>
    const id = str(o.id)
    if (!id) {
      errors.push(`row ${i}: missing id`)
      continue
    }

    // Accept both the table's own snake_case and the search result's camelCase.
    const posted = str(o.posted_date) ?? str(o.postedDate) ?? str(o.datePosted)
    if (posted !== null && !isIsoDate(posted)) {
      errors.push(`row ${i} (id ${id}): posted_date "${posted}" is not YYYY-MM-DD — dropped`)
    }
    const postedOk = posted !== null && isIsoDate(posted) ? posted : null

    const verified = str(o.verified_at) ?? str(o.verifiedAt)
    if (verified !== null && !isIsoDate(verified)) {
      errors.push(`row ${i} (id ${id}): verified_at "${verified}" is not YYYY-MM-DD — dropped`)
    }
    // A date with no explicit verification stamp is stamped now: the caller
    // just read it. Never stamp a row that carries no date — that would claim
    // a verification that did not happen.
    const verifiedOk =
      verified !== null && isIsoDate(verified) ? verified : postedOk ? today : null

    rows.push({
      id,
      title: str(o.title),
      company: str(o.company),
      location: str(o.location),
      url: str(o.url),
      api_date: str(o.api_date) ?? str(o.date),
      posted_date: postedOk,
      verified_at: verifiedOk,
      source: str(o.source) ?? (postedOk ? "jsonld" : null),
    })
  }
  return { rows, errors }
}
