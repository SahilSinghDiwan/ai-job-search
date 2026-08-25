// Geographic-eligibility classification — the reason this skill exists.
//
// Portal research finding that governs this whole file (see
// .claude/skills/job-scraper/portal-research.md, "Biggest surprise"): a remote
// board's own location filter returned ~20 India-filtered results of which only
// 2 were genuinely India-eligible. A filter that is wrong nine times out of ten
// is worse than no filter, because it manufactures confidence. So this CLI
// never trusts a filter parameter: it re-reads the geographic scope each
// listing states in its own text and classifies on that.
//
// Two rules are non-negotiable:
//
//  1. A listing that does not state its scope is `unknown`. It is never guessed
//     into "eligible" and never guessed into "excluded".
//  2. The distinction between a bare country TAG and an explicit RESTRICTION is
//     preserved, because `.claude/skills/job-application-assistant/04-job-evaluation.md`
//     scores them differently: a bare country tag is a FLAG (score it, name the
//     open question), while a stated residency requirement is a FAIL (hard
//     stop). Collapsing the two would either delete roles the candidate wants
//     to see, or waste his time on roles he cannot hold.

/** What the listing's own words say about who may hold the job. */
export type EligibilityClass =
  | "india-eligible" // India named, or a region that contains India
  | "worldwide" // "Anywhere in the World"
  | "gated-elsewhere" // a scope is stated and India is not in it
  | "unknown" // the listing states no scope at all

/** Verdict in the vocabulary of 04-job-evaluation.md's remote eligibility gate. */
export type GateVerdict = "pass" | "flag" | "fail"

/** How the scope was expressed — this is what keeps tag and requirement apart. */
export type RestrictionKind =
  | "worldwide" // explicitly open to everyone
  | "explicit-region-restriction" // "North America Only" — a stated requirement
  | "applicant-location-list" // schema.org applicantLocationRequirements (detail pages)
  | "country-tag" // bare country chips, no "only" wording
  | "none-stated" // nothing said

export interface Eligibility {
  /** Every geographic chip, verbatim, exactly as WWR printed it. */
  raw: string[]
  /** The same chips joined for display, or null when the listing said nothing. */
  scope: string | null
  class: EligibilityClass
  gateVerdict: GateVerdict
  restriction: RestrictionKind
  /** Plain-English why, safe to print straight into a report. */
  reason: string
  /** True only when India is affirmatively covered. Never inferred. */
  indiaCovered: boolean
}

const WORLDWIDE = /^(anywhere in the world|worldwide|anywhere)$/i

/**
 * Regions whose plain meaning includes India. Deliberately short: a region is
 * only listed here when India is unambiguously inside it. EMEA, for instance,
 * is Europe/Middle East/Africa and does NOT include India, so it is absent.
 */
const INDIA_INCLUSIVE_REGIONS = [
  "asia only",
  "asia pacific only",
  "asia-pacific only",
  "apac only",
  "south asia only",
]

/** Chips that are decoration or metadata, not geography. */
const NON_GEO_EXACT = new Set(
  [
    "full-time",
    "part-time",
    "full-time/part-time",
    "contract",
    "freelance",
    "internship",
    "temporary",
    "featured",
    "boosted",
    "top 100",
    "hot",
    "remote",
    "new",
  ].map((s) => s.toLowerCase()),
)

/** Leading regional-indicator pair, e.g. the flag in "🇺🇸 United States of America". */
const FLAG_RE = /^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u

/** India's flag, matched as a code point pair so "Indonesia" can never match it. */
const INDIA_FLAG = "\u{1F1EE}\u{1F1F3}"

/** True when the chip looks like a published salary rather than a place. */
export function isSalaryChip(chip: string): boolean {
  const c = chip.trim()
  return /\$|USD|EUR|GBP|₹|\/hr|\bk\+/i.test(c)
}

/** True when the chip states geography (a flag country, an "… Only" region, or worldwide). */
export function isGeoChip(chip: string): boolean {
  const c = chip.trim()
  if (!c) return false
  if (NON_GEO_EXACT.has(c.toLowerCase())) return false
  if (isSalaryChip(c)) return false
  if (FLAG_RE.test(c)) return true
  if (WORLDWIDE.test(c)) return true
  return /\bonly$/i.test(c)
}

/** Strip the flag emoji, leaving the country name as WWR spells it. */
export function countryName(chip: string): string {
  return chip.replace(FLAG_RE, "").trim()
}

/**
 * Does this single chip cover India? Matched on the flag code points or on an
 * exact country name — never a substring, because "Indonesia" and "British
 * Indian Ocean Territory" both contain "India" and neither is India.
 */
