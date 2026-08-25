import { describe, expect, test } from "bun:test";
import { CAPTURE_DATE, fixture } from "./helpers.ts";
import { parseDetailPage, parseSearchPage } from "../src/helpers.ts";

const bangalore = () =>
  parseSearchPage(fixture("search-ai-engineer-bangalore.html"), {
    url: "https://wellfound.com/role/l/ai-engineer/bangalore",
    roleSlug: "ai-engineer",
    locationSlug: "bangalore",
    remote: false,
    page: 1,
    now: CAPTURE_DATE,
  });

describe("search page parsing (real Bangalore capture)", () => {
  test("extracts listings with the contract fields populated", () => {
    const out = bangalore();
    expect(out.results.length).toBeGreaterThan(0);
    for (const r of out.results) {
      expect(r.id).toMatch(/^\d+$/);
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.company).not.toBeNull();
      expect(r.url).toStartWith("https://wellfound.com/jobs/");
    }
  });

  test("carries the portal's own volume counters, not just the page slice", () => {
    const out = bangalore();
    // 225 jobs / 139 startups / 7 pages was what wellfound.com reported live.
    expect(out.meta.totalJobCount).toBe(225);
    expect(out.meta.totalStartupCount).toBe(139);
    expect(out.meta.pageCount).toBe(7);
    expect(out.meta.perPage).toBe(20);
  });

  test("posting dates are exact, never relative", () => {
    const out = bangalore();
    const dated = out.results.filter((r) => r.date !== null);
    expect(dated.length).toBe(out.results.length);
    for (const r of dated) {
      expect(r.datePrecision).toBe("exact");
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.postedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(r.ageDays).toBeGreaterThanOrEqual(0);
    }
  });

  test("a known listing decodes to its exact real values", () => {
    const out = bangalore();
    const scispace = out.results.find((r) => r.id === "3534689");
    expect(scispace).toBeDefined();
    expect(scispace!.title).toBe("Senior Agentic AI Engineer");
    expect(scispace!.company).toBe("SciSpace");
    expect(scispace!.location).toBe("Bengaluru");
    expect(scispace!.date).toBe("2026-08-17");
    expect(scispace!.url).toBe("https://wellfound.com/jobs/3534689-senior-agentic-ai-engineer");
    // "₹30L – ₹47L • 0.02% – 0.05%"
    expect(scispace!.salary.currency).toBe("INR");
    expect(scispace!.salary.min).toBe(3_000_000);
    expect(scispace!.salary.max).toBe(4_700_000);
    expect(scispace!.salary.equity.offered).toBe(true);
    expect(scispace!.salary.equity.minPercent).toBe(0.02);
    expect(scispace!.salary.equity.maxPercent).toBe(0.05);
    // The browse card states no period. We must not invent one.
    expect(scispace!.salary.period).toBeNull();
    expect(scispace!.salary.currencySource).toBe("symbol");
  });

  test("reports salary coverage as a real fraction of the page", () => {
    const out = bangalore();
    expect(out.meta.salaryCoverage.total).toBe(out.results.length);
    expect(out.meta.salaryCoverage.withSalary).toBeGreaterThan(0);
    expect(out.meta.salaryCoverage.fraction).toBeGreaterThan(0);
    expect(out.meta.salaryCoverage.fraction).toBeLessThanOrEqual(1);
  });

  test("one malformed listing cannot take out the rest", () => {
    const html = fixture("search-ai-engineer-bangalore.html");
    const broken = html.replace('"remoteConfig":{"__typename":"JobListingRemoteConfig"', '"remoteConfig":null,"_x":{"z":1');
    // Even if the mutation is a no-op on this capture, parsing must not throw.
    const out = parseSearchPage(broken, {
      url: "u", roleSlug: "ai-engineer", locationSlug: "bangalore",
      remote: false, page: 1, now: CAPTURE_DATE,
    });
    expect(out.results.length).toBeGreaterThan(0);
  });

  test("rejects a page served for a different location instead of returning it", () => {
    expect(() =>
      parseSearchPage(fixture("search-ai-engineer-bangalore.html"), {
        url: "u", roleSlug: "ai-engineer", locationSlug: "mumbai",
        remote: false, page: 1, now: CAPTURE_DATE,
      })
    ).toThrow(/served/);
  });
});

describe("detail page parsing (real captures)", () => {
  test("schema.org JobPosting gives a machine-readable salary with currency AND period", () => {
    const d = parseDetailPage(
      fixture("detail-3534689-scispace.html"),
      "https://wellfound.com/jobs/3534689-senior-agentic-ai-engineer",
      "3534689"
    );
    expect(d.title).toBe("Senior Agentic AI Engineer");
    expect(d.salary.currency).toBe("INR");
    expect(d.salary.min).toBe(3_000_000);
    expect(d.salary.max).toBe(4_700_000);
    expect(d.salary.period).toBe("YEAR");
    expect(d.salary.currencySource).toBe("jsonld");
    expect(d.country).toBe("India");
    expect(d.monthsOfExperience).toBe(60);
    expect(d.description.length).toBeGreaterThan(200);
    expect(d.description).not.toContain("<p>");
    expect(d.description).not.toContain("&#39;");
  });

  test("detail datePosted agrees with the search page's epoch to the day", () => {
    const d = parseDetailPage(fixture("detail-3534689-scispace.html"), "u", "3534689");
    const fromSearch = bangalore().results.find((r) => r.id === "3534689");
    expect(d.date).toBe("2026-08-17");
    expect(d.date).toBe(fromSearch!.date);
    expect(d.datePrecision).toBe("exact");
  });

  test("a US-gated remote posting keeps its country tag as a FLAG, not a FAIL", () => {
    const d = parseDetailPage(fixture("detail-4610062-motive-remote.html"), "u", "4610062");
    expect(d.salary.currency).toBe("USD");
    expect(d.salary.period).toBe("YEAR");
    expect(d.eligibility.acceptedRemoteLocations).toEqual(["United States"]);
    expect(d.eligibility.tagVerdict).toBe("FLAG");
    // The type union has no FAIL member; assert the value too, as a regression guard.
    expect(d.eligibility.tagVerdict).not.toBe("FAIL");
  });

  test("errors loudly when a page carries no JobPosting block", () => {
    expect(() => parseDetailPage("<html><body>nope</body></html>", "u", "1")).toThrow(
      /no schema.org JobPosting/
    );
  });
});
