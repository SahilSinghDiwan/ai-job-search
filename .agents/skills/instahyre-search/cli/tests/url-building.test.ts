import { describe, expect, test } from "bun:test";
import { buildUrl, PAGE_SIZE, type SearchOpts } from "../src/commands/search";
import { normalizeId } from "../src/commands/detail";

// Offline assertions that the reversed query parameters (url-reference.md) are
// the ones actually sent. If Instahyre renames a parameter, these pin what this
// CLI believes so the break is obvious.

function opts(over: Partial<SearchOpts> = {}): SearchOpts {
  return { jobType: "1", page: 1, format: "json", ...over };
}

describe("buildUrl", () => {
  test("hits the job_search endpoint with the default page window", () => {
    const u = new URL(buildUrl(opts()));
    expect(u.origin + u.pathname).toBe("https://www.instahyre.com/api/v1/job_search");
    expect(u.searchParams.get("limit")).toBe(String(PAGE_SIZE));
    expect(u.searchParams.get("offset")).toBe("0");
    expect(u.searchParams.get("job_type")).toBe("1");
  });

  test("maps --query onto the API's free-text 'skills' parameter", () => {
    const u = new URL(buildUrl(opts({ query: "LLM RAG" })));
    expect(u.searchParams.get("skills")).toBe("LLM RAG");
    expect(u.searchParams.get("keyword")).toBeNull();
    expect(u.searchParams.get("q")).toBeNull();
  });

  test("maps --function onto job_functions, resolving the facet name to an id", () => {
    const u = new URL(buildUrl(opts({ jobFunction: "machine-learning" })));
    expect(u.searchParams.get("job_functions")).toBe("9");
  });

  test("paginates by offset in PAGE_SIZE steps", () => {
    expect(new URL(buildUrl(opts({ page: 3 }))).searchParams.get("offset")).toBe(
      String(2 * PAGE_SIZE),
    );
  });

  test("never sends a location parameter — the API has none", () => {
    const u = new URL(buildUrl(opts({ location: "Bangalore" })));
    for (const name of ["location", "locations", "city", "loc"]) {
      expect(u.searchParams.get(name)).toBeNull();
    }
  });

  test("omits query and function when not supplied", () => {
    const u = new URL(buildUrl(opts()));
    expect(u.searchParams.get("skills")).toBeNull();
    expect(u.searchParams.get("job_functions")).toBeNull();
  });
});

describe("normalizeId", () => {
  test("accepts a bare id", () => {
    expect(normalizeId("438118")).toBe("438118");
  });

  test("extracts the id from a public job URL", () => {
    expect(
      normalizeId("https://www.instahyre.com/job-438118-staff-frontend-developer-at-openfx-bangalore/"),
    ).toBe("438118");
  });

  test("extracts the id from a resource_uri", () => {
    expect(normalizeId("/api/v1/job_search/438118")).toBe("438118");
  });

  test("rejects junk", () => {
    expect(normalizeId("not-an-id")).toBeNull();
    expect(normalizeId("")).toBeNull();
  });
});
