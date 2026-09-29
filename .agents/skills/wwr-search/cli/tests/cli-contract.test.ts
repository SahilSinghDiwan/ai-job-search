// Contract tests for the CLI's argument handling and error convention.
// Every case here exits before any network request is made, so the suite is
// fully offline and safe to run in CI.

import { describe, expect, test } from "bun:test"
import { runCLI } from "./helpers.js"
import { normalizeId } from "../src/commands/detail.js"

describe("help and dispatch", () => {
  test("no command prints help and exits 1", async () => {
    const r = await runCLI([])
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain("USAGE")
    expect(r.stdout).toContain("--include-gated")
  })

  test("--help on a command exits 0", async () => {
    const r = await runCLI(["search", "--help"])
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain("ELIGIBILITY CLASSES")
  })

  test("an unknown command is a JSON error on stderr, exit 1", async () => {
    const r = await runCLI(["frobnicate"])
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toBe("")
    expect(JSON.parse(r.stderr)).toMatchObject({ code: "BAD_CMD" })
  })
})

describe("flag validation", () => {
  test("a non-numeric --jobage is rejected before any fetch", async () => {
    const r = await runCLI(["search", "--jobage", "soon"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr)).toMatchObject({ code: "BAD_ARG" })
  })

  test("a bad --format is rejected", async () => {
    const r = await runCLI(["search", "--format", "yaml"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr)).toMatchObject({ code: "BAD_ARG" })
  })

  test("--country demands ISO alpha-2 codes", async () => {
    const r = await runCLI(["search", "--country", "India"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).error).toContain("ISO 3166-1 alpha-2")
  })

  test("detail without an id is a JSON error", async () => {
    const r = await runCLI(["detail"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr)).toMatchObject({ code: "NO_ID" })
  })

  test("detail rejects an unparseable id without fetching", async () => {
    const r = await runCLI(["detail", "https://example.com/not/a/wwr/job"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr)).toMatchObject({ code: "BAD_ID" })
  })
})

describe("normalizeId", () => {
  test("accepts a bare slug, a path and a full URL", () => {
    expect(normalizeId("a-team-senior-independent-ai-engineer-architect")).toBe(
      "a-team-senior-independent-ai-engineer-architect",
    )
    expect(normalizeId("/remote-jobs/capslock-generative-ai-pipeline-engineer-tech-lead")).toBe(
      "capslock-generative-ai-pipeline-engineer-tech-lead",
    )
    expect(normalizeId("https://weworkremotely.com/remote-jobs/lemon-io-senior-ai-engineer-4?utm=x")).toBe(
      "lemon-io-senior-ai-engineer-4",
    )
  })

  test("rejects anything that is not a WWR listing reference", () => {
    expect(normalizeId("https://example.com/jobs/123")).toBeNull()
    expect(normalizeId("")).toBeNull()
  })
})
