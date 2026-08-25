import { describe, expect, test } from "bun:test";
import { CAPTURE_DATE, fixture } from "./helpers.ts";
import { parseSearchPage } from "../src/helpers.ts";
import { finalize } from "../src/commands/search.ts";
import type { SearchArgs } from "../src/commands/search.ts";
import { renderPlain, renderTable } from "../src/table.ts";

const baseArgs: SearchArgs = {
  query: "ai-engineer",
  location: "bangalore",
  remote: false,
  page: 1,
  limit: null,
  jobage: null,
  hasSalary: false,
  format: "json",
};

function parsed() {
  return parseSearchPage(fixture("search-ai-engineer-bangalore.html"), {
    url: "https://wellfound.com/role/l/ai-engineer/bangalore",
    roleSlug: "ai-engineer",
    locationSlug: "bangalore",
    remote: false,
    page: 1,
    now: CAPTURE_DATE,
  });
}

describe("portal-skill output contract", () => {
  test("{meta, results} with the six required per-result keys always present", () => {
    const out = JSON.parse(finalize(parsed(), baseArgs));
    expect(Object.keys(out).sort()).toEqual(["meta", "results"]);
    expect(typeof out.meta.count).toBe("number");
    expect(typeof out.meta.page).toBe("number");
    for (const r of out.results) {
      for (const k of ["id", "title", "company", "location", "date", "url"]) {
        expect(k in r).toBe(true); // present, even when null — never omitted
      }
    }
  });

  test("--limit caps the emitted results and updates meta.count", () => {
    const out = JSON.parse(finalize(parsed(), { ...baseArgs, limit: 3 }));
    expect(out.results.length).toBe(3);
    expect(out.meta.count).toBe(3);
  });

  test("--has-salary keeps only priced listings and says so in meta.notes", () => {
    const out = JSON.parse(finalize(parsed(), { ...baseArgs, hasSalary: true }));
    expect(out.results.length).toBeGreaterThan(0);
    for (const r of out.results) expect(r.salary.raw).not.toBeNull();
    expect(out.meta.salaryCoverage.fraction).toBe(1);
    expect(out.meta.notes.join(" ")).toContain("--has-salary");
  });

  test("--jobage filters on exact age and documents that it is client-side", () => {
    const all = JSON.parse(finalize(parsed(), baseArgs));
    const recent = JSON.parse(finalize(parsed(), { ...baseArgs, jobage: 14 }));
    expect(recent.results.length).toBeLessThanOrEqual(all.results.length);
    for (const r of recent.results) expect(r.ageDays).toBeLessThanOrEqual(14);
    expect(recent.meta.notes.join(" ")).toContain("client-side");
    expect(recent.meta.notes.join(" ")).toContain("not an approximation");
  });

  test("meta declares posting-date precision explicitly", () => {
    const out = JSON.parse(finalize(parsed(), baseArgs));
    expect(out.meta.postingDates).toContain("exact");
    expect(out.meta.postingDates).toContain("liveStartAt");
  });

  test("remote searches carry the FLAG-not-FAIL caveat in meta.notes", () => {
    const out = parseSearchPage(fixture("search-ai-engineer-remote.html"), {
      url: "https://wellfound.com/role/r/ai-engineer",
      roleSlug: "ai-engineer", locationSlug: null, remote: true, page: 1, now: CAPTURE_DATE,
    });
    const json = JSON.parse(finalize(out, { ...baseArgs, location: null, remote: true }));
    const notes = json.meta.notes.join(" ");
    expect(notes).toContain("never FAIL");
    expect(notes).toContain("04-job-evaluation.md");
  });
});

describe("renderers", () => {
  test("table has a header and one row per result", () => {
    const results = parsed().results;
    const lines = renderTable(results).split("\n");
    expect(lines[0]).toContain("SALARY");
    expect(lines[0]).toContain("POSTED");
    expect(lines[0]).toContain("ELIG");
    expect(lines.length).toBe(results.length + 2);
  });

  test("table shows a real salary range rather than a raw number", () => {
    const rendered = renderTable(parsed().results);
    expect(rendered).toMatch(/₹\d/);
  });

  test("plain output surfaces the eligibility reasoning", () => {
    const rendered = renderPlain(parsed().results);
    expect(rendered).toContain("remote:");
    expect(rendered).toContain("note:");
    expect(rendered).toContain("days ago, exact)");
  });

  test("an empty result set renders without throwing", () => {
    expect(renderTable([])).toBe("No results.");
    expect(renderPlain([])).toBe("");
  });
});
