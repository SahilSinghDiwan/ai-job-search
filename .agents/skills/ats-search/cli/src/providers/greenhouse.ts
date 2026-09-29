// Greenhouse Job Board API.
//
//   GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true
//   GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs/{id}
//
// Verified live 2026-08-25 against `anthropic`: 200 OK, `{jobs:[...], meta:{total}}`.
// robots.txt on this host disallows only `/embed/`, for all user-agents.

import {
  asString,
  htmlToText,
  toIsoDate,
  type Job,
  type Provider,
} from "../helpers.js"

export const PROVIDER: Provider = "greenhouse"
export const API_BASE = "https://boards-api.greenhouse.io/v1/boards"

export function listUrl(slug: string, content = false): string {
  return `${API_BASE}/${encodeURIComponent(slug)}/jobs${content ? "?content=true" : ""}`
}

export function detailUrl(slug: string, jobId: string): string {
  return `${API_BASE}/${encodeURIComponent(slug)}/jobs/${encodeURIComponent(jobId)}`
}

/**
 * Greenhouse exposes remote/hybrid/on-site through a free-form `metadata`
 * array. The convention across boards is a field literally named
 * "Location Type" (Anthropic's board uses exactly that), but the name is
 * employer-configurable, so a couple of near-synonyms are accepted too.
 */
const LOCATION_TYPE_KEYS = ["location type", "workplace type", "remote status", "work location"]

export function extractLocationType(metadata: unknown): string | null {
  if (!Array.isArray(metadata)) return null
  for (const entry of metadata) {
    if (!entry || typeof entry !== "object") continue
    const e = entry as Record<string, unknown>
    const name = (asString(e.name) ?? "").toLowerCase()
    if (!LOCATION_TYPE_KEYS.includes(name)) continue
    const value = e.value
    if (typeof value === "string" && value.trim()) return value.trim()
    if (Array.isArray(value)) {
      const joined = value.map((v) => asString(v)).filter(Boolean).join(", ")
      if (joined) return joined
    }
  }
  return null
}

function departmentOf(raw: Record<string, unknown>): string | null {
  if (!Array.isArray(raw.departments)) return null
  const names = raw.departments
    .map((d) => (d && typeof d === "object" ? asString((d as Record<string, unknown>).name) : null))
    .filter((n): n is string => Boolean(n))
  return names.length ? names.join(", ") : null
}

export function mapJob(raw: unknown, slug: string, fallbackCompany?: string | null): Job | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>

  const jobId = asString(o.id)
  const title = asString(o.title)
  if (!jobId || !title) return null

  const locationName =
    o.location && typeof o.location === "object"
      ? asString((o.location as Record<string, unknown>).name)
      : asString(o.location)

  const workplaceType = extractLocationType(o.metadata)
  // `remote` is only asserted when Greenhouse actually said something. A board
  // that ships no Location Type metadata yields null, not false.
  const remote =
    workplaceType === null ? null : /remote/i.test(workplaceType) && !/hybrid/i.test(workplaceType)

  const content = asString(o.content)

  return {
    // `first_published` is the true posting date; `updated_at` is the last edit
    // and would make a two-year-old req look fresh. Prefer the former, fall
    // back only when a board omits it.
    id: `${PROVIDER}:${slug}:${jobId}`,
    title,
    company: asString(o.company_name) ?? fallbackCompany ?? null,
    location: locationName,
    date: toIsoDate(o.first_published) ?? toIsoDate(o.updated_at),
    url: asString(o.absolute_url) ?? `https://job-boards.greenhouse.io/${slug}/jobs/${jobId}`,
    provider: PROVIDER,
    companySlug: slug,
    jobId,
    remote,
    workplaceType,
    department: departmentOf(o),
    employmentType: null,
    ...(content !== null ? { description: htmlToText(content) } : {}),
  }
}

/** Reshape a `{jobs:[...]}` envelope, skipping records that fail to parse. */
export function mapList(body: unknown, slug: string): Job[] {
  const jobs =
    body && typeof body === "object" && Array.isArray((body as Record<string, unknown>).jobs)
      ? ((body as Record<string, unknown>).jobs as unknown[])
      : []
  const out: Job[] = []
  for (const raw of jobs) {
    try {
      const job = mapJob(raw, slug)
      if (job) out.push(job)
    } catch {
      // One malformed record must not lose the rest of the board.
    }
  }
  return out
}
