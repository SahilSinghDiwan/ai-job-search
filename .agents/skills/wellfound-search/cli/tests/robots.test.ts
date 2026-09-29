import { describe, expect, test } from "bun:test";
import { assertRobotsAllowed, buildJobUrl, buildSearchUrl } from "../src/helpers.ts";

// wellfound.com/robots.txt, fetched verbatim on 2026-08-25, disallows /search,
// the ?jobId= / ?jobSlug= / ?role= / ?preview= / ?inFrame= / ?after_sign_in=
// query patterns, /re/, /u/, /projects/, /auth/, /_jobs/, /embed/, /documents/,
// /onboarding, /profile/*, /recruit/dashboard, /jobs/applications, /jobs/signup,
// /social/share_modal, /cdn-cgi/, and three job_* paths. It names no AI bot.
//
// These tests are the guard against a future edit quietly reintroducing a
// blocked path.

describe("robots.txt enforcement", () => {
  test("refuses the disallowed /search path", () => {
    expect(() => assertRobotsAllowed("https://wellfound.com/search?q=ai")).toThrow(/robots/);
  });

  test("refuses every disallowed query pattern", () => {
    for (const p of ["jobId", "jobSlug", "role", "preview", "inFrame", "after_sign_in"]) {
      expect(() => assertRobotsAllowed(`https://wellfound.com/jobs/x?${p}=1`)).toThrow(/robots/);
    }
  });

  test("refuses the other disallowed prefixes", () => {
    for (const p of [
      "/re/abc", "/u/someone", "/projects/1", "/auth/login", "/_jobs/x",
      "/embed/x", "/documents/x", "/onboarding", "/profile/edit",
      "/recruit/dashboard", "/jobs/applications", "/jobs/signup",
      "/social/share_modal", "/cdn-cgi/trace",
    ]) {
      expect(() => assertRobotsAllowed(`https://wellfound.com${p}`)).toThrow(/robots/);
    }
  });

  test("allows the browse paths the skill is built on", () => {
    for (const u of [
      "https://wellfound.com/role/ai-engineer",
      "https://wellfound.com/role/l/ai-engineer/bangalore",
      "https://wellfound.com/role/r/ai-engineer",
      "https://wellfound.com/role/l/ai-engineer/bangalore?page=3",
      "https://wellfound.com/jobs/3534689-senior-agentic-ai-engineer",
    ]) {
      expect(() => assertRobotsAllowed(u)).not.toThrow();
    }
  });

  test("every URL the builders can produce is robots-clean", () => {
    const urls = [
      buildSearchUrl({ role: "ai-engineer", location: "bangalore" }),
      buildSearchUrl({ role: "ai-engineer", location: "bangalore", page: 4 }),
      buildSearchUrl({ role: "machine-learning-engineer", remote: true }),
      buildSearchUrl({ role: "data-engineer" }),
      buildJobUrl("3534689", "senior-agentic-ai-engineer"),
      buildJobUrl("3534689", null),
    ];
    for (const u of urls) expect(() => assertRobotsAllowed(u)).not.toThrow();
  });

  test("pagination uses ?page=, which robots.txt permits (unlike ?role=)", () => {
    const u = buildSearchUrl({ role: "ai-engineer", location: "bangalore", page: 3 });
    expect(u).toBe("https://wellfound.com/role/l/ai-engineer/bangalore?page=3");
    expect(u).not.toContain("?role=");
  });
});

describe("the 303 fallback body carries nothing usable", () => {
  test("Wellfound's 303 interstitial has no listing data to be mistaken for results", async () => {
    const { extractApolloData } = await import("../src/helpers.ts");
    const { fixture } = await import("./helpers.ts");
    // Belt-and-braces: fetchPage already refuses to follow the 303. But if that
    // guard were ever removed, the body must not silently parse into "results".
    expect(() => extractApolloData(fixture("redirect-303-shell.html"))).toThrow();
  });
});
