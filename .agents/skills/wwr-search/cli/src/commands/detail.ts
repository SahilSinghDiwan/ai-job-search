import { BASE, htmlFetch, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
  today?: Date
}

/** Accept a bare WWR slug or a full listing URL. */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const url = trimmed.match(/weworkremotely\.com\/remote-jobs\/([^/?#]+)/i)
  if (url) return url[1]
  const path = trimmed.match(/^\/?remote-jobs\/([^/?#]+)/i)
  if (path) return path[1]
  if (/^[a-z0-9][a-z0-9-]*$/i.test(trimmed)) return trimmed
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a WeWorkRemotely job slug from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const html = await htmlFetch(`${BASE}/remote-jobs/${id}`)
    if (!html) {
      writeError("Job not found (WWR returned 404 — the listing may have expired)", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(html, id, opts.today)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        `Eligibility: ${job.eligibility.class} — gate verdict ${job.eligibility.gateVerdict.toUpperCase()}`,
        `  stated scope: ${job.eligibility.scope ?? "(not stated)"}`,
        `  why: ${job.eligibility.reason}`,
        job.geoLocked ? "  WWR marks this posting GeoLocked (a stated restriction, not a tag)" : "",
        job.applicantCountries.length
          ? `  applicantLocationRequirements: ${job.applicantCountries.length} country/countries, India ${job.applicantCountries.includes("IN") ? "INCLUDED" : "NOT included"}`
          : "  applicantLocationRequirements: not published",
        "",
        job.postedRelative ? `Posted: ${job.postedRelative}${job.date ? ` (~${job.date}, ${job.datePrecision})` : ""}` : "",
        job.dateConflict ? `Date caveat: ${job.dateConflict}` : "",
        job.applyBefore ? `Apply before: ${job.applyBefore}` : "",
        job.jobType ? `Job type: ${job.jobType}` : "",
        job.category ? `Category: ${job.category}` : "",
        job.salary ? `Salary: ${job.salary}` : "Salary: not published",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
        job.applyUrl ? `Apply: ${job.applyUrl}` : "",
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
