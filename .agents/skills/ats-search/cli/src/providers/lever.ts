// Lever postings API.
//
//   GET https://api.lever.co/v0/postings/{slug}?mode=json
//   GET https://api.lever.co/v0/postings/{slug}/{id}?mode=json
//
// Verified live 2026-08-25: `lever` returns `[]` (valid, just not hiring),
// `cred` returns a populated array, and an unknown slug returns
// `{"ok":false,"error":"Document not found"}` — unambiguous, never a silent
// wrong-looking success.
//
// TWO HOSTS, OPPOSITE POSTURES — do not confuse them:
//   api.lever.co   robots.txt `Allow: /`, `Crawl-delay: 1`. This is the host
//                  this module fetches, and the crawl delay is honored by the
//                  caller's inter-request pacing (helpers.DEFAULT_DELAY_MS).
//   jobs.lever.co  robots.txt names `User-agent: ClaudeBot` / `Disallow: /`.
//                  NEVER FETCHED. `hostedUrl` points there and is emitted as a
//                  link for a human to open; this CLI must not request it, and
//                  must not be "fixed" by adding a jobs.lever.co fallback.

import { asString, htmlToText, toIsoDate, type Job, type Provider } from "../helpers.js"

export const PROVIDER: Provider = "lever"
export const API_BASE = "https://api.lever.co/v0/postings"

export function listUrl(slug: string): string {
  return `${API_BASE}/${encodeURIComponent(slug)}?mode=json`
}

export function detailUrl(slug: string, jobId: string): string {
  return `${API_BASE}/${encodeURIComponent(slug)}/${encodeURIComponent(jobId)}?mode=json`
}

/** `{"ok":false,"error":"Document not found"}` — Lever's soft 404 body. */
export function isNotFoundBody(body: unknown): boolean {
  return (
    !!body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    (body as Record<string, unknown>).ok === false
  )
}

function categoriesOf(raw: Record<string, unknown>): Record<string, unknown> {
  return raw.categories && typeof raw.categories === "object"
    ? (raw.categories as Record<string, unknown>)
    : {}
}

export function joinLocations(raw: Record<string, unknown>): string | null {
  const c = categoriesOf(raw)
  const primary = asString(c.location)
  const all = Array.isArray(c.allLocations)
    ? c.allLocations.map((v) => asString(v)).filter((v): v is string => Boolean(v))
    : []
  const merged = [primary, ...all].filter((v): v is string => Boolean(v))
  const unique = [...new Set(merged)]
  return unique.length ? unique.join(" | ") : null
}

export function mapJob(raw: unknown, slug: string, includeDescription = true): Job | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>

  const jobId = asString(o.id)
  // Lever's title field is `text`, not `title`.
  const title = asString(o.text) ?? asString(o.title)
  if (!jobId || !title) return null

  const c = categoriesOf(o)
  const workplaceType = asString(o.workplaceType)
  const descriptionText =
    asString(o.descriptionPlain) ??
    (asString(o.description) ? htmlToText(asString(o.description) as string) : null)

  return {
    id: `${PROVIDER}:${slug}:${jobId}`,
    title,
    company: null,
    location: joinLocations(o),
    // `createdAt` is epoch milliseconds — the posting's creation, which is the
    // date /rank should age against.
    date: toIsoDate(typeof o.createdAt === "number" ? o.createdAt : null),
    // hostedUrl lives on jobs.lever.co: emitted for a human, never fetched.
    url: asString(o.hostedUrl) ?? `https://jobs.lever.co/${slug}/${jobId}`,
    provider: PROVIDER,
    companySlug: slug,
    jobId,
    remote: workplaceType === null ? null : /remote/i.test(workplaceType),
    workplaceType,
    department: asString(c.department) ?? asString(c.team),
    employmentType: asString(c.commitment),
    ...(includeDescription && descriptionText !== null
      ? { description: descriptionText }
      : {}),
  }
}

/** Lever's list response is a bare array, not an envelope. */
export function mapList(body: unknown, slug: string, includeDescription = false): Job[] {
  if (!Array.isArray(body)) return []
  const out: Job[] = []
  for (const raw of body) {
    try {
      const job = mapJob(raw, slug, includeDescription)
      if (job) out.push(job)
    } catch {
      // Skip a malformed record rather than losing the board.
    }
  }
  return out
}
