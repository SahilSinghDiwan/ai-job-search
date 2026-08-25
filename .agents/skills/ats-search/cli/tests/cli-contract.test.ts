import { describe, test, expect } from "bun:test";
import { join } from "path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { runCLI, parseJSON } from "./helpers";

// Every case here is OFFLINE by construction — argument validation, the
// company-list reader, and help/error paths. Nothing in this file makes a
// network request, so CI never touches a live ATS.

const tmp = mkdtempSync(join(tmpdir(), "ats-search-"));
const GOOD_LIST = join(tmp, "good.txt");
const BAD_LIST = join(tmp, "bad.txt");
writeFileSync(GOOD_LIST, "# note\ngreenhouse anthropic  # Claude\nashby sarvam\nlever cred\n");
writeFileSync(BAD_LIST, "workday acme\n");

describe("help and dispatch", () => {
  test("no command prints help and exits 1", async () => {
    const r = await runCLI([]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("ats-search");
    expect(r.stdout).toContain("USAGE");
  });

  test("--help exits 0 when a command was given", async () => {
    const r = await runCLI(["search", "--help"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("SEARCH FLAGS");
  });

  test("the help text states the slug-enumeration constraint", async () => {
    const r = await runCLI([]);
    expect(r.stdout).toContain("No ATS provider lets you enumerate board slugs");
  });

  test("an unknown command errors as JSON on stderr", async () => {
    const r = await runCLI(["frobnicate"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toBe("");
    expect(JSON.parse(r.stderr).code).toBe("BAD_CMD");
  });
});

describe("companies command (offline)", () => {
  test("json output uses the {meta, results} envelope", async () => {
    const r = await runCLI(["companies", "--companies", GOOD_LIST, "--format", "json"]);
    const out = parseJSON<{ meta: { count: number }; results: unknown[] }>(r);
    expect(out.meta.count).toBe(3);
    expect(out.results.length).toBe(3);
  });

  test("table output lists provider, slug and note", async () => {
    const r = await runCLI(["companies", "--companies", GOOD_LIST, "--format", "table"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("greenhouse");
    expect(r.stdout).toContain("anthropic");
    expect(r.stdout).toContain("Claude");
  });

  test("a malformed list is reported on stderr and exits 1", async () => {
    const r = await runCLI(["companies", "--companies", BAD_LIST]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("unknown provider");
  });

  test("a missing list file is a clean error, not a stack trace", async () => {
    const r = await runCLI(["companies", "--companies", join(tmp, "nope.txt")]);
    expect(r.exitCode).toBe(1);
    const err = JSON.parse(r.stderr);
    expect(err.code).toBe("COMPANY_LIST_FAILED");
    expect(err.error).toContain("--companies");
  });

  test("the shipped default list loads with no arguments at all", async () => {
    const r = await runCLI(["companies", "--format", "json"]);
    const out = parseJSON<{ meta: { count: number } }>(r);
    expect(out.meta.count).toBeGreaterThanOrEqual(30);
  });
});

describe("argument validation (never reaches the network)", () => {
  const cases: Array<[string, string[]]> = [
    ["BAD_ARG", ["search", "--page", "abc", "--companies", GOOD_LIST]],
    ["BAD_ARG", ["search", "--limit", "abc", "--companies", GOOD_LIST]],
    ["BAD_ARG", ["search", "--jobage", "soon", "--companies", GOOD_LIST]],
    ["BAD_ARG", ["search", "--provider", "workday", "--companies", GOOD_LIST]],
    ["BAD_ARG", ["search", "--since", "last-tuesday", "--companies", GOOD_LIST]],
    ["BAD_ARG", ["check", "workday", "acme"]],
    ["BAD_ARG", ["check", "greenhouse"]],
    ["NO_ID", ["detail"]],
    ["BAD_ID", ["detail", "not-an-id"]],
    ["BAD_ID", ["detail", "https://example.com/jobs/1"]],
    ["NO_COMPANIES", ["search", "--company", "no-such-company", "--companies", GOOD_LIST]],
    ["NO_COMPANIES", ["search", "--provider", "lever", "--companies", BAD_LIST]],
  ];

  for (const [code, args] of cases) {
    test(`${args.join(" ")} -> ${code} on stderr, exit 1`, async () => {
      const r = await runCLI(args);
      expect(r.exitCode).toBe(1);
      // Errors go to stderr only. stdout stays clean so a caller can always
      // pipe it into a JSON parser.
      expect(r.stdout).toBe("");
      const lines = r.stderr.split("\n").filter((l) => l.startsWith("{"));
      expect(JSON.parse(lines[lines.length - 1]!).code).toBe(code);
    });
  }
});
