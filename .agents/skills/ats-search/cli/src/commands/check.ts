// `check` — verify that board slugs actually resolve.
//
// The whole skill rests on the company list being correct, and a wrong slug is
// a silent 404: `search` just returns nothing for that employer and nobody
// notices. `check` makes that visible — run it before adding a company, and
// periodically over the whole list to catch boards that moved or went quiet.

import { filterCompanies, loadCompanies, type Company } from "../companies.js"
import { fetchBoard } from "../fetchers.js"
import { sleep, writeError, writeWarning, type Provider } from "../helpers.js"

export interface CheckOpts {
  companiesPath: string
  /** Ad-hoc single check; when absent the whole list is checked. */
  provider?: Provider
  slug?: string
  all: boolean
  delayMs: number
  format: "json" | "table" | "plain"
}

export interface CheckRow {
  provider: string
  slug: string
  ok: boolean
  jobs: number
  error: string | null
}

export async function runCheck(opts: CheckOpts): Promise<number> {
  let companies: Company[]

  if (opts.provider && opts.slug) {
    companies = [{ provider: opts.provider, slug: opts.slug, note: null, line: 0 }]
  } else {
    try {
      const parsed = loadCompanies(opts.companiesPath)
      for (const p of parsed.problems) writeWarning(`companies.txt ${p}`)
      companies = filterCompanies(parsed.companies, {})
    } catch (e) {
      writeError(e instanceof Error ? e.message : String(e), "COMPANY_LIST_FAILED")
      return 1
    }
  }

  if (companies.length === 0) {
    writeError("nothing to check — the company list is empty", "NO_COMPANIES")
    return 1
  }

  const rows: CheckRow[] = []
  for (let i = 0; i < companies.length; i++) {
    const company = companies[i] as Company
    const result = await fetchBoard(company, false)
    rows.push({
      provider: company.provider,
      slug: company.slug,
      ok: result.error === null,
      jobs: result.jobs.length,
      error: result.error,
    })
    if (i < companies.length - 1 && opts.delayMs > 0) await sleep(opts.delayMs)
  }

  const bad = rows.filter((r) => !r.ok)

  if (opts.format === "json") {
    process.stdout.write(
      JSON.stringify(
        {
          meta: { checked: rows.length, ok: rows.length - bad.length, failed: bad.length },
          results: rows,
        },
        null,
        2,
      ) + "\n",
    )
  } else {
    const lines = rows.map(
      (r) =>
        `${r.ok ? "OK  " : "FAIL"} ${r.provider.padEnd(11)} ${r.slug.padEnd(34)} ` +
        `${r.ok ? `${r.jobs} open` : r.error}`,
    )
    lines.push(`-- ${rows.length - bad.length}/${rows.length} slugs resolved`)
    process.stdout.write(lines.join("\n") + "\n")
  }

  // A failed slug is a real defect in the list, so exit non-zero — this is the
  // command you would wire into a periodic sanity check.
  return bad.length === 0 ? 0 : 1
}
