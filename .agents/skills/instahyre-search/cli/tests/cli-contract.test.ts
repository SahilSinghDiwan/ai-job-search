import { describe, expect, test } from "bun:test";
import { runCLI } from "./helpers";

// Every case here fails (or prints) BEFORE any network call, so the suite runs
// offline in CI. Nothing in this file contacts Instahyre.

function parsedStderr(stderr: string): { error?: string; code?: string } {
  const line = stderr.split("\n").find((l) => l.trim().startsWith("{"));
  try {
    return line ? JSON.parse(line) : {};
  } catch {
    return {};
  }
}

describe("help and dispatch", () => {
  test("no command prints help and exits 1", async () => {
    const r = await runCLI([]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("instahyre-cli");
  });

  test("--help exits 0 on a real command", async () => {
    const r = await runCLI(["search", "--help"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("SEARCH FLAGS");
  });

  test("help documents the unsupported recency flags", async () => {
    const r = await runCLI(["search", "--help"]);
    expect(r.stdout).toContain("NOT SUPPORTED BY THIS PORTAL");
    expect(r.stdout).toMatch(/--jobage/);
  });

  test("an unknown command exits 1 with BAD_CMD on stderr", async () => {
    const r = await runCLI(["frobnicate"]);
    expect(r.exitCode).toBe(1);
    expect(parsedStderr(r.stderr).code).toBe("BAD_CMD");
    expect(r.stdout).toBe("");
  });
});

describe("search flag validation", () => {
  test("--limit non-numeric exits 1 with BAD_ARG", async () => {
    const r = await runCLI(["search", "--limit", "xyz"]);
    expect(r.exitCode).toBe(1);
    const err = parsedStderr(r.stderr);
    expect(err.code).toBe("BAD_ARG");
    expect(err.error).toMatch(/limit/);
  });

  test("--page non-numeric exits 1 with BAD_ARG", async () => {
    const r = await runCLI(["search", "--page", "abc", "--limit", "1"]);
    expect(r.exitCode).toBe(1);
    expect(parsedStderr(r.stderr).code).toBe("BAD_ARG");
  });

  test("--job-type non-numeric exits 1 with BAD_ARG", async () => {
    const r = await runCLI(["search", "--job-type", "nope", "--limit", "xyz"]);
    expect(r.exitCode).toBe(1);
    expect(parsedStderr(r.stderr).code).toBe("BAD_ARG");
  });

  test("errors go to stderr, never stdout", async () => {
    const r = await runCLI(["search", "--limit", "xyz"]);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("BAD_ARG");
  });
});

describe("unsupported recency flags warn loudly", () => {
  // Paired with a bad --limit so the run aborts before any network call while
  // still exercising the warning, which is emitted first.
  test("--jobage prints an explicit not-supported warning", async () => {
    const r = await runCLI(["search", "--jobage", "14", "--limit", "xyz"]);
    expect(r.stderr).toMatch(/--jobage is not supported by Instahyre/);
    expect(r.stderr).toMatch(/NOT filtered by recency/);
  });

  test("--since prints an explicit not-supported warning", async () => {
    const r = await runCLI(["search", "--since", "2026-08-01", "--limit", "xyz"]);
    expect(r.stderr).toMatch(/--since is not supported by Instahyre/);
  });

  test("no warning when the flag is absent", async () => {
    const r = await runCLI(["search", "--limit", "xyz"]);
    expect(r.stderr).not.toMatch(/not supported by Instahyre/);
  });
});

describe("detail argument validation", () => {
  test("missing id exits 1 with NO_ID", async () => {
    const r = await runCLI(["detail"]);
    expect(r.exitCode).toBe(1);
    expect(parsedStderr(r.stderr).code).toBe("NO_ID");
  });

  test("unparseable id exits 1 with BAD_ID before any request", async () => {
    const r = await runCLI(["detail", "not-an-id"]);
    expect(r.exitCode).toBe(1);
    expect(parsedStderr(r.stderr).code).toBe("BAD_ID");
  });
});
