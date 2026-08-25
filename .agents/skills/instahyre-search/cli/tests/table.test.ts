import { describe, expect, test } from "bun:test"
import {
  coerceRows,
  daysBetween,
  defaultTablePath,
  escapeCell,
  isIsoDate,
  needsVerification,
  parseTable,
  renderTable,
  splitRow,
  unescapeCell,
  upsertRows,
  type TableRow,
} from "../src/table.js"

const TODAY = "2026-08-25"

function row(over: Partial<TableRow> & { id: string }): TableRow {
  return {
    title: null,
    company: null,
    location: null,
    url: null,
    api_date: null,
    posted_date: null,
    verified_at: null,
    source: null,
    ...over,
  }
}

describe("cell escaping", () => {
  test("null becomes the null cell and round-trips back to null", () => {
    expect(escapeCell(null)).toBe("-")
    expect(unescapeCell("-")).toBeNull()
    expect(unescapeCell("   ")).toBeNull()
  })

  test("pipes are escaped so they cannot tear a row into extra columns", () => {
    expect(escapeCell("Data Scientist | LLM")).toBe("Data Scientist \\| LLM")
    expect(unescapeCell("Data Scientist \\| LLM")).toBe("Data Scientist | LLM")
  })

  test("newlines are flattened", () => {
    expect(escapeCell("Bangalore\nMumbai")).toBe("Bangalore Mumbai")
  })

  test("an empty string is stored as null, not as an empty cell", () => {
    expect(escapeCell("")).toBe("-")
  })
})

describe("splitRow", () => {
  test("strips the leading and trailing pipe delimiters", () => {
    expect(splitRow("| a | b | c |")).toEqual([" a ", " b ", " c "])
  })

  test("keeps an escaped pipe inside its own cell", () => {
    expect(splitRow("| Eng \\| ML | Acme |")).toEqual([" Eng \\| ML ", " Acme "])
  })
})

describe("parseTable / renderTable round-trip", () => {
  const rows: TableRow[] = [
    row({
      id: "438746",
      title: "Senior AI Engineer",
      company: "Cloudwick Technologies",
      location: "Bangalore",
      url: "https://www.instahyre.com/job-438746-senior-ai-engineer/",
      posted_date: "2026-08-14",
      verified_at: TODAY,
      source: "jsonld",
    }),
    row({ id: "344067", title: "LLM Engineer | RAG", company: "Opkey" }),
  ]

  test("renders a header, a divider and one line per row", () => {
    const md = renderTable(rows)
    expect(md).toContain("| id | title | company |")
    expect(md.split("\n").filter((l) => l.startsWith("| ") && !l.includes("---")).length).toBe(3)
  })

  test("rows survive a render/parse round-trip unchanged", () => {
    const back = parseTable(renderTable(rows))
    expect(back).toHaveLength(2)
    const byId = Object.fromEntries(back.map((r) => [r.id, r]))
    expect(byId["438746"].posted_date).toBe("2026-08-14")
    expect(byId["438746"].company).toBe("Cloudwick Technologies")
    expect(byId["344067"].title).toBe("LLM Engineer | RAG")
    expect(byId["344067"].posted_date).toBeNull()
  })

  test("rows are rendered in ascending numeric id order", () => {
    const ids = parseTable(renderTable(rows)).map((r) => r.id)
    expect(ids).toEqual(["344067", "438746"])
  })

  test("prose above the table and a garbled short row are skipped, not fatal", () => {
    const md = renderTable(rows) + "\n| 999 | broken |\nsome trailing prose\n"
    const back = parseTable(md)
    expect(back.map((r) => r.id).sort()).toEqual(["344067", "438746"])
  })

  test("an empty or missing file parses as no rows", () => {
    expect(parseTable("")).toEqual([])
    expect(parseTable("# Instahyre posting dates\n\nnothing yet\n")).toEqual([])
  })
})

describe("upsertRows", () => {
  const seeded = [row({ id: "1", title: "LLM Engineer", company: "Acme", api_date: null })]

  test("a new id is added", () => {
    const r = upsertRows(seeded, [row({ id: "2", title: "AI Engineer" })])
    expect(r.added).toBe(1)
    expect(r.rows).toHaveLength(2)
  })

  test("re-running the same enrichment updates in place, never appends a duplicate", () => {
    const once = upsertRows(seeded, [row({ id: "1", posted_date: "2026-08-14", verified_at: TODAY })])
    const twice = upsertRows(once.rows, [
      row({ id: "1", posted_date: "2026-08-14", verified_at: TODAY }),
    ])
    expect(twice.rows).toHaveLength(1)
    expect(twice.added).toBe(0)
    expect(twice.unchanged).toBe(1)
  })

  test("a date-only incoming row does not blank the seeded title", () => {
    const r = upsertRows(seeded, [row({ id: "1", posted_date: "2026-08-14" })])
    expect(r.rows[0].title).toBe("LLM Engineer")
    expect(r.rows[0].posted_date).toBe("2026-08-14")
    expect(r.updated).toBe(1)
  })

  test("an API re-seed does not blank a browser-verified date", () => {
    const verified = upsertRows(seeded, [
      row({ id: "1", posted_date: "2026-08-14", verified_at: TODAY, source: "jsonld" }),
    ]).rows
    const reseeded = upsertRows(verified, [row({ id: "1", title: "LLM Engineer (Senior)" })])
    expect(reseeded.rows[0].posted_date).toBe("2026-08-14")
    expect(reseeded.rows[0].verified_at).toBe(TODAY)
    expect(reseeded.rows[0].title).toBe("LLM Engineer (Senior)")
  })

  test("a fresher verification overwrites an older one", () => {
    const first = upsertRows([], [row({ id: "1", posted_date: "2026-08-01", verified_at: "2026-07-01" })])
    const second = upsertRows(first.rows, [
      row({ id: "1", posted_date: "2026-08-01", verified_at: TODAY }),
    ])
    expect(second.rows[0].verified_at).toBe(TODAY)
  })
})

