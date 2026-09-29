import { describe, test, expect } from "bun:test";
import { join } from "path";
import * as greenhouse from "../src/providers/greenhouse";
import * as ashby from "../src/providers/ashby";
import * as lever from "../src/providers/lever";
import { htmlToText, looksRemote, matchesLocation, matchesQuery, toIsoDate, daysBetween } from "../src/helpers";

// Fixtures are REAL responses captured live from each provider on 2026-08-25
// (see url-reference.md). Only the very long description bodies were truncated
// and the job arrays sliced; every field name, type and nesting is verbatim.
// CI never hits the live portals — all parsing assertions run against these.
const fx = (name: string) => Bun.file(join(import.meta.dir, "fixtures", name)).json();

const ghFixture = await fx("greenhouse-anthropic.json");
const abFixture = await fx("ashby-sarvam.json");
const lvFixture = await fx("lever-cred.json");
const lvNotFound = await fx("lever-notfound.json");

describe("greenhouse mapping", () => {
  const jobs = greenhouse.mapList(ghFixture, "anthropic");

  test("maps every job in the fixture", () => {
    expect(jobs.length).toBe(5);
  });

  test("every job satisfies the portal-skill contract shape", () => {
    for (const j of jobs) {
      expect(typeof j.id).toBe("string");
      expect(typeof j.title).toBe("string");
      expect(j.title.length).toBeGreaterThan(0);
      expect(j.url).toMatch(/^https:\/\//);
      // Nullable keys must be PRESENT, never omitted.
      expect(j).toHaveProperty("company");
      expect(j).toHaveProperty("location");
      expect(j).toHaveProperty("date");
    }
  });

  test("id is the composite provider:slug:jobId key", () => {
    expect(jobs[0]!.id).toBe("greenhouse:anthropic:4461450008");
    expect(jobs[0]!.jobId).toBe("4461450008");
    expect(jobs[0]!.companySlug).toBe("anthropic");
  });

  test("date comes from first_published, NOT updated_at", () => {
    // This req was first published 2024-12-20 but edited in Aug 2026. Using
    // updated_at would have made a two-year-old posting look days old — the
    // exact failure /rank must not inherit.
    const stale = jobs.find((j) => j.jobId === "4461450008")!;
    expect(stale.date).toBe("2024-12-20");
    const fresh = jobs.find((j) => j.jobId === "5400138008")!;
    expect(fresh.date).toBe("2026-08-24");
  });

  test("location.name is flattened to a string", () => {
    expect(jobs[0]!.location).toBe("New York City, NY; San Francisco, CA | New York City, NY");
  });

  test("company_name is carried through", () => {
    expect(jobs[0]!.company).toBe("Anthropic");
  });

  test("the 'Location Type' metadata field becomes workplaceType", () => {
    expect(jobs[0]!.workplaceType).toBe("On-Site");
    expect(jobs[0]!.remote).toBe(false);
  });

  test("a Location Type with a null value yields null, not a guessed false", () => {
    const noType = jobs.find((j) => j.jobId === "5101378008")!;
    expect(noType.workplaceType).toBeNull();
    expect(noType.remote).toBeNull();
  });

  test("extractLocationType accepts array values and ignores unrelated metadata", () => {
    expect(
      greenhouse.extractLocationType([
        { name: "Some Other Field", value: "ignore me" },
        { name: "Location Type", value: ["Remote", "Hybrid"] },
      ]),
    ).toBe("Remote, Hybrid");
    expect(greenhouse.extractLocationType([{ name: "Team", value: "Research" }])).toBeNull();
    expect(greenhouse.extractLocationType(null)).toBeNull();
  });

  test("departments are joined", () => {
    expect(jobs[0]!.department).toBe("Sales");
  });

  test("content is decoded from Greenhouse's double-encoded HTML", () => {
    // The raw field contains "&lt;div ...&gt;" — a single decode pass would
    // leave visible tags in the text.
    expect(jobs[0]!.description).toBeTruthy();
    expect(jobs[0]!.description).not.toContain("&lt;");
    expect(jobs[0]!.description).not.toContain("<div");
  });

  test("a malformed record is skipped, not fatal", () => {
    const mixed = { jobs: [{ nonsense: true }, ...(ghFixture as any).jobs] };
    expect(greenhouse.mapList(mixed, "anthropic").length).toBe(5);
    expect(greenhouse.mapJob({ id: 1 }, "x")).toBeNull();
    expect(greenhouse.mapJob(null, "x")).toBeNull();
  });

  test("URLs are built on the API host only when absolute_url is missing", () => {
    const built = greenhouse.mapJob({ id: "9", title: "T" }, "acme")!;
    expect(built.url).toBe("https://job-boards.greenhouse.io/acme/jobs/9");
  });
});

describe("ashby mapping", () => {
  const jobs = ashby.mapList(abFixture, "sarvam");

  test("maps every listed job", () => {
    expect(jobs.length).toBe(5);
    expect(jobs[0]!.id).toMatch(/^ashby:sarvam:/);
  });

  test("date comes from publishedAt", () => {
    expect(jobs[0]!.date).toBe("2026-06-03");
  });

  test("isRemote and workplaceType are surfaced verbatim", () => {
    expect(jobs[0]!.remote).toBe(false);
    expect(jobs[0]!.workplaceType).toBe("OnSite");
  });

  test("Bengaluru postings match the Bangalore alias", () => {
    const blr = jobs.filter((j) => matchesLocation(j, "Bangalore"));
    expect(blr.length).toBeGreaterThan(0);
  });

  test("secondaryLocations are joined onto location", () => {
    const j = ashby.mapJob(
      {
        id: "x",
        title: "T",
        location: "New York, NY (HQ)",
        secondaryLocations: [{ location: "Remote (US)" }, { location: "Miami, FL" }],
        isRemote: true,
        workplaceType: "Hybrid",
      },
      "ramp",
    )!;
    expect(j.location).toBe("New York, NY (HQ) | Remote (US) | Miami, FL");
    expect(looksRemote(j)).toBe(true);
  });

  test("unlisted postings are dropped", () => {
    const withHidden = { jobs: [{ id: "h", title: "Hidden", isListed: false }, ...(abFixture as any).jobs] };
    expect(ashby.mapList(withHidden, "sarvam").length).toBe(5);
  });

  test("descriptions are only included when asked for", () => {
    expect(jobs[0]!.description).toBeUndefined();
    const withDesc = ashby.mapList(abFixture, "sarvam", true);
    expect(typeof withDesc[0]!.description).toBe("string");
    expect(withDesc[0]!.description).not.toContain("<p");
  });
});

describe("lever mapping", () => {
  const jobs = lever.mapList(lvFixture, "cred");

  test("maps the bare array response", () => {
    expect(jobs.length).toBe(4);
    expect(jobs[0]!.id).toMatch(/^lever:cred:/);
  });

  test("title comes from `text`, not `title`", () => {
    expect(jobs[0]!.title).toBe("area collections manager bangalore -prefr");
  });

  test("createdAt epoch milliseconds convert to an ISO date", () => {
    expect(jobs[0]!.date).toBe(toIsoDate(1787543704191));
    expect(jobs[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("categories are flattened into location/department/employmentType", () => {
    expect(jobs[0]!.location).toBe("bengaluru");
    expect(jobs[0]!.employmentType).toBe("full time");
    expect(jobs[0]!.department).toBe("Prefr");
  });

  test("workplaceType drives remote", () => {
    expect(jobs[0]!.workplaceType).toBe("onsite");
    expect(jobs[0]!.remote).toBe(false);
  });

  test("Lever's soft 404 body is recognised as not-found", () => {
    expect(lever.isNotFoundBody(lvNotFound)).toBe(true);
    expect(lever.isNotFoundBody([])).toBe(false);
    expect(lever.isNotFoundBody({ ok: true })).toBe(false);
  });

  test("an empty board is an empty array, not an error", () => {
    expect(lever.mapList([], "lever")).toEqual([]);
  });

  test("the emitted URL is jobs.lever.co but the fetch URL is api.lever.co", () => {
    // jobs.lever.co disallows ClaudeBot; it is a link for a human, never a
    // request target. Only api.lever.co is ever fetched.
    expect(jobs[0]!.url).toContain("jobs.lever.co");
    expect(lever.listUrl("cred")).toBe("https://api.lever.co/v0/postings/cred?mode=json");
    expect(lever.detailUrl("cred", "abc")).toBe("https://api.lever.co/v0/postings/cred/abc?mode=json");
  });
});

describe("shared helpers", () => {
  test("toIsoDate handles ISO strings, epoch ms, and refuses garbage", () => {
    expect(toIsoDate("2026-08-21T21:32:54-04:00")).toBe("2026-08-22");
    expect(toIsoDate(1787543704191)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(toIsoDate("not a date")).toBeNull();
    expect(toIsoDate(null)).toBeNull();
    expect(toIsoDate(0)).toBeNull();
    expect(toIsoDate({})).toBeNull();
  });

  test("daysBetween", () => {
    expect(daysBetween("2026-08-01", "2026-08-25")).toBe(24);
    expect(daysBetween("garbage", "2026-08-25")).toBeNull();
  });

  test("htmlToText preserves list and paragraph breaks", () => {
    const text = htmlToText("<p>Intro</p><ul><li>One</li><li>Two &amp; a half</li></ul>");
    expect(text).toContain("Intro");
    expect(text).toContain("One");
    expect(text).toContain("Two & a half");
    expect(text).not.toContain("<");
  });

  test("matchesQuery is case-insensitive across title, department and location", () => {
    const jobs = lever.mapList(lvFixture, "cred");
    expect(matchesQuery(jobs[0]!, "COLLECTIONS")).toBe(true);
    expect(matchesQuery(jobs[0]!, "prefr")).toBe(true);
    expect(matchesQuery(jobs[0]!, "quantum")).toBe(false);
    expect(matchesQuery(jobs[0]!, "")).toBe(true);
  });

  test("looksRemote falls back to the location text when nothing else says", () => {
    const jobs = greenhouse.mapList(ghFixture, "anthropic");
    const fake = { ...jobs[0]!, remote: null, workplaceType: null, location: "Remote - India" };
    expect(looksRemote(fake)).toBe(true);
    expect(looksRemote({ ...fake, location: "Bengaluru" })).toBe(false);
  });
});
