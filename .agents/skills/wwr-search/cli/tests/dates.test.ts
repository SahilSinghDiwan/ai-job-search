import { describe, expect, test } from "bun:test"
import { dateFromBadge, isoDaysAgo, isoFromJsonLdDate, parseRelativeAge } from "../src/dates.js"

const TODAY = new Date("2026-08-25T00:00:00Z")

describe("parseRelativeAge", () => {
  test("parses WWR's compact card badges", () => {
    expect(parseRelativeAge("20d")).toMatchObject({ days: 20, isFloor: false, precision: "day" })
    expect(parseRelativeAge("3h")).toMatchObject({ days: 0, precision: "day" })
    expect(parseRelativeAge("2w")).toMatchObject({ days: 14, precision: "approx" })
  })

  test("parses the detail page's prose form", () => {
    expect(parseRelativeAge("19 days ago")).toMatchObject({ days: 19, precision: "day" })
    expect(parseRelativeAge("about 3 hours ago")).toMatchObject({ days: 0 })
  })

  test("a '+' ceiling is recorded as a floor, not a date", () => {
    const age = parseRelativeAge("30d+")
    expect(age).toMatchObject({ days: 30, isFloor: true, precision: "floor" })
  })

  test("returns null rather than guessing on unparseable input", () => {
    expect(parseRelativeAge("")).toBeNull()
    expect(parseRelativeAge(null)).toBeNull()
    expect(parseRelativeAge("Featured")).toBeNull()
  })
})

describe("date conversion", () => {
  test("isoDaysAgo does calendar arithmetic in UTC", () => {
    expect(isoDaysAgo(0, TODAY)).toBe("2026-08-25")
    expect(isoDaysAgo(20, TODAY)).toBe("2026-08-05")
    expect(isoDaysAgo(30, TODAY)).toBe("2026-07-26")
  })

  test("isoFromJsonLdDate normalises WWR's ' UTC'-suffixed timestamps", () => {
    expect(isoFromJsonLdDate("2026-08-04 20:13:58 UTC")).toBe("2026-08-04")
    expect(isoFromJsonLdDate("nonsense")).toBeNull()
    expect(isoFromJsonLdDate(null)).toBeNull()
  })

  test("dateFromBadge marks precision and floors explicitly", () => {
    expect(dateFromBadge("20d", TODAY)).toEqual({
      date: "2026-08-05",
      precision: "day",
      postedRelative: "20d",
      ageDays: 20,
      ageIsFloor: false,
    })
    const floor = dateFromBadge("30d+", TODAY)
    expect(floor.ageIsFloor).toBe(true)
    expect(floor.precision).toBe("floor")
  })

  test("an absent badge yields a null date, never today's date", () => {
    expect(dateFromBadge(null, TODAY).date).toBeNull()
  })
})