describe("coerceRows", () => {
  test("accepts the search command's {meta, results} envelope and seeds dateless rows", () => {
    const { rows, errors } = coerceRows(
      {
        meta: { count: 1 },
        results: [
          {
            id: "438746",
            title: "Senior AI Engineer",
            company: "Cloudwick Technologies",
            location: "Bangalore",
            date: null,
            url: "https://www.instahyre.com/job-438746-x/",
          },
        ],
      },
      TODAY,
    )
    expect(errors).toEqual([])
    expect(rows).toHaveLength(1)
    expect(rows[0].posted_date).toBeNull()
    // Nothing was verified, so nothing may claim a verification stamp.
    expect(rows[0].verified_at).toBeNull()
    expect(rows[0].source).toBeNull()
  })

  test("accepts the browser pass's shape and stamps verified_at with today", () => {
    const { rows } = coerceRows([{ id: "438746", datePosted: "2026-08-14" }], TODAY)
    expect(rows[0].posted_date).toBe("2026-08-14")
    expect(rows[0].verified_at).toBe(TODAY)
    expect(rows[0].source).toBe("jsonld")
  })

  test("an explicit verified_at wins over today", () => {
    const { rows } = coerceRows(
      [{ id: "1", posted_date: "2026-08-14", verified_at: "2026-08-20" }],
      TODAY,
    )
    expect(rows[0].verified_at).toBe("2026-08-20")
  })

  test("a non-ISO date is dropped with a warning rather than stored", () => {
    const { rows, errors } = coerceRows([{ id: "1", posted_date: "14 Aug 2026" }], TODAY)
    expect(rows[0].posted_date).toBeNull()
    expect(rows[0].verified_at).toBeNull()
    expect(errors.join(" ")).toContain("not YYYY-MM-DD")
  })

  test("numeric ids are stringified", () => {
    const { rows } = coerceRows([{ id: 438746 }], TODAY)
    expect(rows[0].id).toBe("438746")
  })

  test("a row without an id is reported and skipped", () => {
    const { rows, errors } = coerceRows([{ title: "no id" }, { id: "2" }], TODAY)
    expect(rows.map((r) => r.id)).toEqual(["2"])
    expect(errors).toHaveLength(1)
  })

  test("input that is neither an array nor an envelope is an error, not a crash", () => {
    const { rows, errors } = coerceRows({ nope: true }, TODAY)
    expect(rows).toEqual([])
    expect(errors[0]).toContain("expected a JSON array")
  })
})

describe("date helpers", () => {
  test("isIsoDate rejects malformed and impossible dates", () => {
    expect(isIsoDate("2026-08-14")).toBe(true)
    expect(isIsoDate("2026-8-14")).toBe(false)
    expect(isIsoDate("2026-02-31")).toBe(false)
    expect(isIsoDate("Posted 5 days ago")).toBe(false)
    expect(isIsoDate(null)).toBe(false)
  })

  test("daysBetween counts calendar days", () => {
    expect(daysBetween("2026-08-14", TODAY)).toBe(11)
    expect(daysBetween("garbage", TODAY)).toBeNull()
  })
})

describe("needsVerification", () => {
  test("a row with no date always needs verification", () => {
    expect(needsVerification(row({ id: "1" }), TODAY, 21)).toBe(true)
  })

  test("a recently verified row is skipped", () => {
    expect(
      needsVerification(row({ id: "1", posted_date: "2026-08-14", verified_at: "2026-08-20" }), TODAY, 21),
    ).toBe(false)
  })

  test("a verification older than the stale window is re-listed", () => {
    expect(
      needsVerification(row({ id: "1", posted_date: "2026-01-01", verified_at: "2026-01-02" }), TODAY, 21),
    ).toBe(true)
  })

  test("a date with no verification stamp is treated as unverified", () => {
    expect(needsVerification(row({ id: "1", posted_date: "2026-08-14" }), TODAY, 21)).toBe(true)
  })
})

describe("defaultTablePath", () => {
  test("lands under job_scraper/, which the repo already gitignores", () => {
    expect(defaultTablePath("/skills/instahyre-search")).toBe(
      "/skills/instahyre-search/job_scraper/instahyre_posting_dates.md",
    )
  })
})
