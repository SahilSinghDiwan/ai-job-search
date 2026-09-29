// Data source: We Work Remotely's public HTML pages. No authentication, no API.
//
// robots.txt (re-verified 2026-08-25) is fully open — `Allow: /` for every
// user-agent, with only account/admin/manage paths disallowed and no AI-bot
// rule of any kind. See url-reference.md for the file as found.
//
// Parsing is chunked regex over shallow, stable markup, matching the repo's
// zero-dependency convention (linkedin-search does the same). Each listing is
// parsed independently so one malformed card cannot break the rest.

import { classifyFromChips, classifyFromCountryCodes, isSalaryChip, isGeoChip, type Eligibility } from "./eligibility.js"
import { dateFromBadge, isoFromJsonLdDate, parseRelativeAge, type DateInfo } from "./dates.js"

export const BASE = "https://weworkremotely.com"
export const SEARCH_URL = `${BASE}/remote-jobs/search`

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

export function writeWarning(message: string): void {
  process.stderr.write(`warning: ${message}\n`)
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/** Cloudflare's interactive-challenge interstitial, which WWR does not currently serve. */
export function looksChallenged(html: string): boolean {
  return /<title>Just a moment/i.test(html) || /challenges\.cloudflare\.com/.test(html)
}

/**
 * Fetch HTML with exponential backoff on 429/5xx. Returns "" on 404.
 *
 * If the site ever answers with a bot challenge, this throws CHALLENGED and the
 * CLI reports it. That is deliberate and must stay that way: no challenge
 * solving, no fingerprint spoofing, no retry-until-it-works. A challenge is the
 * operator saying no, and the correct response is to stop and tell the user.
 */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 5
  let delay = 800
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      await new Promise((r) => setTimeout(r, delay + Math.floor(Math.random() * 500)))
      delay = Math.min(delay * 2, 10000)
      continue
    }
    if (response.status === 404) return ""
    if (response.status === 403) {
      const body = await response.text()
      if (looksChallenged(body)) {
        throw new Error(
          "We Work Remotely served a bot challenge instead of the page. Stopping rather than working around it — report the skill as blocked.",
        )
      }
      throw new Error(`Request failed: 403 ${response.statusText}`)
    }
    if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    const body = await response.text()
    if (looksChallenged(body)) {
      throw new Error(
        "We Work Remotely served a bot challenge instead of the page. Stopping rather than working around it — report the skill as blocked.",
      )
    }
    return body
  }
  throw new Error("Request failed after max retries")
}

// ---------------------------------------------------------------- text utils

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => numericEntity(parseInt(d, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, h) => numericEntity(parseInt(h, 16)))
}

export function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

export function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html))
}

// ------------------------------------------------------------------- shapes

export interface JobCard {
  /** WWR's URL slug — stable, human-readable, and what `detail` takes. */
  id: string
  title: string
  company: string | null
  /** The employer's stated HQ. NOT where the candidate may live — see `eligibility`. */
  location: string | null
  /** ISO date estimated from the relative badge; null when WWR printed none. */
  date: string | null
  url: string
  datePrecision: DateInfo["precision"]
  postedRelative: string | null
  ageDays: number | null
  ageIsFloor: boolean
  jobType: string | null
  /** Published salary range, verbatim, or null. Most listings publish none. */
  salary: string | null
  eligibility: Eligibility
  /** Slugs of duplicate re-posts of this same req that were collapsed into it. */
  duplicateIds?: string[]
}

export interface JobDetail extends JobCard {
  description: string | null
  category: string | null
  applyBefore: string | null
  applyUrl: string | null
  /** WWR's own "(This job is GeoLocked)" marker on the Country row. */
  geoLocked: boolean
  /** ISO 3166-1 alpha-2 codes from schema.org applicantLocationRequirements. */
  applicantCountries: string[]
  /** Absolute `datePosted` from JSON-LD. Can predate a re-posted listing — see `dateConflict`. */
  datePostedJsonLd: string | null
  /**
   * Set when JSON-LD `datePosted` and the page's own "Posted on N days ago"
   * disagree by more than a week — observed live on a re-listed posting whose
   * JSON-LD still carried its 2024 first-post date while the page said 19 days.
   */
  dateConflict: string | null
}

