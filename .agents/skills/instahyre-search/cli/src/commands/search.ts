import {
  API_BASE,
  SEARCH_PATH,
  apiGet,
  matchesLocation,
  parseJobCards,
  resolveJobFunction,
  writeError,
  type JobCard,
} from "../helpers.js"

/** Results the API returns per request. Its own `next` link paginates in 35s. */
export const PAGE_SIZE = 35

export interface SearchOpts {
  query?: string
  location?: string
  jobFunction?: string
  jobType: string
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

export function buildUrl(opts: SearchOpts): string {
  const params = new URLSearchParams()
  params.set("job_type", opts.jobType)
  params.set("limit", String(PAGE_SIZE))
  params.set("offset", String((opts.page - 1) * PAGE_SIZE))
  // `skills` is the API's free-text keyword parameter — it matches title and
  // skill tags. See url-reference.md for how this was established.
  if (opts.query) params.set("skills", opts.query)
  if (opts.jobFunction) params.set("job_functions", resolveJobFunction(opts.jobFunction))
  return `${API_BASE}${SEARCH_PATH}?${params.toString()}`
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const header =
    "ID".padEnd(9) +
    " " +
    "TITLE".padEnd(42) +
    " " +
    "COMPANY".padEnd(26) +
    " " +
    "LOCATION".padEnd(28) +
    " KEYWORDS"
  const rows = cards.map((c) => {
    const id = c.id.padEnd(9)
    const title = (c.title || "").slice(0, 42).padEnd(42)
    const company = (c.company || "—").slice(0, 26).padEnd(26)
    const loc = (c.location || "—").slice(0, 28).padEnd(28)
    return `${id} ${title} ${company} ${loc} ${c.keywords.slice(0, 3).join(", ")}`
  })
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const envelope = await apiGet(buildUrl(opts))
    let cards = parseJobCards(envelope)

    // Location is filtered here, not server-side — the API has no location
    // parameter (url-reference.md records the probe). This narrows the fetched
    // page only, so a narrow location can return fewer rows than --limit.
    const locationFiltered = Boolean(opts.location)
    const fetched = cards.length
    if (opts.location) cards = cards.filter((c) => matchesLocation(c, opts.location as string))
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        (cards.length === 0
          ? "No results."
          : cards
              .map(
                (c) =>
                  `${c.title}\n  ${c.company || "—"} · ${c.location || "—"}\n  ` +
                  `skills: ${c.keywords.join(", ") || "—"}\n  id: ${c.id}\n  ${c.url}`,
              )
              .join("\n\n")) + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          {
            meta: {
              count: cards.length,
              page: opts.page,
              pageSize: PAGE_SIZE,
              total: (envelope?.meta?.total_count as number | undefined) ?? null,
              fetchedBeforeLocationFilter: locationFiltered ? fetched : null,
              locationFilter: locationFiltered ? "client-side" : null,
              recencyFilter: "unsupported",
              postingDate: "unavailable",
              // The API has no date field, but the job's HTML page does
              // (schema.org JSON-LD `datePosted`). That is an opt-in browser
              // pass over a shortlist, never part of bulk search — see the
              // `table` command and SKILL.md.
              postingDateEnrichment: "opt-in: `table` + browser JSON-LD pass",
            },
            results: cards,
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
