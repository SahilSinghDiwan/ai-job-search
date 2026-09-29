import { describe, expect, test } from "bun:test";
import { runCLI } from "./helpers";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

// `table` is fully offline — it reads and writes a local Markdown file and
// never contacts Instahyre (the browser pass that supplies the dates lives
// outside this CLI). Every case below points --table at a temp file.
describe("table command", () => {
  const tmp = (name: string) =>
    join(tmpdir(), `instahyre-table-${process.pid}-${name}-${Math.random().toString(36).slice(2)}.md`);

  test("upsert seeds rows from a search envelope and reports counts", async () => {
    const path = tmp("seed");
    try {
      const envelope = JSON.stringify({
        meta: { count: 1 },
        results: [
          { id: "438746", title: "Senior AI Engineer", company: "Cloudwick", location: "Bangalore", date: null, url: "https://www.instahyre.com/job-438746-x/" },
        ],
      });
      const r = await runCLI(["table", "upsert", "--table", path, "--json", envelope]);
      expect(r.exitCode).toBe(0);
      const out = JSON.parse(r.stdout);
      expect(out.added).toBe(1);
      expect(out.total).toBe(1);
      expect(readFileSync(path, "utf8")).toContain("| id | title | company |");
    } finally {
      rmSync(path, { force: true });
    }
  });

  test("a second upsert with a date updates the row instead of appending", async () => {
    const path = tmp("idem");
    try {
      await runCLI(["table", "upsert", "--table", path, "--json", JSON.stringify([{ id: "438746", title: "Senior AI Engineer" }])]);
      const r = await runCLI([
        "table", "upsert", "--table", path, "--json",
        JSON.stringify([{ id: "438746", posted_date: "2026-08-14", verified_at: "2026-08-25" }]),
      ]);
      expect(JSON.parse(r.stdout)).toMatchObject({ added: 0, updated: 1, total: 1 });
      const file = readFileSync(path, "utf8");
      expect(file.match(/^\| 438746 /gm)).toHaveLength(1);
      expect(file).toContain("2026-08-14");
      expect(file).toContain("Senior AI Engineer");
    } finally {
      rmSync(path, { force: true });
    }
  });

  test("pending lists only rows still needing a browser read", async () => {
    const path = tmp("pending");
    try {
      await runCLI([
        "table", "upsert", "--table", path, "--json",
        JSON.stringify([
          { id: "111", title: "Dated", posted_date: "2026-08-14", verified_at: "2026-08-24" },
          { id: "222", title: "Undated" },
        ]),
      ]);
      const r = await runCLI(["table", "pending", "--table", path, "--today", "2026-08-25"]);
      expect(r.exitCode).toBe(0);
      const out = JSON.parse(r.stdout);
      expect(out.rows.map((x: { id: string }) => x.id)).toEqual(["222"]);
    } finally {
      rmSync(path, { force: true });
    }
  });

  test("list computes age_days from the verified posting date", async () => {
    const path = tmp("age");
    try {
      await runCLI([
        "table", "upsert", "--table", path, "--json",
        JSON.stringify([{ id: "111", posted_date: "2026-08-14", verified_at: "2026-08-25" }]),
      ]);
      const r = await runCLI(["table", "list", "--table", path, "--today", "2026-08-25"]);
      expect(JSON.parse(r.stdout).rows[0].age_days).toBe(11);
    } finally {
      rmSync(path, { force: true });
    }
  });

  test("list on a missing table file is empty, not an error", async () => {
    const r = await runCLI(["table", "list", "--table", tmp("absent")]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout).rows).toEqual([]);
  });

  test("an unknown subcommand exits 1 with BAD_SUBCMD", async () => {
    const r = await runCLI(["table", "frobnicate", "--table", tmp("bad")]);
    expect(r.exitCode).toBe(1);
    expect(parsedStderr(r.stderr).code).toBe("BAD_SUBCMD");
  });

  test("upsert without --json exits 1 with NO_INPUT", async () => {
    const r = await runCLI(["table", "upsert", "--table", tmp("noinput")]);
    expect(r.exitCode).toBe(1);
    expect(parsedStderr(r.stderr).code).toBe("NO_INPUT");
  });

  test("upsert with unparseable JSON exits 1 with BAD_JSON", async () => {
    const r = await runCLI(["table", "upsert", "--table", tmp("badjson"), "--json", "{not json"]);
    expect(r.exitCode).toBe(1);
    expect(parsedStderr(r.stderr).code).toBe("BAD_JSON");
  });

  test("help documents the opt-in enrichment table", async () => {
    const r = await runCLI(["table", "--help"]);
    expect(r.stdout).toContain("TABLE (posting-date enrichment");
    expect(r.stdout).toContain("datePosted");
  });
});
