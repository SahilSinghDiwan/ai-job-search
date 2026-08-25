import { describe, expect, test } from "bun:test"
import { join } from "path"
import { readFileSync } from "fs"
import { parseJobCards } from "../src/helpers.js"
import { applyEligibilityFilter, buildUrl, compactScope, dedupeCards, summaryLine } from "../src/commands/search.js"

const SEARCH = readFileSync(join(import.meta.dir, "fixtures", "search-ai-engineer.html"), "utf-8")
const TODAY = new Date("2026-08-25T00:00:00Z")
const CARDS = parseJobCards(SEARCH, TODAY).cards

const base = {
  countries: [] as string[],
  page: 1,
  includeGated: false,
  eligibleOnly: false,
  format: "json" as const,
}

describe("buildUrl", () => {
  test("maps --query to WWR's term parameter", () => {
    expect(buildUrl({ ...base, query: "AI engineer" })).toBe(
      "https://weworkremotely.com/remote-jobs/search?term=AI+engineer",
    )
  })

  test("repeats country[] for each ISO code and upper-cases them", () => {
    const url = buildUrl({ ...base, query: "AI", countries: ["in", "sg"] })
    expect(url).toContain("country%5B%5D=IN")
    expect(url).toContain("country%5B%5D=SG")
  })

  test("passes the salary facet through verbatim", () => {
    expect(buildUrl({ ...base, salaryRange: "$100,000 or more USD" })).toContain("salary_range%5B%5D=")
  })
})

describe("applyEligibilityFilter", () => {
  test("drops gated-elsewhere by default and keeps unknown", () => {
    const { kept, report } = applyEligibilityFilter(CARDS, { includeGated: false, eligibleOnly: false })
    expect(report.counts["gated-elsewhere"]).toBe(4)
    expect(report.counts.worldwide).toBe(1)
    expect(report.counts.unknown).toBe(1)
    expect(report.filtered.total).toBe(4)
    expect(kept.map((c) => c.eligibility.class).sort()).toEqual(["unknown", "worldwide"])
  })

  test("splits the filtered count by gate verdict, so FLAGs stay visible as recoverable", () => {
    const { report } = applyEligibilityFilter(CARDS, { includeGated: false, eligibleOnly: false })
    expect(report.filtered.byVerdict.fail).toBe(1) // "North America Only"
    expect(report.filtered.byVerdict.flag).toBe(3) // bare country tags
  })

  test("reports the verbatim scopes that were dropped", () => {
    const { report } = applyEligibilityFilter(CARDS, { includeGated: false, eligibleOnly: false })
    expect(report.filtered.byScope["🇺🇸 United States of America"]).toBe(2)
    expect(report.filtered.byScope["North America Only"]).toBe(1)
  })

  test("--include-gated keeps everything and filters nothing", () => {
    const { kept, report } = applyEligibilityFilter(CARDS, { includeGated: true, eligibleOnly: false })
    expect(kept.length).toBe(CARDS.length)
    expect(report.filtered.total).toBe(0)
    expect(report.mode).toBe("include-gated")
  })

  test("--eligible-only additionally drops scope-unstated listings", () => {
    const { kept, report } = applyEligibilityFilter(CARDS, { includeGated: false, eligibleOnly: true })
    expect(kept.every((c) => c.eligibility.indiaCovered)).toBe(true)
    expect(report.filtered.byScope["(no scope stated)"]).toBe(1)
  })
})

describe("summaryLine", () => {
  test("teaches what was dropped and why, with counts", () => {
    const { kept, report } = applyEligibilityFilter(CARDS, { includeGated: false, eligibleOnly: false })
    const line = summaryLine(kept.length, report)
    expect(line).toContain("2 shown")
    expect(line).toContain("4 filtered out as gated elsewhere")
    expect(line).toContain("--include-gated")
    expect(line).toContain("United States of America")
  })

  test("says so plainly when nothing was filtered", () => {
    const { report } = applyEligibilityFilter(CARDS, { includeGated: true, eligibleOnly: false })
    expect(summaryLine(CARDS.length, report)).toContain("nothing filtered on eligibility")
  })
})

describe("dedupeCards", () => {
  test("collapses re-posted duplicates and records the slugs it folded in", () => {
    const dup = [...CARDS, { ...CARDS[0], id: `${CARDS[0].id}-1` }]
    const { unique, collapsed } = dedupeCards(dup)
    expect(collapsed).toBe(1)
    expect(unique.length).toBe(CARDS.length)
    const canonical = unique.find((c) => c.id === CARDS[0].id)!
    expect(canonical.duplicateIds).toEqual([`${CARDS[0].id}-1`])
  })

  test("does not merge two same-titled reqs whose stated scope differs", () => {
    const variant = {
      ...CARDS[0],
      id: "same-role-different-region",
      eligibility: { ...CARDS[0].eligibility, scope: "Anywhere in the World" },
    }
    const { collapsed } = dedupeCards([CARDS[0], variant])
    expect(collapsed).toBe(0)
  })
})

describe("compactScope", () => {
  test("leaves short scopes verbatim", () => {
    expect(compactScope("North America Only")).toBe("North America Only")
    expect(compactScope(null)).toBe("(no scope stated)")
  })

  test("summarises a 76-country enumeration instead of printing all of it", () => {
    const long = Array.from({ length: 76 }, (_, i) => `Country ${i}`).join(", ")
    expect(compactScope(long)).toBe("Country 0, Country 1, Country 2 +73 more")
  })
})
