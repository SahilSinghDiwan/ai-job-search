// Provider dispatch: given a Company, fetch its board and return normalized
// Jobs. Every function here is per-company and total — a failure is returned,
// never thrown past the caller, so a 40-company run never aborts on one bad
// board.

import type { Company } from "./companies.js"
import { apiGet, type Job, type Provider } from "./helpers.js"
import * as greenhouse from "./providers/greenhouse.js"
import * as ashby from "./providers/ashby.js"
import * as lever from "./providers/lever.js"

export interface BoardResult {
  company: Company
  jobs: Job[]
  /** null on success; a human-readable reason on failure. */
  error: string | null
}

export function boardUrl(provider: Provider, slug: string, content: boolean): string {
  if (provider === "greenhouse") return greenhouse.listUrl(slug, content)
  if (provider === "ashby") return ashby.listUrl(slug)
  return lever.listUrl(slug)
}

/**
 * Fetch and normalize one company's board.
 *
 * `content` only affects Greenhouse (`?content=true` is a much larger payload).
 * Ashby and Lever always return descriptions inline; they are dropped at map
 * time unless asked for, so the shape is consistent across providers.
 */
export async function fetchBoard(company: Company, content = false): Promise<BoardResult> {
  const { provider, slug } = company
  const url = boardUrl(provider, slug, content)
  try {
    const body = await apiGet(url)
    if (body === null) {
      return { company, jobs: [], error: `no such board (HTTP 404) — check the ${provider} slug` }
    }
    if (provider === "lever" && lever.isNotFoundBody(body)) {
      return { company, jobs: [], error: `no such board (Lever: "Document not found")` }
    }

    let jobs: Job[]
    if (provider === "greenhouse") jobs = greenhouse.mapList(body, slug)
    else if (provider === "ashby") jobs = ashby.mapList(body, slug, content)
    else jobs = lever.mapList(body, slug, content)

    // Greenhouse is the only provider that reports the employer's own name.
    // For the other two the slug is the identity, so fill it in rather than
    // emitting a null `company` that /rank cannot label.
    for (const job of jobs) if (!job.company) job.company = slug

    return { company, jobs, error: null }
  } catch (e) {
    return { company, jobs: [], error: e instanceof Error ? e.message : String(e) }
  }
}

/** Fetch one posting's full record, description included. */
export async function fetchJob(
  provider: Provider,
  slug: string,
  jobId: string,
): Promise<Job | null> {
  if (provider === "greenhouse") {
    const body = await apiGet(greenhouse.detailUrl(slug, jobId))
    if (body === null) return null
    const job = greenhouse.mapJob(body, slug)
    if (job && !job.company) job.company = slug
    return job
  }

  if (provider === "ashby") {
    // Ashby publishes no per-posting endpoint; the board response is the
    // detail source, and descriptions are already inline on it.
    const body = await apiGet(ashby.listUrl(slug))
    if (body === null) return null
    const job = ashby.mapList(body, slug, true).find((j) => j.jobId === jobId) ?? null
    if (job && !job.company) job.company = slug
    return job
  }

  const body = await apiGet(lever.detailUrl(slug, jobId))
  if (body === null || lever.isNotFoundBody(body)) return null
  const job = lever.mapJob(body, slug, true)
  if (job && !job.company) job.company = slug
  return job
}
