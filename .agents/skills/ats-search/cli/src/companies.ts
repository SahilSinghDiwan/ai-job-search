// The company list — the thing that makes this skill work at all.
//
// No ATS provider exposes an endpoint that enumerates board slugs. There is no
// directory, no search, no sitemap of tenants. So `search` cannot discover
// companies; it can only look up companies it was told about. That list is a
// plain text file the user maintains, and this module reads it.
//
// FORMAT — whitespace-delimited, one company per line:
//
//     greenhouse  anthropic   # optional trailing note
//     ashby       sarvam
//     lever       cred
//
// Why this format and not JSON/CSV/TSV:
//   * It is hand-maintained, so it needs comments. JSON has none, and a
//     trailing comma silently breaks the whole file.
//   * Splitting on RUNS of whitespace means tabs and spaces both work — a
//     strict TSV breaks invisibly the moment an editor expands a tab.
//   * One line per company gives clean, reviewable git diffs when the user
//     adds or retires a board.
//
// Location: `<skill>/companies.txt`, tracked in git. It is a curated seed list
// of public employers, not personal job-search data, so it does not belong
// under the repo's ignored `job_scraper/` paths — and nothing here weakens
// .gitignore (`tools/security_guards.py` would fail the build if it did). A
// user who wants a private list keeps it outside the repo and passes
// `--companies <path>`.

import { readFileSync } from "node:fs"
import { isProvider, type Provider } from "./helpers.js"

export interface Company {
  provider: Provider
  slug: string
  note: string | null
  /** 1-indexed line number in the source file, for error messages. */
  line: number
}

export interface ParsedList {
  companies: Company[]
  /** Lines that could not be parsed, reported rather than silently dropped. */
  problems: string[]
}

export function parseCompanies(text: string): ParsedList {
  const companies: Company[] = []
  const problems: string[] = []
  const seen = new Set<string>()

  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] ?? ""
    const withoutComment = rawLine.split("#")[0] ?? ""
    const trimmed = withoutComment.trim()
    if (!trimmed) continue

    const parts = trimmed.split(/\s+/)
    const provider = (parts[0] ?? "").toLowerCase()
    const slug = parts[1] ?? ""

    if (!isProvider(provider)) {
      problems.push(`line ${i + 1}: unknown provider "${parts[0]}" (expected greenhouse|ashby|lever)`)
      continue
    }
    if (!slug) {
      problems.push(`line ${i + 1}: provider "${provider}" has no slug`)
      continue
    }
    if (parts.length > 2) {
      problems.push(
        `line ${i + 1}: unexpected extra field "${parts[2]}" — put notes after a "#" comment`,
      )
      continue
    }

    const key = `${provider}:${slug.toLowerCase()}`
    if (seen.has(key)) {
      problems.push(`line ${i + 1}: duplicate entry ${key} — ignored`)
      continue
    }
    seen.add(key)

    const hash = rawLine.indexOf("#")
    const note = hash >= 0 ? rawLine.slice(hash + 1).trim() || null : null
    companies.push({ provider, slug, note, line: i + 1 })
  }

  return { companies, problems }
}

export function loadCompanies(path: string): ParsedList {
  let text: string
  try {
    text = readFileSync(path, "utf8")
  } catch (e) {
    throw new Error(
      `could not read the company list at ${path} ` +
        `(${e instanceof Error ? e.message : String(e)}). ` +
        `Pass --companies <path> to point at a different file.`,
    )
  }
  return parseCompanies(text)
}

/** Narrow a parsed list by provider and/or an explicit set of slugs. */
export function filterCompanies(
  companies: Company[],
  opts: { provider?: string; only?: string[] },
): Company[] {
  let out = companies
  if (opts.provider) {
    const want = opts.provider.toLowerCase()
    out = out.filter((c) => c.provider === want)
  }
  if (opts.only && opts.only.length) {
    const want = new Set(opts.only.map((s) => s.trim().toLowerCase()).filter(Boolean))
    out = out.filter((c) => want.has(c.slug.toLowerCase()) || want.has(`${c.provider}:${c.slug}`.toLowerCase()))
  }
  return out
}

/** Human-friendly display name derived from a slug, when the API gives none. */
export function displayName(company: Company): string {
  return company.slug
}
