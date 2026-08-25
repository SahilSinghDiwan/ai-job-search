import { describe, expect, test } from "bun:test";
import { classifyEligibility, findStatedRequirements } from "../src/helpers.ts";
import { CAPTURE_DATE, fixture } from "./helpers.ts";
import { parseSearchPage } from "../src/helpers.ts";

// These tests encode the rule from
// .claude/skills/job-application-assistant/04-job-evaluation.md:
//   "a geography tag alone is a FLAG. Only a stated requirement that India
//    cannot satisfy is a FAIL."
// The CLI must never collapse the two.

describe("tagVerdict — structured geography tags only", () => {
  test("a bare non-India country tag is FLAG, never FAIL", () => {
    const e = classifyEligibility({
      workplace: "REMOTE",
      locations: [],
      acceptedRemoteLocations: ["United States"],
    });
    expect(e.tagVerdict).toBe("FLAG");
    expect(e.tagReason).toContain("FLAG, not a FAIL");
    expect(e.statedRequirements).toEqual([]);
  });

  test("India in the tags is a PASS", () => {
    const e = classifyEligibility({
      workplace: "ONSITE_OR_REMOTE",
      locations: ["Bengaluru"],
      acceptedRemoteLocations: ["India"],
    });
    expect(e.tagVerdict).toBe("PASS");
  });

  test("remote but silent on geography is FLAG_UNVERIFIED, not a pass and not a fail", () => {
    const e = classifyEligibility({
      workplace: "REMOTE",
      locations: [],
      acceptedRemoteLocations: [],
    });
    expect(e.tagVerdict).toBe("FLAG_UNVERIFIED");
    expect(e.tagReason).toContain("geography-unconfirmed");
  });

  test("an on-site role is marked NOT_REMOTE so the remote sub-gate is not misapplied", () => {
    const e = classifyEligibility({
      workplace: "ONSITE",
      locations: ["Bengaluru"],
      acceptedRemoteLocations: [],
    });
    expect(e.tagVerdict).toBe("NOT_REMOTE");
  });

  test("tagVerdict is structurally incapable of emitting FAIL", () => {
    const inputs = [
      { workplace: "REMOTE", locations: [], acceptedRemoteLocations: ["Germany"] },
      { workplace: "REMOTE", locations: [], acceptedRemoteLocations: ["United States", "Canada"] },
      { workplace: null, locations: [], acceptedRemoteLocations: [] },
    ];
    for (const i of inputs) {
      // @ts-expect-error - proving at the type level that "FAIL" is not a member
      const impossible: "FAIL" = classifyEligibility(i).tagVerdict;
      expect(impossible).not.toBe("FAIL");
    }
  });
});

describe("statedRequirements — verbatim FAIL candidates, quoted not judged", () => {
  // Synthetic strings, deliberately: none of the real captures on 2026-08-25
  // carried a prose residency line. Wellfound puts its geography gate in the
  // structured applicantLocationRequirements field instead. That is itself the
  // reason an empty statedRequirements array must never be read as "safe".
  test("catches a residency requirement and quotes it verbatim", () => {
    const q = findStatedRequirements("Great team. You must reside in the United States to be considered.");
    expect(q.length).toBe(1);
    expect(q[0]!.kind).toBe("residency");
    expect(q[0]!.quote).toBe("must reside in the United States to be considered");
  });

  test("catches a work-authorization requirement", () => {
    const q = findStatedRequirements("Candidates must be authorized to work in the US without sponsorship.");
    expect(q.some((x) => x.kind === "work-authorization")).toBe(true);
  });

  test("catches a citizenship requirement", () => {
    const q = findStatedRequirements("Applicants must be a citizen or permanent resident of Australia.");
    expect(q.some((x) => x.kind === "citizenship")).toBe(true);
  });

  test("does not fire on ordinary prose", () => {
    expect(findStatedRequirements("We are a remote-first team building RAG pipelines in Python.")).toEqual([]);
  });

  test("strips HTML before matching so markup cannot hide a requirement", () => {
    const q = findStatedRequirements("<p>You <b>must reside</b> in Germany for this role.</p>");
    expect(q.length).toBe(1);
    expect(q[0]!.quote).toContain("must reside in Germany");
  });

  test("a requirement raises a note on the reason line without changing tagVerdict", () => {
    const e = classifyEligibility({
      workplace: "REMOTE",
      locations: [],
      acceptedRemoteLocations: ["United States"],
      description: "You must reside in the United States.",
    });
    expect(e.tagVerdict).toBe("FLAG");
    expect(e.statedRequirements.length).toBe(1);
    expect(e.tagReason).toContain("statedRequirements");
  });
});

describe("real remote capture", () => {
  test("the live remote board is dominated by non-India geography tags", () => {
    const out = parseSearchPage(fixture("search-ai-engineer-remote.html"), {
      url: "https://wellfound.com/role/r/ai-engineer",
      roleSlug: "ai-engineer",
      locationSlug: null,
      remote: true,
      page: 1,
      now: CAPTURE_DATE,
    });
    const tagged = out.results.filter((r) => r.eligibility.acceptedRemoteLocations.length > 0);
    expect(tagged.length).toBeGreaterThan(0);
    // None of them may be reported as a FAIL by this CLI.
    for (const r of out.results) {
      expect(["PASS", "FLAG", "FLAG_UNVERIFIED", "NOT_REMOTE"]).toContain(r.eligibility.tagVerdict);
    }
    const flagged = out.results.filter((r) => r.eligibility.tagVerdict === "FLAG");
    expect(flagged.length).toBeGreaterThan(0);
  });
});