// ------------------------------------------------------------------ parsing

/** Pull the text of every `new-listing__categories__category` chip in a card. */
export function parseChips(cardHtml: string): string[] {
  return Array.from(cardHtml.matchAll(/new-listing__categories__category[^>]*>([\s\S]*?)<\/p>/gi))
    .map((m) => clean(m[1]))
    .filter(Boolean)
}

export interface ParseResult {
  cards: JobCard[]
  /** Sponsored `listing-ad` cards skipped — reported in meta so counts add up. */
  adsSkipped: number
}

/**
 * Parse a search-results page into cards.
 *
 * Cards are `<li …class="… new-listing-container …">` elements. Sponsored slots
 * carry `listing-ad` on the same element and are dropped: they are adverts, not
 * search hits, and counting them would inflate every number downstream.
 */
export function parseJobCards(html: string, today: Date = new Date()): ParseResult {
  const cards: JobCard[] = []
  let adsSkipped = 0

  for (const part of html.split("<li ").slice(1)) {
    const end = part.indexOf("</li>")
    const block = end === -1 ? part : part.slice(0, end)
    if (!block.includes("new-listing-container")) continue
    if (/listing-ad|feature--ad/.test(block)) {
      adsSkipped++
      continue
    }

    const href = block.match(/href="(\/remote-jobs\/[^"]+)"/i)
    if (!href) continue
    const path = decodeHtmlEntities(href[1]).split("?")[0]
    const id = path.replace(/^\/remote-jobs\//, "").replace(/\/$/, "")
    if (!id) continue

    const titleM = block.match(/new-listing__header__title__text[^>]*>([\s\S]*?)<\/span>/i)
    const title = titleM ? clean(titleM[1]) : ""
    if (!title) continue

    const companyM = block.match(/new-listing__company-name[^>]*>([\s\S]*?)<\/p>/i)
    const hqM = block.match(/new-listing__company-headquarters[^>]*>([\s\S]*?)<\/p>/i)
    const dateM = block.match(/new-listing__header__icons__date[^>]*>([\s\S]*?)<\/p>/i)

    const chips = parseChips(block)
    const dateInfo = dateFromBadge(dateM ? clean(dateM[1]) : null, today)

    cards.push({
      id,
      title,
      company: companyM ? clean(companyM[1]) || null : null,
      location: hqM ? clean(hqM[1]) || null : null,
      date: dateInfo.date,
      url: `${BASE}${path}`,
      datePrecision: dateInfo.precision,
      postedRelative: dateInfo.postedRelative,
      ageDays: dateInfo.ageDays,
      ageIsFloor: dateInfo.ageIsFloor,
      jobType: chips.find((c) => /^(full-time|part-time|contract|freelance|internship|full-time\/part-time)$/i.test(c)) ?? null,
      salary: chips.find((c) => isSalaryChip(c) && !isGeoChip(c)) ?? null,
      eligibility: classifyFromChips(chips),
    })
  }

  return { cards, adsSkipped }
}

/** Extract and parse the page's schema.org JobPosting block, if present. */
export function parseJsonLd(html: string): Record<string, unknown> | null {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i)
  if (!m) return null
  try {
    // WWR embeds raw newlines and other control characters inside JSON string
    // literals, which JSON.parse rejects outright. Flatten them to spaces before
    // parsing — every field this CLI reads is single-line anyway.
    const cleaned = m[1].replace(/[\u0000-\u001F]/g, " ")
    return JSON.parse(cleaned) as Record<string, unknown>
  } catch {
    return null
  }
}

/** Read one labelled row out of the detail sidebar's "About the job" list. */
export function sidebarRow(html: string, label: string): string | null {
  const re = new RegExp(
    `job-about__list__item[^>]*>\\s*${label}\\s*([\\s\\S]*?)</li>`,
    "i",
  )
  const m = html.match(re)
  return m ? clean(m[1]) || null : null
}

