import { describe, expect, test } from "bun:test";
import { parseJSON, runCLI } from "./helpers.ts";

// These exercise the CLI's argument surface and error convention only.
// Nothing here reaches the network: every case fails (or succeeds) before a
// fetch is attempted.

describe("CLI contract — offline paths", () => {
  test("--help exits 0 and documents both commands", async () => {
    const r = await runCLI(["--help"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("search");
    expect(r.stdout).toContain("detail");
    expect(r.stderr).toBe("");
  });

  test("`roles` lists verified slugs with their measured Bangalore volume", async () => {
    const r = await runCLI(["roles"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("ai-engineer");
    expect(r.stdout).toContain("machine-learning-engineer");
    expect(r.stdout).toContain("225");
  });

  test("an unknown command exits 1 with a JSON error on stderr, not stdout", async () => {
    const r = await runCLI(["frobnicate"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toBe("");
    const err = JSON.parse(r.stderr);
    expect(err.code).toBe("BAD_ARGS");
    expect(err.error).toContain("frobnicate");
  });

  test("an unknown flag exits 1 with a JSON error", async () => {
    const r = await runCLI(["search", "--nope"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toBe("");
    expect(JSON.parse(r.stderr).code).toBe("BAD_ARGS");
  });

  test("a flag missing its value exits 1 rather than silently defaulting", async () => {
    const r = await runCLI(["search", "-q"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stderr).error).toContain("requires a value");
  });

  test("a non-numeric --limit is rejected", async () => {
    const r = await runCLI(["search", "--limit", "many"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stderr).code).toBe("BAD_ARGS");
  });

  test("an invalid --format is rejected", async () => {
    const r = await runCLI(["search", "--format", "yaml"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stderr).error).toContain("json|table|plain");
  });

  test("--remote and --location together are refused, not silently reconciled", async () => {
    const r = await runCLI(["search", "--remote", "-l", "bangalore"]);
    expect(r.exitCode).toBe(1);
    const err = JSON.parse(r.stderr);
    expect(err.code).toBe("BAD_ARGS");
    expect(err.error).toContain("mutually exclusive");
  });

  test("detail with no argument exits 1", async () => {
    const r = await runCLI(["detail"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stderr).code).toBe("BAD_ARGS");
  });

  test("detail with an unparseable ref exits 1 before any request", async () => {
    const r = await runCLI(["detail", "banana"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stderr).code).toBe("BAD_JOB_REF");
  });

  test("error output is one line of valid JSON with error+code keys", async () => {
    const r = await runCLI(["detail", "banana"]);
    const parsed = JSON.parse(r.stderr) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(["code", "error"]);
    expect(r.stderr.split("\n").length).toBe(1);
  });
});
