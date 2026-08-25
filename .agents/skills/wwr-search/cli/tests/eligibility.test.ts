import { describe, expect, test } from "bun:test"
import {
  chipCoversIndia,
  classifyFromChips,
  classifyFromCountryCodes,
  isGeoChip,
  isSalaryChip,
} from "../src/eligibility.js"

describe("chip shape detection", () => {
  test("job-type, promo and salary chips are not geography", () => {
    for (const chip of ["Full-Time", "Contract", "Full-Time/Part-Time", "Featured", "Boosted", "Top 100", "Remote"]) {
      expect(isGeoChip(chip)).toBe(false)
    }
    for (const chip of ["$100,000 or more USD", "$130k+", "$20/hr+"]) {
      expect(isSalaryChip(chip)).toBe(true)
      expect(isGeoChip(chip)).toBe(false)
    }
  })

  test("flag countries, '… Only' regions and worldwide are geography", () => {
    expect(isGeoChip("🇺🇸 United States of America")).toBe(true)
    expect(isGeoChip("North America Only")).toBe(true)
    expect(isGeoChip("Anywhere in the World")).toBe(true)
  })
})

describe("India matching never guesses", () => {
  test("matches India by flag and by exact name", () => {
    expect(chipCoversIndia("🇮🇳 India")).toBe(true)
    expect(chipCoversIndia("India")).toBe(true)
    expect(chipCoversIndia("Asia Only")).toBe(true)
  })

  test("does not match countries whose names merely contain 'India'", () => {
    // The live lemon.io listing lists Indonesia and not India — a substring
    // match here would wrongly promote a gated listing to India-eligible.
    expect(chipCoversIndia("🇮🇩 Indonesia")).toBe(false)
    expect(chipCoversIndia("🇮🇴 British Indian Ocean Territory")).toBe(false)
  })

  test("EMEA does not include India", () => {
    expect(chipCoversIndia("EMEA Only")).toBe(false)
  })
})

describe("classifyFromChips", () => {
  test("'Anywhere in the World' is worldwide and passes the gate", () => {
    const e = classifyFromChips(["Contract", "Anywhere in the World"])
    expect(e.class).toBe("worldwide")
    expect(e.gateVerdict).toBe("pass")
    expect(e.indiaCovered).toBe(true)
    expect(e.scope).toBe("Anywhere in the World")
  })

  test("a listing naming India is india-eligible", () => {
    const e = classifyFromChips(["Full-Time", "🇮🇳 India", "🇦🇪 United Arab Emirates"])
    expect(e.class).toBe("india-eligible")
    expect(e.gateVerdict).toBe("pass")
    expect(e.raw).toEqual(["🇮🇳 India", "🇦🇪 United Arab Emirates"])
  })

  test("a stated '… Only' region that excludes India is a FAIL, not a flag", () => {
    const e = classifyFromChips(["Top 100", "Full-Time", "North America Only"])
    expect(e.class).toBe("gated-elsewhere")
    expect(e.gateVerdict).toBe("fail")
    expect(e.restriction).toBe("explicit-region-restriction")
  })

  test("a bare country tag is a FLAG, preserving 04-job-evaluation's distinction", () => {
    const e = classifyFromChips(["Full-Time", "🇺🇸 United States of America"])
    expect(e.class).toBe("gated-elsewhere")
    expect(e.gateVerdict).toBe("flag")
    expect(e.restriction).toBe("country-tag")
    expect(e.reason).toContain("not a stated residency requirement")
  })

  test("no geographic chip at all is unknown, never eligible", () => {
    const e = classifyFromChips(["Full-Time"])
    expect(e.class).toBe("unknown")
    expect(e.gateVerdict).toBe("flag")
    expect(e.indiaCovered).toBe(false)
    expect(e.scope).toBeNull()
  })

  test("a long country list without India is gated, and Indonesia does not rescue it", () => {
    const e = classifyFromChips(["Full-Time", "🇮🇩 Indonesia", "🇧🇷 Brazil", "🇺🇸 United States of America"])
    expect(e.class).toBe("gated-elsewhere")
    expect(e.indiaCovered).toBe(false)
  })
})

describe("classifyFromCountryCodes (detail pages, authoritative)", () => {
  test("a short list containing IN is india-eligible", () => {
    const e = classifyFromCountryCodes(["US", "IN", "SG"], { geoLocked: true })
    expect(e.class).toBe("india-eligible")
    expect(e.gateVerdict).toBe("pass")
    expect(e.restriction).toBe("applicant-location-list")
  })

  test("a ~global list containing IN is reported as worldwide", () => {
    const codes = Array.from({ length: 249 }, (_, i) => `C${i}`)
    codes[5] = "IN"
    const e = classifyFromCountryCodes(codes, { geoLocked: false })
    expect(e.class).toBe("worldwide")
    expect(e.gateVerdict).toBe("pass")
  })

  test("a list without IN is a FAIL and says the GeoLock out loud", () => {
    const e = classifyFromCountryCodes(["US"], { geoLocked: true })
    expect(e.class).toBe("gated-elsewhere")
    expect(e.gateVerdict).toBe("fail")
    expect(e.reason).toContain("GeoLocked")
  })

  test("no country codes falls back to the chips rather than inventing a verdict", () => {
    const e = classifyFromCountryCodes([], { geoLocked: false, chips: ["Anywhere in the World"] })
    expect(e.class).toBe("worldwide")
  })
})
