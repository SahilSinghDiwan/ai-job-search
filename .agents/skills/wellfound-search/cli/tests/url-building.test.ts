import { describe, expect, test } from "bun:test";
import {
  buildSearchUrl,
  parseJobRef,
  resolveLocationSlug,
  resolveRoleSlug,
  slugify,
} from "../src/helpers.ts";

describe("slug resolution", () => {
  test("slugifies free text onto a role path", () => {
    expect(slugify("AI Engineer")).toBe("ai-engineer");
    expect(resolveRoleSlug("Machine Learning Engineer")).toBe("machine-learning-engineer");
  });

  test("maps common role phrasings onto slugs the site actually serves", () => {
    expect(resolveRoleSlug("LLM Engineer")).toBe("ai-engineer");
    expect(resolveRoleSlug("GenAI engineer")).toBe("ai-engineer");
    expect(resolveRoleSlug("ML Engineer")).toBe("machine-learning-engineer");
    expect(resolveRoleSlug("SRE")).toBe("devops-engineer");
  });

  test('maps "bengaluru" and the "-india" suffix forms onto "bangalore"', () => {
    // This is the trap: /role/l/ai-engineer/bangalore-india 303s to the
    // unfiltered role page and returns US-heavy results that look like a
    // successful Bengaluru search.
    expect(resolveLocationSlug("Bengaluru")).toBe("bangalore");
    expect(resolveLocationSlug("bangalore-india")).toBe("bangalore");
    expect(resolveLocationSlug("Bengaluru, India")).toBe("bangalore");
    expect(resolveLocationSlug("Gurugram")).toBe("gurgaon");
  });
});

describe("buildSearchUrl", () => {
  test("role + location", () => {
    expect(buildSearchUrl({ role: "ai-engineer", location: "Bengaluru" })).toBe(
      "https://wellfound.com/role/l/ai-engineer/bangalore"
    );
  });
  test("role only", () => {
    expect(buildSearchUrl({ role: "data-engineer" })).toBe("https://wellfound.com/role/data-engineer");
  });
  test("remote uses /role/r/ and ignores any location", () => {
    expect(buildSearchUrl({ role: "ai-engineer", remote: true })).toBe(
      "https://wellfound.com/role/r/ai-engineer"
    );
  });
  test("page 1 carries no query string", () => {
    expect(buildSearchUrl({ role: "ai-engineer", page: 1 })).not.toContain("?");
  });
});

describe("parseJobRef", () => {
  test("accepts a bare id, an id-slug pair, and a full URL", () => {
    expect(parseJobRef("3534689")).toEqual({ id: "3534689", slug: null });
    expect(parseJobRef("3534689-senior-agentic-ai-engineer")).toEqual({
      id: "3534689",
      slug: "senior-agentic-ai-engineer",
    });
    expect(parseJobRef("https://wellfound.com/jobs/3534689-senior-agentic-ai-engineer")).toEqual({
      id: "3534689",
      slug: "senior-agentic-ai-engineer",
    });
  });
  test("rejects junk with a clear error", () => {
    expect(() => parseJobRef("not-a-job")).toThrow(/could not read a job id/);
  });
});
