// Ashby public job-board API.
//
//   GET https://api.ashbyhq.com/posting-api/job-board/{slug}
//   GET https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true
//
// Verified live 2026-08-25 against `ramp` and `sarvam`: 200 OK,
// `{jobs:[...], apiVersion:"1"}` with `publishedAt`, `isRemote`, `workplaceType`,
// `secondaryLocations`, `descriptionHtml` already inline on the LIST response —
// so Ashby needs no second request for a description, and `detail` re-reads the
// board and picks the id out of it.
//
// `api.ashbyhq.com/robots.txt` returns HTTP 401 — an auth wall on that one route,
// not a policy statement. The documented posting-api path answers unauthenticated.

import { asString, htmlToText, toIsoDate, type Job, type Provider } from "../helpers.js"

export const PROVIDER: Provider = "ashby"
export const API_BASE = "https://api.ashbyhq.com/posting-api/job-board"

export function listUrl(slug: string, compensation = false): string {
  return `${API_BASE}/${encodeURIComponent(slug)}${compensation ? "?includeCompensation=true" : ""}`
}

/** Ashby has no per-posting endpoint; the board response is the detail source. */
export const detailUrl = listUrl

/** Join the primary location with any `secondaryLocations` Ashby lists. */
export function joinLocations(raw: Record<string, unknown>): string | null {
  const primary = asString(raw.location)
  const extra: string[] = []
  if (Array.isArray(raw.secondaryLocations)) {
    for (const s of raw.secondaryLocations) {
      if (!s || typeof s !== "object") continue
      const name = asString((s as Record<string, unknown>).location)
      if (name && name !== primary) extra.push(name)
    }
  }
  const all = [primary, ...extra].filter((v): v is string => Boolean(v))
  return all.length ? all.join(" | ") : null
}

export function mapJob(raw: unknown, slug: string, includeDescription = true): Job | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>

  const jobId = asString(o.id)
  const title = asString(o.title)
  if (!jobId || !title) return null

  const descriptionHtml = asString(o.descriptionHtml) ?? asString(o.descriptionPlain)

  return {
    id: `${PROVIDER}:${slug}:${jobId}`,
    title,
    // The board response carries no company name field; the slug is the
    // company identity here, so callers pass the list's display name in.
    company: null,
    location: joinLocations(o),
    date: toIsoDate(o.publishedAt) ?? toIsoDate(o.updatedAt),
    url: asString(o.jobUrl) ?? `https://jobs.ashbyhq.com/${slug}/${jobId}`,
    provider: PROVIDER,
    companySlug: slug,
    jobId,
    remote: typeof o.isRemote === "boolean" ? o.isRemote : null,
    workplaceType: asString(o.workplaceType),
    department: asString(o.department) ?? asString(o.team),
    employmentType: asString(o.employmentType),
    ...(includeDescription && descriptionHtml !== null
      ? { description: htmlToText(descriptionHtml) }
      : {}),
  }
}

/**
 * Reshape a `{jobs:[...]}` envelope. `isListed: false` postings are board
 * entries the employer has unpublished — skip them rather than reporting a
 * dead link as an opening.
 */
export function mapList(body: unknown, slug: string, includeDescription = false): Job[] {
  const jobs =
    body && typeof body === "object" && Array.isArray((body as Record<string, unknown>).jobs)
      ? ((body as Record<string, unknown>).jobs as unknown[])
      : []
  const out: Job[] = []
  for (const raw of jobs) {
    try {
      if (raw && typeof raw === "object" && (raw as Record<string, unknown>).isListed === false) {
        continue
      }
      const job = mapJob(raw, slug, includeDescription)
      if (job) out.push(job)
    } catch {
      // Skip a malformed record rather than losing the board.
    }
  }
  return out
}
