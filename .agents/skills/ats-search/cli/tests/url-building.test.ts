import { describe, test, expect } from "bun:test";
import { boardUrl } from "../src/fetchers";
import { parseRef } from "../src/commands/detail";
import * as greenhouse from "../src/providers/greenhouse";
import * as ashby from "../src/providers/ashby";

describe("board URLs", () => {
  test("greenhouse, with and without content", () => {
    expect(boardUrl("greenhouse", "anthropic", false)).toBe(
      "https://boards-api.greenhouse.io/v1/boards/anthropic/jobs",
    );
    expect(boardUrl("greenhouse", "anthropic", true)).toBe(
      "https://boards-api.greenhouse.io/v1/boards/anthropic/jobs?content=true",
    );
    expect(greenhouse.detailUrl("anthropic", "446")).toBe(
      "https://boards-api.greenhouse.io/v1/boards/anthropic/jobs/446",
    );
  });

  test("ashby", () => {
    expect(boardUrl("ashby", "sarvam", false)).toBe(
      "https://api.ashbyhq.com/posting-api/job-board/sarvam",
    );
    expect(ashby.listUrl("sarvam", true)).toBe(
      "https://api.ashbyhq.com/posting-api/job-board/sarvam?includeCompensation=true",
    );
  });

  test("lever fetches the API host, never the candidate-facing board host", () => {
    const url = boardUrl("lever", "cred", false);
    expect(url).toBe("https://api.lever.co/v0/postings/cred?mode=json");
    expect(url).not.toContain("jobs.lever.co");
  });

  test("no board URL this CLI requests ever points at a disallowed host", () => {
    for (const slug of ["anthropic", "sarvam", "cred"]) {
      for (const p of ["greenhouse", "ashby", "lever"] as const) {
        const host = new URL(boardUrl(p, slug, false)).host;
        expect(["boards-api.greenhouse.io", "api.ashbyhq.com", "api.lever.co"]).toContain(host);
      }
    }
  });

  test("slugs are URL-encoded", () => {
    expect(boardUrl("greenhouse", "a b", false)).toContain("a%20b");
  });
});

describe("parseRef", () => {
  test("accepts the composite id search emits", () => {
    expect(parseRef("greenhouse:anthropic:4461450008")).toEqual({
      provider: "greenhouse",
      slug: "anthropic",
      jobId: "4461450008",
    });
    expect(parseRef("ashby:sarvam:3d479c06-8537-40ee-bcbb-a7d337013da4")).toEqual({
      provider: "ashby",
      slug: "sarvam",
      jobId: "3d479c06-8537-40ee-bcbb-a7d337013da4",
    });
  });

  test("accepts public board URLs from all three providers", () => {
    expect(parseRef("https://job-boards.greenhouse.io/anthropic/jobs/4461450008")).toEqual({
      provider: "greenhouse",
      slug: "anthropic",
      jobId: "4461450008",
    });
    expect(parseRef("https://boards.greenhouse.io/anthropic/jobs/4461450008")?.slug).toBe("anthropic");
    expect(parseRef("https://jobs.ashbyhq.com/sarvam/86ae80f8-b7eb")).toEqual({
      provider: "ashby",
      slug: "sarvam",
      jobId: "86ae80f8-b7eb",
    });
    // Reading an id out of a jobs.lever.co string is not fetching that host:
    // the request that follows goes to api.lever.co.
    expect(parseRef("https://jobs.lever.co/cred/fa6c100a")).toEqual({
      provider: "lever",
      slug: "cred",
      jobId: "fa6c100a",
    });
  });

  test("accepts API URLs too", () => {
    expect(parseRef("https://api.lever.co/v0/postings/cred/fa6c100a?mode=json")?.jobId).toBe("fa6c100a");
    expect(
      parseRef("https://boards-api.greenhouse.io/v1/boards/anthropic/jobs/446")?.slug,
    ).toBe("anthropic");
  });

  test("rejects unparseable input", () => {
    expect(parseRef("12345")).toBeNull();
    expect(parseRef("workday:acme:1")).toBeNull();
    expect(parseRef("https://example.com/jobs/1")).toBeNull();
    expect(parseRef("https://jobs.ashbyhq.com/sarvam")).toBeNull();
  });
});
