// Posting-age parsing for We Work Remotely.
//
// WWR never publishes an absolute posting date on a *search card*. It prints a
// compact relative badge ("20d", "3h", occasionally "30d+"). The detail page is
// richer: it carries a schema.org JobPosting block with an absolute
// `datePosted`, plus a prose "Posted on N days ago" line.
//
// Everything here is about being explicit rather than confident: a relative
// badge converted to a calendar date is an ESTIMATE with day granularity, and a
// "+" suffix is a FLOOR (the posting is *at least* that old), never a date.

export type DatePrecision =
  | "exact" // absolute date published by the portal (detail page JSON-LD)
  | "day" // derived from an hour/day badge — accurate to about a day
  | "approx" // derived from a week/month/year badge — coarse
  | "floor" // "30d+" — the real date is this one OR OLDER

export interface RelativeAge {
  /** The badge exactly as WWR printed it, e.g. "20d", "30d+". */
  raw: string
  /** Age in whole days. For a floor badge this is the MINIMUM age. */
  days: number
  /** True when the badge is a ceiling marker ("30d+") and `days` is a floor. */
  isFloor: boolean
  precision: DatePrecision
}

/**
 * Parse a WWR relative-age badge.
 *
 * Accepts the compact card form ("20d", "3h", "2w", "1mo", "30d+") and the
 * prose detail form ("20 days ago", "about 3 hours ago").
 * Returns null when the string is not an age at all — callers must then emit
 * `date: null`, never a guess.
 */
export function parseRelativeAge(input: string | null | undefined): RelativeAge | null {
  if (!input) return null
  const raw = input.trim()
  if (!raw) return null

  const m = raw
    .toLowerCase()
    .match(/^(?:about\s+)?(\d+)\s*(h|hr|hrs|hour|hours|d|day|days|w|wk|week|weeks|mo|month|months|y|yr|year|years)\s*(\+)?\s*(?:ago)?$/)
  if (!m) return null

  const n = parseInt(m[1], 10)
  if (!Number.isFinite(n) || n < 0) return null
  const unit = m[2]
  const isFloor = m[3] === "+"

  let days: number
  let precision: DatePrecision
  if (/^h/.test(unit)) {
    days = 0
    precision = "day"
  } else if (/^d/.test(unit)) {
    days = n
    precision = "day"
  } else if (/^w/.test(unit)) {
    days = n * 7
    precision = "approx"
  } else if (/^mo|^month/.test(unit)) {
    days = n * 30
    precision = "approx"
  } else {
    days = n * 365
    precision = "approx"
  }

  return { raw, days, isFloor, precision: isFloor ? "floor" : precision }
}

/** `today` minus `days`, as an ISO `YYYY-MM-DD` string (UTC arithmetic). */
export function isoDaysAgo(days: number, today: Date = new Date()): string {
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const d = new Date(t - days * 86_400_000)
  return d.toISOString().slice(0, 10)
}

/**
 * Normalise WWR's JSON-LD `datePosted` ("2026-08-04 20:13:58 UTC") to an ISO
 * date. Returns null for anything unparseable rather than inventing one.
 */
export function isoFromJsonLdDate(value: string | null | undefined): string | null {
  if (!value) return null
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

export interface DateInfo {
  /** ISO `YYYY-MM-DD`, or null when the portal said nothing usable. */
  date: string | null
  /** How much to trust `date`. `floor` means "this date or earlier". */
  precision: DatePrecision | null
  /** The portal's own relative string, verbatim. */
  postedRelative: string | null
  ageDays: number | null
  /** True when `ageDays` is a lower bound ("30d+"), not a measurement. */
  ageIsFloor: boolean
}

/** Build a DateInfo from a card badge alone (search results). */
export function dateFromBadge(badge: string | null, today: Date = new Date()): DateInfo {
  const age = parseRelativeAge(badge)
  if (!age) {
    return { date: null, precision: null, postedRelative: badge ?? null, ageDays: null, ageIsFloor: false }
  }
  return {
    date: isoDaysAgo(age.days, today),
    precision: age.precision,
    postedRelative: age.raw,
    ageDays: age.days,
    ageIsFloor: age.isFloor,
  }
}
