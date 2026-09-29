import { describe, test, expect } from "bun:test";
import { join } from "path";
import { filterCompanies, loadCompanies, parseCompanies } from "../src/companies";

const SHIPPED_LIST = join(import.meta.dir, "..", "..", "companies.txt");

describe("company list parsing", () => {
  test("parses provider/slug pairs and trailing-# notes", () => {
    const { companies, problems } = parseCompanies(
      [
        "# a header comment",
        "",
        "greenhouse  anthropic   # Claude",
        "ashby\tsarvam", // tabs must work identically to spaces
        "lever cred",
      ].join("\n"),
    );
    expect(problems).toEqual([]);
    expect(companies.map((c) => `${c.provider}:${c.slug}`)).toEqual([
      "greenhouse:anthropic",
      "ashby:sarvam",
      "lever:cred",
    ]);
    expect(companies[0]!.note).toBe("Claude");
    expect(companies[1]!.note).toBeNull();
  });

  test("reports rather than silently dropping bad lines", () => {
    const { companies, problems } = parseCompanies(
      ["workday acme", "greenhouse", "lever cred extra-field", "ashby sarvam", "ashby sarvam"].join("\n"),
    );
    expect(companies.length).toBe(1);
    expect(problems.length).toBe(4);
    expect(problems[0]).toContain("unknown provider");
    expect(problems[1]).toContain("no slug");
    expect(problems[2]).toContain("extra field");
    expect(problems[3]).toContain("duplicate");
  });

  test("line numbers in problems point at the real line", () => {
    const { problems } = parseCompanies("\n\n\nworkday acme\n");
    expect(problems[0]).toContain("line 4");
  });

  test("filterCompanies narrows by provider and by slug", () => {
    const { companies } = parseCompanies("greenhouse anthropic\nashby sarvam\nlever cred");
    expect(filterCompanies(companies, { provider: "ashby" }).length).toBe(1);
    expect(filterCompanies(companies, { only: ["sarvam", "cred"] }).length).toBe(2);
    expect(filterCompanies(companies, { only: ["lever:cred"] }).length).toBe(1);
    expect(filterCompanies(companies, { only: ["nope"] }).length).toBe(0);
  });
});

describe("the shipped companies.txt", () => {
  const { companies, problems } = loadCompanies(SHIPPED_LIST);

  test("parses with no problems", () => {
    expect(problems).toEqual([]);
  });

  test("is seeded with a usable number of companies", () => {
    expect(companies.length).toBeGreaterThanOrEqual(30);
    expect(companies.length).toBeLessThanOrEqual(60);
  });

  test("covers all three providers", () => {
    const providers = new Set(companies.map((c) => c.provider));
    expect(providers).toEqual(new Set(["greenhouse", "ashby", "lever"]));
  });

  test("has no duplicate slugs within a provider", () => {
    const keys = companies.map((c) => `${c.provider}:${c.slug}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
