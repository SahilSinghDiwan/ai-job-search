// `detail <id|url>` — one posting with its full description text.

import { fetchJob } from "../fetchers.js"
import { isProvider, writeError, type Provider } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

export interface JobRef {
  provider: Provider
  slug: string
  jobId: string
}

/**
 * Accept the composite id emitted by `search` (`provider:slug:jobId`) or a
 * public board URL:
 *   https://job-boards.greenhouse.io/anthropic/jobs/4461450008
 *   https://boards.greenhouse.io/anthropic/jobs/4461450008
 *   https://jobs.ashbyhq.com/sarvam/<uuid>
 *   https://jobs.lever.co/cred/<uuid>
 *
 * Parsing a jobs.lever.co URL is not the same as fetching one: the id is read
 * out of the string and the request goes to api.lever.co.
 */
export function parseRef(input: string): JobRef | null {
  const trimmed = input.trim()

  const composite = trimmed.match(/^([a-z]+):([^:\s]+):(.+)$/i)
  if (composite && isProvider(composite[1]!.toLowerCase())) {
    return {
      provider: composite[1]!.toLowerCase() as Provider,
      slug: composite[2]!,
      jobId: composite[3]!.trim(),
    }
  }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  const host = url.host.toLowerCase()
  const seg = url.pathname.split("/").filter(Boolean)

  if (host.endsWith("greenhouse.io")) {
    // /<slug>/jobs/<id>  (job-boards + boards hosts), or the API's
    // /v1/boards/<slug>/jobs/<id>
    const jobsAt = seg.lastIndexOf("jobs")
    if (jobsAt > 0 && seg[jobsAt + 1]) {
      return { provider: "greenhouse", slug: seg[jobsAt - 1]!, jobId: seg[jobsAt + 1]! }
    }
    return null
  }
  if (host.endsWith("ashbyhq.com")) {
    // jobs.ashbyhq.com/<slug>/<uuid>  |  api.../job-board/<slug>
    const boardAt = seg.indexOf("job-board")
    const base = boardAt >= 0 ? seg.slice(boardAt + 1) : seg
    if (base.length >= 2) return { provider: "ashby", slug: base[0]!, jobId: base[1]! }
    return null
  }
  if (host.endsWith("lever.co")) {
    const postingsAt = seg.indexOf("postings")
    const base = postingsAt >= 0 ? seg.slice(postingsAt + 1) : seg
    if (base.length >= 2) return { provider: "lever", slug: base[0]!, jobId: base[1]! }
    return null
  }
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const ref = parseRef(opts.id)
  if (!ref) {
    writeError(
      `could not parse "${opts.id}" — expected <provider>:<slug>:<jobId> or a Greenhouse/Ashby/Lever job URL`,
      "BAD_ID",
    )
    return 1
  }

  try {
    const job = await fetchJob(ref.provider, ref.slug, ref.jobId)
    if (!job) {
      writeError(`job not found on ${ref.provider}:${ref.slug}`, "NOT_FOUND")
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company ?? job.companySlug} · ${job.location ?? "—"}`,
        `Workplace: ${job.workplaceType ?? "not stated"}${job.remote === null ? "" : ` (remote: ${job.remote})`}`,
        job.department ? `Department: ${job.department}` : "",
        job.employmentType ? `Employment type: ${job.employmentType}` : "",
        `Posted: ${job.date ?? "unknown"}`,
        "",
        job.description || "(no description text on this posting)",
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
