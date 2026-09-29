import { describe, test, expect } from "bun:test";
import { join } from "path";
import {
  htmlToText,
  matchesLocation,
  parseJobCard,
  parseJobCards,
  parseJobDetail,
  resolveJobFunction,
  jobUrl,
  type Envelope,
} from "../src/helpers";

// Fixtures are real responses captured from the live API while building this
// skill (see url-reference.md). CI never hits the portal, so every parsing
// assertion below runs against these checked-in files.
const searchFixture = (await Bun.file(
  join(import.meta.dir, "fixtures/search-genai.json"),
).json()) as Envelope;
const detailFixture = await Bun.file(join(import.meta.dir, "fixtures/detail-438118.json")).json();

describe("parseJobCards (search fixture)", () => {
  const cards = parseJobCards(searchFixture);

  test("parses every object in the fixture", () => {
    expect(cards.length).toBe((searchFixture.objects as unknown[]).length);
    expect(cards.length).toBeGreaterThan(0);
  });

  test("each card has the contract's required fields present", () => {
    for (const c of cards) {
      expect(typeof c.id).toBe("string");
      expect(c.id.length).toBeGreaterThan(0);
      expect(typeof c.title).toBe("string");
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.url).toMatch(/^https:\/\/www\.instahyre\.com\//);
      // Present-but-nullable keys must exist, never be omitted.
      expect(c).toHaveProperty("company");
      expect(c).toHaveProperty("location");
      expect(c).toHaveProperty("date");
    }
  });

  test("date is always null — the portal exposes no posting date", () => {
    expect(cards.every((c) => c.date === null)).toBe(true);
  });

  test("maps employer.company_name onto company", () => {
    const opkey = cards.find((c) => c.id === "344067");
    expect(opkey?.company).toBe("Opkey");
    expect(opkey?.title).toBe("LLM Engineer");
    expect(opkey?.location).toBe("Bangalore");
  });

  test("keywords come through as a string array", () => {
    const opkey = cards.find((c) => c.id === "344067");
    expect(opkey?.keywords).toContain("LLMs");
    expect(Array.isArray(opkey?.keywords)).toBe(true);
  });
});

describe("parseJobCard resilience", () => {
  test("returns null for a record with no id", () => {
    expect(parseJobCard({ title: "x" })).toBeNull();
  });

  test("returns null for a record with no title", () => {
    expect(parseJobCard({ id: 1 })).toBeNull();
  });

  test("returns null for non-objects", () => {
    expect(parseJobCard(null)).toBeNull();
    expect(parseJobCard("nope")).toBeNull();
  });

  test("one malformed record does not break the rest of the page", () => {
    const mixed: Envelope = {
      objects: [null, { id: 5, title: "Good One" }, { nope: true }, "garbage"],
    };
    const cards = parseJobCards(mixed);
    expect(cards.length).toBe(1);
    expect(cards[0].title).toBe("Good One");
  });

  test("falls back to a constructed URL when public_url is missing", () => {
    const card = parseJobCard({ id: 99, title: "T" });
    expect(card?.url).toBe(jobUrl("99"));
  });

  test("tolerates a missing employer object", () => {
    const card = parseJobCard({ id: 7, title: "T" });
    expect(card?.company).toBeNull();
    expect(card?.employeeCount).toBeNull();
  });
});

describe("parseJobDetail (detail fixture)", () => {
  const job = parseJobDetail(detailFixture);

  test("parses the core fields", () => {
    expect(job?.id).toBe("438118");
    expect(job?.title).toBe("Staff Frontend Developer");
    expect(job?.company).toBe("OpenFX");
    expect(job?.location).toBe("Bangalore");
  });

  test("description is null — the API returns no job-description text", () => {
    expect(job?.description).toBeNull();
  });

  test("carries the company tagline and headcount", () => {
    expect(job?.companyTagline).toBe("Global finance solutions");
    expect(job?.employeeCount).toBe(10);
  });
});

describe("matchesLocation", () => {
  const card = parseJobCard({ id: 1, title: "T", locations: "Bangalore,Mumbai" })!;

  test("matches a city present in the locations string", () => {
    expect(matchesLocation(card, "Mumbai")).toBe(true);
  });

  test("is case-insensitive", () => {
    expect(matchesLocation(card, "bangalore")).toBe(true);
  });

  test("treats Bengaluru and Bangalore as the same city", () => {
    expect(matchesLocation(card, "Bengaluru")).toBe(true);
  });

  test("treats Gurugram and Gurgaon as the same city", () => {
    const g = parseJobCard({ id: 2, title: "T", locations: "Gurgaon" })!;
    expect(matchesLocation(g, "Gurugram")).toBe(true);
  });

  test("maps Remote onto Work From Home", () => {
    const wfh = parseJobCard({ id: 3, title: "T", locations: "Work From Home" })!;
    expect(matchesLocation(wfh, "Remote")).toBe(true);
  });

  test("rejects a city that is not listed", () => {
    expect(matchesLocation(card, "Chennai")).toBe(false);
  });

  test("an empty filter matches everything", () => {
    expect(matchesLocation(card, "  ")).toBe(true);
  });

  test("a null location never matches a real city", () => {
    const nowhere = parseJobCard({ id: 4, title: "T" })!;
    expect(matchesLocation(nowhere, "Bangalore")).toBe(false);
  });
});

describe("resolveJobFunction", () => {
  test("maps known facet names to their observed ids", () => {
    expect(resolveJobFunction("machine-learning")).toBe("9");
    expect(resolveJobFunction("Backend")).toBe("10");
    expect(resolveJobFunction("full-stack")).toBe("1");
  });

  test("passes a numeric id through unchanged", () => {
    expect(resolveJobFunction("76")).toBe("76");
  });
});

describe("htmlToText", () => {
  test("decodes entities and strips tags", () => {
    expect(htmlToText("<p>R&amp;D &#233;quipe</p>")).toBe("R&D équipe");
  });

  test("turns list items into bullets and keeps paragraph breaks", () => {
    const out = htmlToText("<ul><li>One</li><li>Two</li></ul><p>After</p>");
    expect(out).toContain("• One");
    expect(out).toContain("• Two");
    expect(out).toContain("After");
  });

  test("decodes supplementary-plane numeric entities", () => {
    expect(htmlToText("&#128512;")).toBe("😀");
  });
});
