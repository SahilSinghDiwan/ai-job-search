// Data source: Instahyre's public `job_search` JSON API (django-tastypie style,
// `{meta, objects}` envelope). Reads are unauthenticated — no API key, the same
// bar as linkedin-search — and there is no markup to parse: we fetch JSON and
// reshape it into the portal-skill contract's result fields.
//
// Deliberately API-only. Instahyre's HTML pages sit behind a Cloudflare
// interstitial; this CLI never requests them, and must not be "fixed" by adding
// HTML fallbacks or challenge handling.
//
// Personal use only — keep volume low. The API rate-limits with HTTP 429 and we
// back off rather than pushing through it.

export const API_BASE = "https://www.instahyre.com/api/v1"
export const SEARCH_PATH = "/job_search"

/** Public job page for a posting id, used when `public_url` is missing. */
export function jobUrl(id: string): string {
  return `https://www.instahyre.com/job-${id}/`
}

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

export function writeWarning(message: string): void {
  process.stderr.write(`warning: ${message}\n`)
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

/** The API response envelope: {meta, objects}. */
export interface Envelope {
  meta?: {
    offset?: number
    limit?: number
    total_count?: number
    next?: string | null
    previous?: string | null
    [k: string]: unknown
  }
  objects?: unknown[]
  [k: string]: unknown
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * GET a JSON envelope from the Instahyre API. Retries 429/5xx with exponential
 * backoff plus jitter (the API rate-limits readily — backing off is the polite
 * path and the only one this CLI takes). Returns `null` on a 404.
 */
export async function apiGet(url: string): Promise<Envelope | null> {
  const maxRetries = 6
  let delay = 1000

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response: Response
    try {
      response = await fetch(url, {
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      })
    } catch (e) {
      throw new Error(
        `could not reach the Instahyre API (${e instanceof Error ? e.message : String(e)})`,
      )
    }

    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(
          `Instahyre API request failed: ${response.status} ${response.statusText}` +
            (response.status === 429 ? " — rate limited; wait a few minutes and retry" : ""),
        )
      }
      await sleep(delay + Math.floor(Math.random() * 500))
      delay = Math.min(delay * 2, 16000)
      continue
    }
    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(`Instahyre API request failed: ${response.status} ${response.statusText}`)
    }

    const body = (await response.json().catch(() => null)) as Envelope | null
    if (!body) throw new Error("Instahyre API returned an unparseable response body")
    return body
  }
  throw new Error("Instahyre API request failed after retries")
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  companyTagline: string | null
  employeeCount: number | null
  location: string | null
  /**
   * Always null. The Instahyre `job_search` API exposes no posting date on
   * either the list or the detail payload — see url-reference.md. Kept in the
   * shape because the portal-skill contract requires the key to be present
   * with a null value rather than omitted.
   */
  date: string | null
  url: string
  keywords: string[]
}

export interface JobDetail extends JobCard {
  description: string | null
  minExperience: number | null
  maxExperience: number | null
  applyUrl: string | null
}

function asString(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null
  if (typeof v === "number") return String(v)
  return null
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

function decodeHtmlEntities(text: string): string {
  const cp = (n: number): string => (n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "")
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => cp(parseInt(d, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, h) => cp(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ")
}

/**
 * Job descriptions come back as an HTML fragment. Strip tags to readable text
 * while preserving paragraph and list breaks.
 */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  return decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, ""))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[ \t]+/gm, "")
    .trim()
}

/**
 * Reshape one raw API object into a JobCard. Returns null when the object has
 * no usable id/title, so one malformed record cannot break the rest.
 */
export function parseJobCard(raw: unknown): JobCard | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>

  const id = asString(o.id)
  if (!id) return null
  const title = asString(o.title) ?? asString(o.candidate_title)
  if (!title) return null

  const employer = (o.employer && typeof o.employer === "object" ? o.employer : {}) as Record<
    string,
    unknown
  >

  const keywords = Array.isArray(o.keywords)
    ? o.keywords.map((k) => asString(k)).filter((k): k is string => k !== null)
    : []

  return {
    id,
    title,
    company: asString(employer.company_name),
    companyTagline: asString(employer.company_tagline),
    employeeCount: asNumber(employer.employee_count),
    location: asString(o.locations),
    date: null,
    url: asString(o.public_url) ?? jobUrl(id),
    keywords,
  }
}

/** Reshape the `objects` array, skipping records that fail to parse. */
export function parseJobCards(envelope: Envelope | null): JobCard[] {
  const objects = Array.isArray(envelope?.objects) ? envelope.objects : []
  const out: JobCard[] = []
  for (const raw of objects) {
    try {
      const card = parseJobCard(raw)
      if (card) out.push(card)
    } catch {
      // Skip an unparseable record rather than failing the whole page.
    }
  }
  return out
}

/** Reshape a single posting into a JobDetail. */
export function parseJobDetail(raw: unknown): JobDetail | null {
  const card = parseJobCard(raw)
  if (!card) return null
  const o = raw as Record<string, unknown>

  const descRaw =
    asString(o.description) ?? asString(o.job_description) ?? asString(o.requirements)

  return {
    ...card,
    description: descRaw ? htmlToText(descRaw) : null,
    minExperience: asNumber(o.min_experience),
    maxExperience: asNumber(o.max_experience),
    applyUrl: card.url,
  }
}

/**
 * Client-side location filter.
 *
 * The API has no server-side location parameter (see url-reference.md — every
 * candidate name was probed and silently ignored), so `--location` is applied
 * here against each result's `locations` string. This narrows the page that was
 * fetched; it does not ask the server for more matches, so a narrow location
 * with a small `--limit` can legitimately return fewer rows than the limit.
 */
export function matchesLocation(job: JobCard, location: string): boolean {
  const want = location.trim().toLowerCase()
  if (!want) return true
  const have = (job.location ?? "").toLowerCase()
  // "Bengaluru" and "Bangalore" are the same city and both appear in the wild.
  const aliases: Record<string, string[]> = {
    bangalore: ["bangalore", "bengaluru"],
    bengaluru: ["bangalore", "bengaluru"],
    gurgaon: ["gurgaon", "gurugram"],
    gurugram: ["gurgaon", "gurugram"],
    remote: ["remote", "work from home", "anywhere"],
  }
  const needles = aliases[want] ?? [want]
  return needles.some((n) => have.includes(n))
}

/**
 * Job-function facet ids observed on the live API's `top_job_functions_count`
 * facet block. Passed through as `job_functions=<id>`; unknown values are sent
 * verbatim so a numeric id always works.
 */
export const JOB_FUNCTIONS: Record<string, string> = {
  "full-stack": "1",
  fullstack: "1",
  "data-science": "9",
  ml: "9",
  "machine-learning": "9",
  backend: "10",
  "other-software": "76",
}

export function resolveJobFunction(input: string): string {
  const key = input.trim().toLowerCase()
  return JOB_FUNCTIONS[key] ?? input.trim()
}
