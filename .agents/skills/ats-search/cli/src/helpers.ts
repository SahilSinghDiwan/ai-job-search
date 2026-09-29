// Shared plumbing for ats-search: HTTP with polite backoff, the normalized job
// shape every provider maps onto, and small text utilities.
//
// Data sources are three unauthenticated ATS job-board APIs (Greenhouse, Ashby,
// Lever). All reads are JSON — there is no markup to parse and no login wall.
//
// HOST POLICY (see url-reference.md; re-verified 2026-08-25):
//   boards-api.greenhouse.io  robots.txt: `User-agent: *` / `Disallow: /embed/` only.
//   api.ashbyhq.com           robots.txt itself returns HTTP 401 (an auth wall on
//                             that route, not a policy statement); the documented
//                             posting-api path answers unauthenticated.
//   api.lever.co              robots.txt: `Allow: /`, `Crawl-delay: 1` — honored
//                             by DEFAULT_DELAY_MS below.
//   jobs.lever.co             robots.txt names `ClaudeBot: Disallow: /`.
//                             THIS CLI MUST NEVER FETCH jobs.lever.co. Lever's
//                             `hostedUrl` is emitted as a link for a human to
//                             click; it is never requested. Same for
//                             job-boards.greenhouse.io and jobs.ashbyhq.com —
//                             those URLs are output, not input.

export const DEFAULT_DELAY_MS = 1100

export type Provider = "greenhouse" | "ashby" | "lever"

export const PROVIDERS: Provider[] = ["greenhouse", "ashby", "lever"]

export function isProvider(v: string): v is Provider {
  return (PROVIDERS as string[]).includes(v)
}

/** The portal-skill contract's result shape, plus ATS-specific extras. */
export interface Job {
  /** Stable composite key: `<provider>:<slug>:<providerJobId>`. */
  id: string
  title: string
  company: string | null
  location: string | null
  /** Posting date, ISO `YYYY-MM-DD`. Real per-provider dates — see each mapper. */
  date: string | null
  url: string
  provider: Provider
  companySlug: string
  /** Provider's own job id, without the composite prefix. */
  jobId: string
  /** True/false when the provider states it; null when it says nothing. */
  remote: boolean | null
  /** Provider's own words: "Remote", "Hybrid", "On-Site", "Unspecified", ... */
  workplaceType: string | null
  department: string | null
  employmentType: string | null
  /** Present only when the description was fetched (`--content` / `detail`). */
  description?: string | null
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

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/**
 * GET JSON from an ATS API. Retries 429/5xx with exponential backoff plus
 * jitter; returns `null` on 404 (an unknown board token) rather than throwing,
 * so one bad slug in the company list cannot abort a whole run.
 */
export async function apiGet(url: string): Promise<unknown | null> {
  const maxRetries = 6
  let delay = 1000

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response: Response
    try {
      response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
      })
    } catch (e) {
      throw new Error(
        `could not reach ${hostOf(url)} (${e instanceof Error ? e.message : String(e)})`,
      )
    }

    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(
          `${hostOf(url)} request failed: ${response.status} ${response.statusText}` +
            (response.status === 429 ? " — rate limited; wait a few minutes and retry" : ""),
        )
      }
      await sleep(delay + Math.floor(Math.random() * 500))
      delay = Math.min(delay * 2, 16000)
      continue
    }
    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(`${hostOf(url)} request failed: ${response.status} ${response.statusText}`)
    }

    const body = await response.json().catch(() => null)
    if (body === null) throw new Error(`${hostOf(url)} returned an unparseable response body`)
    return body
  }
  throw new Error(`${hostOf(url)} request failed after retries`)
}

export function asString(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null
  if (typeof v === "number") return String(v)
  return null
}

/**
 * Normalize any provider timestamp to an ISO `YYYY-MM-DD`.
 * Accepts ISO-8601 strings (Greenhouse, Ashby) and epoch milliseconds (Lever).
 * Returns null on anything unparseable — never a guessed date.
 */
export function toIsoDate(v: unknown): string | null {
  if (v === null || v === undefined) return null
  let d: Date
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v <= 0) return null
    d = new Date(v)
  } else if (typeof v === "string") {
    const s = v.trim()
    if (!s) return null
    d = new Date(s)
  } else {
    return null
  }
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

export function daysBetween(iso: string, today: string): number | null {
  const a = Date.parse(iso + "T00:00:00Z")
  const b = Date.parse(today + "T00:00:00Z")
  if (isNaN(a) || isNaN(b)) return null
  return Math.round((b - a) / 86400000)
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function decodeHtmlEntities(text: string): string {
  const cp = (n: number): string => (n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "")
  return text
    .replace(/&#(\d+);/g, (_, d) => cp(parseInt(d, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, h) => cp(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
}

/** Bullet marker used when flattening HTML lists to text. */
const BULLET = "\n- "

/**
 * Strip an HTML description to readable text, preserving paragraph and list
 * breaks. Greenhouse double-encodes its `content` field (`&lt;p&gt;`), so
 * entities are decoded first, then again after tag stripping.
 */
export function htmlToText(html: string): string {
  const once = decodeHtmlEntities(html)
  const withBreaks = once
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, BULLET)
    .replace(/<\/(p|li|ul|ol|div|h\d|section)>/gi, "\n")
  return decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, ""))
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/^[ \t]+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Does `job` look remote-eligible, from whatever the provider told us? */
export function looksRemote(job: Job): boolean {
  if (job.remote === true) return true
  const wt = (job.workplaceType ?? "").toLowerCase()
  if (wt.includes("remote")) return true
  return /\bremote\b|work from home|anywhere/i.test(job.location ?? "")
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Case-insensitive keyword match over title, department, location and (when
 * fetched) description.
 *
 * Anchored at a word boundary on the LEFT only. Plain substring matching made
 * short acronyms useless — `-q "AI"` matched "chennai" on a live run — while a
 * boundary on both ends would drop "LLMs" for `-q "LLM"`. Left-anchored keeps
 * both: "LLM" finds "LLMs", "AI" does not find "chennai".
 */
export function matchesQuery(job: Job, query: string): boolean {
  const q = query.trim()
  if (!q) return true
  const hay = [job.title, job.department, job.location, job.description ?? ""]
    .filter(Boolean)
    .join("   ")
  return new RegExp(`\\b${escapeRegex(q)}`, "i").test(hay)
}

const LOCATION_ALIASES: Record<string, string[]> = {
  bangalore: ["bangalore", "bengaluru"],
  bengaluru: ["bangalore", "bengaluru"],
  gurgaon: ["gurgaon", "gurugram"],
  gurugram: ["gurgaon", "gurugram"],
  remote: ["remote", "work from home", "anywhere"],
}

/** Case-insensitive location match, with the India city-name aliases. */
export function matchesLocation(job: Job, location: string): boolean {
  const want = location.trim().toLowerCase()
  if (!want) return true
  const have = `${job.location ?? ""} ${job.workplaceType ?? ""}`.toLowerCase()
  const needles = LOCATION_ALIASES[want] ?? [want]
  return needles.some((n) => have.includes(n))
}
