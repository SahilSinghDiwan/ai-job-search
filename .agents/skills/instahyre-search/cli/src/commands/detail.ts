import { API_BASE, SEARCH_PATH, apiGet, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/**
 * Accept a raw posting id or an Instahyre public job URL
 * (https://www.instahyre.com/job-438118-staff-frontend-developer-at-openfx-bangalore/).
 */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  const fromUrl = trimmed.match(/\/job-(\d+)/)
  if (fromUrl) return fromUrl[1]
  const fromResource = trimmed.match(/job_search\/(\d+)/)
  if (fromResource) return fromResource[1]
  const bare = trimmed.match(/^\d+$/)
  if (bare) return trimmed
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse an Instahyre job id from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const raw = await apiGet(`${API_BASE}${SEARCH_PATH}/${id}`)
    if (!raw) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(raw)
    if (!job) {
      writeError("Job payload could not be parsed", "BAD_PAYLOAD")
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        job.companyTagline ? `About: ${job.companyTagline}` : "",
        job.employeeCount !== null ? `Employees: ${job.employeeCount}` : "",
        "",
        `Skills: ${job.keywords.join(", ") || "—"}`,
        "",
        job.description ||
          "(Instahyre's API returns no job-description text — open the URL below for the full posting.)",
        "",
        `URL: ${job.url}`,
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