export function chipCoversIndia(chip: string): boolean {
  const c = chip.trim()
  if (c.includes(INDIA_FLAG)) return true
  const name = countryName(c).toLowerCase()
  if (name === "india") return true
  return INDIA_INCLUSIVE_REGIONS.includes(name)
}

function join(chips: string[]): string | null {
  return chips.length ? chips.join(", ") : null
}

/**
 * Classify a listing from the geographic chips printed on its search card.
 *
 * Card-level evidence is a cheap proxy: WWR prints the scope but not whether it
 * is enforced. `classifyFromCountryCodes` (detail pages) is the authoritative
 * version — see SKILL.md's "Upgrade a FLAG to a verdict" section.
 */
export function classifyFromChips(chips: string[]): Eligibility {
  const geo = chips.map((c) => c.trim()).filter(isGeoChip)

  if (geo.length === 0) {
    return {
      raw: [],
      scope: null,
      class: "unknown",
      gateVerdict: "flag",
      restriction: "none-stated",
      reason: "listing states no geographic scope — unverified, not assumed either way",
      indiaCovered: false,
    }
  }

  const worldwide = geo.find((c) => WORLDWIDE.test(c))
  if (worldwide) {
    return {
      raw: geo,
      scope: join(geo),
      class: "worldwide",
      gateVerdict: "pass",
      restriction: "worldwide",
      reason: `open worldwide ("${worldwide}")`,
      indiaCovered: true,
    }
  }

  const indiaChip = geo.find(chipCoversIndia)
  if (indiaChip) {
    return {
      raw: geo,
      scope: join(geo),
      class: "india-eligible",
      gateVerdict: "pass",
      restriction: /\bonly$/i.test(indiaChip) ? "explicit-region-restriction" : "country-tag",
      reason: `India is inside the stated scope ("${indiaChip}")`,
      indiaCovered: true,
    }
  }

  const onlyChip = geo.find((c) => /\bonly$/i.test(c))
  if (onlyChip) {
    return {
      raw: geo,
      scope: join(geo),
      class: "gated-elsewhere",
      gateVerdict: "fail",
      restriction: "explicit-region-restriction",
      // "… Only" is a stated requirement, not a tag — 04-job-evaluation.md calls this a FAIL.
      reason: `restricted to a region that excludes India ("${onlyChip}")`,
      indiaCovered: false,
    }
  }

  return {
    raw: geo,
    scope: join(geo),
    class: "gated-elsewhere",
    gateVerdict: "flag",
    restriction: "country-tag",
    // Bare country tags are a FLAG per 04-job-evaluation.md: the tag may be an
    // entity/ATS artefact rather than a residency requirement. Run `detail` to
    // resolve it.
    reason: `country tag(s) that do not include India (${geo.map(countryName).join(", ")}) — a tag, not a stated residency requirement; run \`detail\` to confirm`,
    indiaCovered: false,
  }
}

/**
 * Classify from a detail page's schema.org `applicantLocationRequirements`
 * (ISO 3166-1 alpha-2 codes) plus WWR's own "GeoLocked" marker.
 *
 * This is the authoritative signal: it is the machine-readable statement of who
 * may apply, so an exclusion here is a stated requirement (FAIL), not a tag.
 */
export function classifyFromCountryCodes(
  codes: string[],
  opts: { geoLocked: boolean; chips?: string[] } = { geoLocked: false },
): Eligibility {
  if (codes.length === 0) return classifyFromChips(opts.chips ?? [])

  const upper = codes.map((c) => c.trim().toUpperCase())
  const scope =
    upper.length > 12 ? `${upper.length} countries listed` : upper.join(", ")

  if (upper.includes("IN")) {
    // A very long list is WWR's encoding of "anywhere"; a short one that still
    // names IN is a genuine India-inclusive gate. Both pass, and the class says
    // which, so /rank can tell "open to everyone" from "explicitly includes India".
    const worldwide = upper.length >= 200
    return {
      raw: upper,
      scope,
      class: worldwide ? "worldwide" : "india-eligible",
      gateVerdict: "pass",
      restriction: worldwide ? "worldwide" : "applicant-location-list",
      reason: worldwide
        ? `applicantLocationRequirements lists ${upper.length} countries including IN — effectively worldwide`
        : `applicantLocationRequirements explicitly includes IN (India)`,
      indiaCovered: true,
    }
  }

  return {
    raw: upper,
    scope,
    class: "gated-elsewhere",
    gateVerdict: "fail",
    restriction: "applicant-location-list",
    reason: `applicantLocationRequirements lists ${upper.length} country/countries (${upper.slice(0, 6).join(", ")}${upper.length > 6 ? ", …" : ""}) and India is not among them${opts.geoLocked ? "; WWR marks this posting GeoLocked" : ""}`,
    indiaCovered: false,
  }
}
