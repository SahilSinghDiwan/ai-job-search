import {
  SEARCH_URL,
  htmlFetch,
  parseJobCards,
  writeError,
  type JobCard,
} from "../helpers.js"
import type { EligibilityClass } from "../eligibility.js"

/** WWR returns the whole result set on one page, so paging is client-side. */
export const PAGE_SIZE = 25

export interface SearchOpts {
  query?: string
  /** Client-side substring filter over the eligibility scope and company HQ. */
  location?: string
  /** ISO 3166-1 alpha-2 codes passed to WWR's own `country[]` filter. */
  countries: string[]
  salaryRange?: string
  jobage?: number
  page: number
  limit?: number
  /** Keep listings whose stated scope excludes India. Default: drop them. */
  includeGated: boolean
  /** Drop `unknown`-scope listings too. Default: keep them, marked unknown. */
  eligibleOnly: boolean
  format: "json" | "table" | "plain"
  today?: Date
}

export function buildUrl(opts: SearchOpts): string {
  const params = new URLSearchParams()
  if (opts.query) params.set("term", opts.query)
  for (const c of opts.countries) params.append("country[]", c.toUpperCase())
  if (opts.salaryRange) params.append("salary_range[]", opts.salaryRange)
  const qs = params.toString()
  return qs ? `${SEARCH_URL}?${qs}` : SEARCH_URL
}

export interface FilterReport {
  mode: "exclude-gated" | "include-gated" | "eligible-only"
  counts: Record<EligibilityClass, number>
  filtered: {
    total: number
    /**
     * Split by the 04-job-evaluation.md verdict the listing would receive:
     * `fail` = the listing states a restriction India cannot satisfy;
     * `flag` = a bare country tag, which that framework says to surface rather
     * than fail. Anything counted under `flag` here is a role the candidate
     * might still want — re-run with --include-gated to see them.
     */
    byVerdict: { fail: number; flag: number }
    /** Stated scopes that were dropped (compacted for display), with counts. */
    byScope: Record<string, number>
  }
}

/**
 * Shorten a stated scope for the summary line. A single listing can enumerate
 * 76 countries; printing all of them once per dropped listing turns the one
 * line that is supposed to teach into a wall of flags. The verbatim scope is
 * always preserved on the result itself — this is display only.
 */
export function compactScope(scope: string | null): string {
  if (!scope) return "(no scope stated)"
  const parts = scope.split(", ")
  if (parts.length <= 3) return scope
  return `${parts.slice(0, 3).join(", ")} +${parts.length - 3} more`
}

/**
 * WWR employers routinely re-post the same req under `-1`/`-2` slug suffixes
 * (verified live: three identical CapsLock listings, two Lattice, two
 * ClickHouse in one "AI engineer" search). Collapse them so the counts mean
 * something, keyed on company + title + stated scope so two genuinely
 * different regional reqs for the same role are never merged.
 */
export function dedupeCards(cards: JobCard[]): { unique: JobCard[]; collapsed: number } {
  const seen = new Map<string, JobCard>()
  let collapsed = 0
  for (const c of cards) {
    const key = `${(c.company ?? "").toLowerCase()}|${c.title.toLowerCase()}|${c.eligibility.scope ?? ""}`
    const prev = seen.get(key)
    if (!prev) {
      seen.set(key, { ...c, duplicateIds: [] })
      continue
    }
    collapsed++
    // Keep the un-suffixed slug as canonical; record the rest.
    if (c.id.length < prev.id.length) {
      seen.set(key, { ...c, duplicateIds: [...(prev.duplicateIds ?? []), prev.id] })
    } else {
      prev.duplicateIds = [...(prev.duplicateIds ?? []), c.id]
    }
  }
  return { unique: [...seen.values()], collapsed }
}

export function applyEligibilityFilter(
  cards: JobCard[],
  opts: { includeGated: boolean; eligibleOnly: boolean },
): { kept: JobCard[]; report: FilterReport } {
  const counts: Record<EligibilityClass, number> = {
    "india-eligible": 0,
    worldwide: 0,
    "gated-elsewhere": 0,
    unknown: 0,
  }
  const byScope: Record<string, number> = {}
  const byVerdict = { fail: 0, flag: 0 }
  const kept: JobCard[] = []

  for (const card of cards) {
    const e = card.eligibility
    counts[e.class]++

    const dropGated = e.class === "gated-elsewhere" && !opts.includeGated
    const dropUnknown = e.class === "unknown" && opts.eligibleOnly
    if (!dropGated && !dropUnknown) {
      kept.push(card)
      continue
    }
    const label = compactScope(e.scope)
    byScope[label] = (byScope[label] ?? 0) + 1
    if (e.gateVerdict === "fail") byVerdict.fail++
    else byVerdict.flag++
  }

  const mode = opts.eligibleOnly ? "eligible-only" : opts.includeGated ? "include-gated" : "exclude-gated"
  const total = Object.values(byScope).reduce((a, b) => a + b, 0)
  return { kept, report: { mode, counts, filtered: { total, byVerdict, byScope } } }
}