/** Every chip inside one labelled sidebar row (Region / Country carry several). */
export function sidebarRowChips(html: string, label: string): string[] {
  const re = new RegExp(`job-about__list__item[^>]*>\\s*${label}\\s*([\\s\\S]*?)</li>`, "i")
  const m = html.match(re)
  if (!m) return []
  return Array.from(m[1].matchAll(/class="box[^"]*"[^>]*>([\s\S]*?)<\/span>/gi))
    .map((x) => clean(x[1]))
    .filter((s) => s && !/^\(?this job is geolocked\)?$/i.test(s))
}

export function parseJobDetail(html: string, id: string, today: Date = new Date()): JobDetail {
  const ld = parseJsonLd(html) ?? {}
  const str = (k: string): string | null => (typeof ld[k] === "string" ? (ld[k] as string) : null)

  const regionChips = sidebarRowChips(html, "Region")
  const countryChips = sidebarRowChips(html, "Country")
  const geoLocked = /GeoLocked/i.test(html)

  const alr = Array.isArray(ld["applicantLocationRequirements"])
    ? (ld["applicantLocationRequirements"] as Array<Record<string, unknown>>)
        .map((x) => (typeof x?.name === "string" ? x.name : ""))
        .filter(Boolean)
    : []

  const chips = [...regionChips, ...countryChips]
  const eligibility = alr.length
    ? classifyFromCountryCodes(alr, { geoLocked, chips })
    : classifyFromChips(chips)
  // Keep the human-readable scope WWR printed, even when the verdict came from
  // the country-code list — the report should quote the site's own words.
  if (chips.length) eligibility.raw = chips
  if (chips.length) eligibility.scope = chips.join(", ")

  const postedRow = sidebarRow(html, "Posted on")
  const relative = parseRelativeAge(postedRow)
  const jsonLdDate = isoFromJsonLdDate(str("datePosted"))

  let date = jsonLdDate
  let precision: DateInfo["precision"] = jsonLdDate ? "exact" : null
  let dateConflict: string | null = null
  if (relative) {
    const fromBadge = dateFromBadge(postedRow, today)
    if (jsonLdDate && fromBadge.date) {
      const diff = Math.abs(
        (Date.parse(fromBadge.date) - Date.parse(jsonLdDate)) / 86_400_000,
      )
      if (diff > 7) {
        // Seen live: a re-listed posting kept its original 2024 `datePosted`
        // while the page said "19 days ago". Trust the page's own freshness
        // line and say loudly that the two disagree.
        dateConflict = `JSON-LD datePosted ${jsonLdDate} disagrees with the page's "${postedRow}" (${Math.round(diff)} days apart) — the listing was probably re-posted; using the page's relative age`
        date = fromBadge.date
        precision = fromBadge.precision
      }
    } else if (!jsonLdDate) {
      date = fromBadge.date
      precision = fromBadge.precision
    }
  }

  const salaryChip = sidebarRowChips(html, "Salary").find(Boolean) ?? null
  const titleM = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const org = ld["hiringOrganization"] as Record<string, unknown> | undefined

  let description: string | null = null
  const descM = html.match(
    /lis-container__job__content__description[^>]*>([\s\S]*?)(?:<hr class="lis-container__job__content__description__hr"|<\/div>\s*<\/div>)/i,
  )
  const rawDesc = descM ? descM[1] : typeof ld["description"] === "string" ? decodeHtmlEntities(ld["description"] as string) : null
  if (rawDesc) {
    const withBreaks = rawDesc
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
    description = decodeHtmlEntities(stripTags(withBreaks)).replace(/\n{3,}/g, "\n\n").trim() || null
  }

  return {
    id,
    title: str("title") ?? (titleM ? clean(titleM[1]) : "(untitled)"),
    company: (typeof org?.name === "string" ? org.name : null),
    location: (typeof org?.address === "string" ? org.address : null),
    date,
    url: `${BASE}/remote-jobs/${id}`,
    datePrecision: precision,
    postedRelative: postedRow,
    ageDays: relative ? relative.days : null,
    ageIsFloor: relative ? relative.isFloor : false,
    jobType: sidebarRow(html, "Job type") ?? str("employmentType"),
    salary: salaryChip,
    eligibility,
    description,
    category: sidebarRow(html, "Category"),
    applyBefore: sidebarRow(html, "Apply before"),
    applyUrl: str("url") ? decodeHtmlEntities(str("url") as string) : null,
    geoLocked,
    applicantCountries: alr,
    datePostedJsonLd: jsonLdDate,
    dateConflict,
  }
}
