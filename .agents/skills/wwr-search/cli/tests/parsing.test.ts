// Offline tests against real HTML captured from We Work Remotely on 2026-08-25.
// The fixtures are verbatim slices of live responses — see tests/fixtures/README.md.

import { describe, expect, test } from "bun:test"
import { join } from "path"
import { readFileSync } from "fs"
import { parseJobCards, parseJobDetail, parseChips, sidebarRow, sidebarRowChips } from "../src/helpers.js"

const fixture = (name: string): string =>
  readFileSync(join(import.meta.dir, "fixtures", name), "utf-8")

const SEARCH = fixture("search-ai-engineer.html")
const DETAIL_ANYWHERE = fixture("detail-anywhere.html")
const DETAIL_GEOLOCKED = fixture("detail-geolocked-us.html")
const TODAY = new Date("2026-08-25T00:00:00Z")

describe("parseJobCards", () => {
  const { cards, adsSkipped } = parseJobCards(SEARCH, TODAY)

  test("skips sponsored listing-ad slots and counts them", () => {
    expect(adsSkipped).toBe(1)
    expect(cards.length).toBe(6)
  })

  test("core fields come through populated, not as HTML fragments", () => {
    for (const c of cards) {
      expect(c.id).toMatch(/^[a-z0-9-]+$/)
      expect(c.title.length).toBeGreaterThan(3)
      expect(c.title).not.toContain("<")
      expect(c.url.startsWith("https://weworkremotely.com/remote-jobs/")).toBe(true)
    }
  })

  test("the US-tagged card is gated-elsewhere at FLAG strength", () => {
    const c = cards.find((x) => x.id.startsWith("sinclair-broadcast-group"))!
    expect(c.title).toBe("Sr. Principal Data Engineer / Data Architect")
    expect(c.company).toBe("Sinclair Broadcast Group")
    expect(c.location).toBe("Austin, TX, United States")
    expect(c.jobType).toBe("Full-Time")
    expect(c.eligibility.class).toBe("gated-elsewhere")
    expect(c.eligibility.gateVerdict).toBe("flag")
    expect(c.eligibility.scope).toBe("🇺🇸 United States of America")
    expect(c.date).toBe("2026-08-05")
    expect(c.postedRelative).toBe("20d")
  })

  test("the 'Anywhere in the World' card passes the gate", () => {
    const c = cards.find((x) => x.id.startsWith("a-team"))!
    expect(c.eligibility.class).toBe("worldwide")
    expect(c.eligibility.gateVerdict).toBe("pass")
  })

  test("the 'North America Only' card is a stated restriction (FAIL)", () => {
    const c = cards.find((x) => x.id.startsWith("toptal-senior-software-engineer"))!
    expect(c.eligibility.class).toBe("gated-elsewhere")
    expect(c.eligibility.gateVerdict).toBe("fail")
  })

  test("a card with no geographic chip is unknown, not eligible", () => {
    const c = cards.find((x) => x.id.startsWith("capslock"))!
    expect(c.eligibility.class).toBe("unknown")
    expect(c.eligibility.scope).toBeNull()
  })

  test("a published salary range is captured verbatim and not mistaken for geography", () => {
    const c = cards.find((x) => x.id.startsWith("collaboration-ai"))!
    expect(c.salary).toBe("$100,000 or more USD")
    expect(c.eligibility.raw).toEqual(["🇺🇸 United States of America"])
  })

  test("the 76-country lemon.io card lists Indonesia but not India — still gated", () => {
    const c = cards.find((x) => x.id.startsWith("lemon-io"))!
    expect(c.eligibility.raw.some((r) => r.includes("Indonesia"))).toBe(true)
    expect(c.eligibility.class).toBe("gated-elsewhere")
    expect(c.eligibility.indiaCovered).toBe(false)
  })

  test("listings without salary report null rather than an empty string", () => {
    const c = cards.find((x) => x.id.startsWith("capslock"))!
    expect(c.salary).toBeNull()
  })

  test("parseChips returns decoded chip text", () => {
    expect(parseChips(SEARCH).length).toBeGreaterThan(5)
  })

  test("one malformed card is skipped without taking the rest of the page down", () => {
    // String.replace hits only the first occurrence, so exactly one card loses
    // its title anchor — the other five must still parse.
    const broken = SEARCH.replace("new-listing__header__title__text", "mangled-anchor")
    const { cards: partial } = parseJobCards(broken, TODAY)
    expect(partial.length).toBe(cards.length - 1)
    expect(partial.some((c) => c.id.startsWith("sinclair"))).toBe(false)
    expect(() => parseJobCards("<html><body>not a results page</body></html>")).not.toThrow()
    expect(parseJobCards("").cards).toEqual([])
  })
})

describe("parseJobDetail — worldwide posting", () => {
  const job = parseJobDetail(DETAIL_ANYWHERE, "a-team-senior-independent-ai-engineer-architect", TODAY)

  test("reads the sidebar's verbatim Region row", () => {
    expect(sidebarRowChips(DETAIL_ANYWHERE, "Region")).toEqual(["Anywhere in the World"])
    expect(job.eligibility.scope).toBe("Anywhere in the World")
  })

  test("applicantLocationRequirements includes IN, so the gate passes", () => {
    expect(job.applicantCountries.length).toBe(249)
    expect(job.applicantCountries).toContain("IN")
    expect(job.eligibility.class).toBe("worldwide")
    expect(job.eligibility.gateVerdict).toBe("pass")
    expect(job.geoLocked).toBe(false)
  })

  test("a re-posted listing's stale JSON-LD date is flagged, not silently trusted", () => {
    expect(job.datePostedJsonLd).toBe("2024-06-16")
    expect(job.postedRelative).toBe("19 days ago")
    expect(job.dateConflict).toContain("disagrees")
    expect(job.date).toBe("2026-08-06") // the page's own relative age wins
  })

  test("description is readable text, not markup", () => {
    expect(job.description).toBeTruthy()
    expect(job.description).not.toContain("<p>")
    expect(job.description!.length).toBeGreaterThan(100)
  })

  test("apply deadline and job type come off the sidebar", () => {
    expect(job.applyBefore).toBe("Sep 4th, 2026")
    expect(job.jobType).toContain("Contract")
  })
})

describe("parseJobDetail — GeoLocked US posting", () => {
  const job = parseJobDetail(DETAIL_GEOLOCKED, "sinclair-broadcast-group-sr-principal-data-engineer-data-architect", TODAY)

  test("the GeoLocked country row upgrades the card-level FLAG to a verified FAIL", () => {
    expect(job.geoLocked).toBe(true)
    expect(job.applicantCountries).toEqual(["US"])
    expect(job.eligibility.class).toBe("gated-elsewhere")
    expect(job.eligibility.gateVerdict).toBe("fail")
    expect(job.eligibility.reason).toContain("India is not among them")
  })

  test("the stated scope is still quoted in WWR's own words", () => {
    expect(job.eligibility.scope).toBe("🇺🇸 United States of America")
  })

  test("JSON-LD datePosted agrees with the page here, so no conflict is raised", () => {
    expect(job.datePostedJsonLd).toBe("2026-08-04")
    expect(job.dateConflict).toBeNull()
    expect(job.date).toBe("2026-08-04")
    expect(job.datePrecision).toBe("exact")
  })

  test("sidebarRow reads a single labelled row", () => {
    expect(sidebarRow(DETAIL_GEOLOCKED, "Posted on")).toBe("20 days ago")
  })
})