function eligibilityBadge(card: JobCard): string {
  switch (card.eligibility.class) {
    case "india-eligible":
      return "IN-OK"
    case "worldwide":
      return "WORLD"
    case "gated-elsewhere":
      return card.eligibility.gateVerdict === "fail" ? "GATED" : "TAG?"
    default:
      return "UNKWN"
  }
}

function renderTable(cards: JobCard[], report: FilterReport): string {
  const header =
    "ELIG".padEnd(6) +
    " " +
    "AGE".padEnd(6) +
    " " +
    "TITLE".padEnd(40) +
    " " +
    "COMPANY".padEnd(22) +
    " " +
    "SALARY".padEnd(14) +
    " SCOPE"
  const rows = cards.map((c) => {
    const age = c.postedRelative ? `${c.postedRelative}${c.ageIsFloor ? "+" : ""}` : "—"
    return (
      eligibilityBadge(c).padEnd(6) +
      " " +
      age.padEnd(6) +
      " " +
      (c.title || "").slice(0, 40).padEnd(40) +
      " " +
      (c.company || "—").slice(0, 22).padEnd(22) +
      " " +
      (c.salary || "—").slice(0, 14).padEnd(14) +
      " " +
      (c.eligibility.scope ?? "(not stated)").slice(0, 60)
    )
  })

  const lines = cards.length ? [header, "-".repeat(header.length), ...rows] : ["No results."]
  lines.push("")
  lines.push(summaryLine(cards.length, report))
  return lines.join("\n")
}

/** The line that teaches: "40 results, 31 filtered as US-only" beats silently showing 9. */
export function summaryLine(shown: number, report: FilterReport): string {
  const f = report.filtered
  if (f.total === 0) {
    return `${shown} shown · nothing filtered on eligibility · ${report.counts["india-eligible"]} India-eligible, ${report.counts.worldwide} worldwide, ${report.counts.unknown} scope-unstated`
  }
  const scopes = Object.entries(f.byScope)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([scope, n]) => `${n}× ${scope}`)
    .join("; ")
  return (
    `${shown} shown · ${f.total} filtered out as gated elsewhere ` +
    `(${f.byVerdict.fail} stated restriction, ${f.byVerdict.flag} bare country tag — re-run with --include-gated to see them): ${scopes}`
  )
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  const url = buildUrl(opts)
  try {
    const html = await htmlFetch(url)
    const { cards: parsed, adsSkipped } = parseJobCards(html, opts.today)
    const { unique: all, collapsed: duplicatesCollapsed } = dedupeCards(parsed)

    let cards = all
    if (opts.jobage !== undefined) {
      // Client-side: WWR's search has no recency parameter (see url-reference.md).
      // A listing with no age badge is kept, not silently dropped as "old".
      cards = cards.filter((c) => c.ageDays === null || c.ageDays <= (opts.jobage as number))
    }
    if (opts.location) {
      const needle = opts.location.toLowerCase()
      cards = cards.filter(
        (c) =>
          (c.eligibility.scope ?? "").toLowerCase().includes(needle) ||
          (c.location ?? "").toLowerCase().includes(needle),
      )
    }

    const { kept, report } = applyEligibilityFilter(cards, opts)

    const start = (opts.page - 1) * PAGE_SIZE
    let page = kept.slice(start, start + PAGE_SIZE)
    if (opts.limit !== undefined && opts.limit >= 0) page = page.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(page, report) + "\n")
    } else if (opts.format === "plain") {
      const body = page
        .map(
          (c) =>
            `${c.title}\n  ${c.company || "—"} · ${c.postedRelative || "—"} · ${c.salary || "no salary published"}\n` +
            `  eligibility: ${c.eligibility.class} (${c.eligibility.gateVerdict}) — ${c.eligibility.reason}\n` +
            `  scope as stated: ${c.eligibility.scope ?? "(not stated)"}\n  id: ${c.id}\n  ${c.url}`,
        )
        .join("\n\n")
      process.stdout.write((body ? body + "\n\n" : "") + summaryLine(page.length, report) + "\n")
    } else {
      process.stdout.write(
        JSON.stringify(
          {
            meta: {
              count: page.length,
              page: opts.page,
              pageSize: PAGE_SIZE,
              query: opts.query ?? null,
              url,
              totalParsed: parsed.length,
              uniqueAfterDedupe: all.length,
              adsSkipped,
              duplicatesCollapsed,
              matchedBeforeEligibility: cards.length,
              eligibility: report,
              serverCountryFilter: opts.countries.length ? opts.countries : null,
              summary: summaryLine(page.length, report),
              notes: [
                "Eligibility is re-parsed from each listing's own stated scope; WWR's country filter is never trusted on its own.",
                "Dates are estimated from WWR's relative badge (day precision); a trailing + means the age is a floor, not a date.",
                `WWR employers re-post the same req under -1/-2 slugs; ${duplicatesCollapsed} duplicate listing(s) were collapsed into their canonical slug (see duplicateIds).`,
                "Run `detail <id>` to upgrade a card-level country tag (gateVerdict flag) to a verified pass/fail from applicantLocationRequirements.",
              ],
            },
            results: kept.length ? page : [],
          },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
