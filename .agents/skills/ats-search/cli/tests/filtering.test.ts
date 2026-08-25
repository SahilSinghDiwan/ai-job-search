import { describe, test, expect } from "bun:test";
import { join } from "path";
import { applyFilters, sortByDateDesc } from "../src/commands/search";
import * as greenhouse from "../src/providers/greenhouse";
import * as ashby from "../src/providers/ashby";
import * as lever from "../src/providers/lever";
import type { Job } from "../src/helpers";

const fx = (name: string) => Bun.file(join(import.meta.dir, "fixtures", name)).json();

// A pooled result set exactly as `search` builds it: three providers' boards
// concatenated into one flat list.
const pooled: Job[] = [
  ...greenhouse.mapList(await fx("greenhouse-anthropic.json"), "anthropic"),
  ...ashby.mapList(await fx("ashby-sarvam.json"), "sarvam"),
  ...lever.mapList(await fx("lever-cred.json"), "cred"),
];

const TODAY = "2026-08-25";

describe("pooling across providers", () => {
  test("all three providers land in one flat list with the same shape", () => {
    expect(pooled.length).toBe(14);
    expect(new Set(pooled.map((j) => j.provider))).toEqual(
      new Set(["greenhouse", "ashby", "lever"]),
    );
    for (const j of pooled) {
      for (const key of ["id", "title", "company", "location", "date", "url"]) {
        expect(j).toHaveProperty(key);
      }
    }
  });

  test("ids are globally unique across providers", () => {
    expect(new Set(pooled.map((j) => j.id)).size).toBe(pooled.length);
  });

  test("only Greenhouse states a company name; the others rely on the slug backfill", () => {
    // fetchBoard fills `company` from the slug for Ashby and Lever, so /rank
    // never sees a null company label.
    expect(pooled.find((j) => j.provider === "greenhouse")!.company).toBe("Anthropic");
    expect(pooled.find((j) => j.provider === "ashby")!.company).toBeNull();
    expect(pooled.find((j) => j.provider === "lever")!.company).toBeNull();
    const backfilled = pooled.map((j) => ({ ...j, company: j.company ?? j.companySlug }));
    expect(backfilled.every((j) => typeof j.company === "string")).toBe(true);
  });
});

describe("sortByDateDesc", () => {
  test("newest first", () => {
    const sorted = sortByDateDesc(pooled);
    const dates = sorted.map((j) => j.date).filter((d): d is string => d !== null);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1]! >= dates[i]!).toBe(true);
    }
  });

  test("undated postings sort last, never first", () => {
    const withNull = sortByDateDesc([...pooled, { ...pooled[0]!, id: "x:y:z", date: null }]);
    expect(withNull[withNull.length - 1]!.date).toBeNull();
  });

  test("does not mutate its input", () => {
    const before = pooled.map((j) => j.id);
    sortByDateDesc(pooled);
    expect(pooled.map((j) => j.id)).toEqual(before);
  });
});

describe("applyFilters", () => {
  test("query narrows case-insensitively", () => {
    const out = applyFilters(pooled, { query: "engineer", today: TODAY });
    expect(out.length).toBeGreaterThan(0);
    // The Greenhouse fixture was captured with ?content=true, so its
    // descriptions are part of the haystack — same as a --content run.
    expect(
      out.every((j) =>
        /engineer/i.test(`${j.title} ${j.department ?? ""} ${j.location ?? ""} ${j.description ?? ""}`),
      ),
    ).toBe(true);
  });

  test("location matches the Bengaluru/Bangalore alias in both directions", () => {
    const a = applyFilters(pooled, { location: "Bangalore", today: TODAY });
    const b = applyFilters(pooled, { location: "Bengaluru", today: TODAY });
    expect(a.length).toBe(b.length);
    expect(a.length).toBeGreaterThan(0);
  });

  test("jobage filters on the real posting date and excludes undated postings", () => {
    const recent = applyFilters(pooled, { jobage: 30, today: TODAY });
    expect(recent.every((j) => j.date !== null && j.date >= "2026-07-26")).toBe(true);
    // The 2024-12-20 Anthropic req must be excluded despite a 2026 updated_at.
    expect(recent.some((j) => j.jobId === "4461450008")).toBe(false);

    const undated = [{ ...pooled[0]!, id: "u:u:u", date: null }];
    expect(applyFilters(undated, { jobage: 3650, today: TODAY })).toEqual([]);
  });

  test("since is inclusive of the boundary date", () => {
    const out = applyFilters(pooled, { since: "2026-08-20", today: TODAY });
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((j) => (j.date ?? "") >= "2026-08-20")).toBe(true);
  });

  test("remoteOnly keeps only what the ATS itself marks remote", () => {
    // Every fixture posting is on-site, so this correctly returns nothing —
    // an honest empty result rather than a hopeful guess.
    expect(applyFilters(pooled, { remoteOnly: true, today: TODAY })).toEqual([]);
    const remote: Job = { ...pooled[0]!, id: "r:r:r", remote: true };
    expect(applyFilters([remote], { remoteOnly: true, today: TODAY }).length).toBe(1);
  });

  test("filters compose", () => {
    const out = applyFilters(pooled, { query: "manager", location: "Bengaluru", today: TODAY });
    expect(out.every((j) => /manager/i.test(j.title))).toBe(true);
    expect(out.every((j) => /beng|bang/i.test(j.location ?? ""))).toBe(true);
  });

  test("no filters is a pass-through", () => {
    expect(applyFilters(pooled, { today: TODAY }).length).toBe(pooled.length);
  });
});
