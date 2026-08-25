// `search` — iterate the company list, fetch each board, pool the results into
// the standard `{meta, results}` envelope so /scrape merges them without any
// special-casing.
//
// Failure policy: a per-company failure is recorded in `meta.failures` and the
// run continues. A 40-company sweep must never abort because one board moved.

import { filterCompanies, loadCompanies, type Company } from "../companies.js"
import { fetchBoard } from "../fetchers.js"
import {
  DEFAULT_DELAY_MS,
  daysBetween,
  looksRemote,
  matchesLocation,
  matchesQuery,
  sleep,
  todayIso,
  writeError,
  writeWarning,
  type Job,
} from "../helpers.js"

export interface SearchOpts {
  companiesPath: string
  query?: string
  location?: string
  remoteOnly: boolean
  jobage?: number
  since?: string
  provider?: string
  only?: string[]
  content: boolean
  page: number
  limit: number
  delayMs: number
  format: "json" | "table" | "plain"
  today: string
}

export interface Failure {
  provider: string
  slug: string
  error: string
}

/** Newest first; postings with no date sort last, never first. */
export function sortByDateDesc(jobs: Job[]): Job[] {
  return [...jobs].sort((a, b) => {
    if (a.date === b.date) return a.title.localeCompare(b.title)
    if (!a.date) return 1
    if (!b.date) return -1
    return a.date < b.date ? 1 : -1
  })
}

export interface FilterOpts {
  query?: string
  location?: string
  remoteOnly?: boolean
  jobage?: number
  since?: string
  today: string
}

/**
 * Apply every client-side filter. All filtering is client-side by necessity:
 * none of the three ATS APIs accepts a keyword, location, or recency parameter
 * — they return the employer's whole open-req list or nothing.
 */
export function applyFilters(jobs: Job[], opts: FilterOpts): Job[] {
  let out = jobs
  if (opts.query) out = out.filter((j) => matchesQuery(j, opts.query as string))
  if (opts.location) out = out.filter((j) => matchesLocation(j, opts.location as string))
  if (opts.remoteOnly) out = out.filter((j) => looksRemote(j))
  if (opts.since) {
    const since = opts.since
    out = out.filter((j) => j.date !== null && j.date >= since)
  }
  if (opts.jobage !== undefined) {
    const maxAge = opts.jobage
    out = out.filter((j) => {
      if (!j.date) return false
      const age = daysBetween(j.date, opts.today)
      return age !== null && age <= maxAge
    })
  }
  return out
}

function pad(s: string, n: number): string {
  return (s.length > n ? s.slice(0, n - 1) + "…" : s).padEnd(n)
}

function renderTable(jobs: Job[], today: string): string {
  if (jobs.length === 0) return "No results."
  const header =
    pad("DATE", 11) + pad("AGE", 6) + pad("COMPANY", 20) + pad("TITLE", 46) + pad("LOCATION", 32) + "REMOTE"
  const rows = jobs.map((j) => {
    const age = j.date ? daysBetween(j.date, today) : null
    return (
      pad(j.date ?? "-", 11) +
      pad(age === null ? "-" : `${age}d`, 6) +
      pad(j.company ?? j.companySlug, 20) +
      pad(j.title, 46) +
      pad(j.location ?? "-", 32) +
      (j.remote === true ? "yes" : j.remote === false ? "no" : j.workplaceType ?? "-")
    )
  })
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

function renderPlain(jobs: Job[]): string {
  if (jobs.length === 0) return "No results."
  return jobs
    .map((j) =>
      [
        j.title,
        `  ${j.company ?? j.companySlug} · ${j.location ?? "—"} · ${j.workplaceType ?? "workplace type not stated"}`,
        `  posted: ${j.date ?? "unknown"}  ·  id: ${j.id}`,
        `  ${j.url}`,
      ].join("\n"),
    )
    .join("\n\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  let companies: Company[]
  try {
    const parsed = loadCompanies(opts.companiesPath)
    for (const p of parsed.problems) writeWarning(`companies.txt ${p}`)
    companies = filterCompanies(parsed.companies, { provider: opts.provider, only: opts.only })
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "COMPANY_LIST_FAILED")
    return 1
  }

  if (companies.length === 0) {
    writeError(
      "no companies to search — the list is empty or --provider/--company filtered everything out",
      "NO_COMPANIES",
    )
    return 1
  }

  const pooled: Job[] = []
  const failures: Failure[] = []
  const perCompany: Record<string, number> = {}

  for (let i = 0; i < companies.length; i++) {
    const company = companies[i] as Company
    const result = await fetchBoard(company, opts.content)
    if (result.error) {
      failures.push({ provider: company.provider, slug: company.slug, error: result.error })
      writeWarning(`${company.provider}:${company.slug} — ${result.error}`)
    } else {
      perCompany[`${company.provider}:${company.slug}`] = result.jobs.length
      pooled.push(...result.jobs)
    }
    // Space the sequential calls politely. api.lever.co's robots.txt asks for
    // Crawl-delay: 1, and the default here clears that for every host.
    if (i < companies.length - 1 && opts.delayMs > 0) await sleep(opts.delayMs)
  }

  const filtered = sortByDateDesc(
    applyFilters(pooled, {
      query: opts.query,
      location: opts.location,
      remoteOnly: opts.remoteOnly,
      jobage: opts.jobage,
      since: opts.since,
      today: opts.today,
    }),
  )

  const start = (opts.page - 1) * opts.limit
  const paged = filtered.slice(start, start + opts.limit)

  if (opts.format === "table") {
    process.stdout.write(renderTable(paged, opts.today) + "\n")
  } else if (opts.format === "plain") {
    process.stdout.write(renderPlain(paged) + "\n")
  } else {
    process.stdout.write(
      JSON.stringify(
        {
          meta: {
            count: paged.length,
            page: opts.page,
            pageSize: opts.limit,
            totalMatched: filtered.length,
            totalFetched: pooled.length,
            companiesQueried: companies.length,
            companiesFailed: failures.length,
            failures,
            perCompany,
            // Every ATS API returns the employer's whole open-req list and
            // accepts no query parameters, so all narrowing happens here.
            filtering: "client-side",
            // Unlike most portals in this repo, these dates are the
            // employer's own and are trustworthy for /rank.
            postingDate: "real (greenhouse first_published, ashby publishedAt, lever createdAt)",
            recencyFilter: opts.jobage !== undefined || opts.since ? "client-side" : null,
            today: opts.today,
          },
          results: paged,
        },
        null,
        2,
      ) + "\n",
    )
  }
  return 0
}
