import { afterEach, describe, expect, test } from "bun:test";
import { apiGet } from "../src/helpers";

// The portal contract requires backoff on 429/5xx. These tests pin the retry
// loop offline: a stubbed fetch counts attempts, and a stubbed setTimeout fires
// immediately so the exhaustion case does not sleep through the real backoff
// schedule. No network is touched.

const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
});

function instantTimers() {
  globalThis.setTimeout = ((fn: () => void) => originalSetTimeout(fn, 0)) as unknown as typeof setTimeout;
}

function stubFetch(responses: Array<() => Response>): { calls: number } {
  const state = { calls: 0 };
  globalThis.fetch = (async () => {
    const i = Math.min(state.calls, responses.length - 1);
    state.calls++;
    return responses[i]();
  }) as unknown as typeof fetch;
  return state;
}

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

describe("apiGet retry/backoff", () => {
  test("retries a 429 and succeeds on the next attempt", async () => {
    instantTimers();
    const state = stubFetch([
      () => new Response("", { status: 429 }),
      () => ok({ meta: { total_count: 1 }, objects: [] }),
    ]);

    const body = await apiGet("https://www.instahyre.com/api/v1/job_search");
    expect(body?.meta?.total_count).toBe(1);
    expect(state.calls).toBe(2);
  });

  test("returns null on 404 without retrying", async () => {
    const state = stubFetch([() => new Response("", { status: 404 })]);
    expect(await apiGet("https://www.instahyre.com/api/v1/job_search/1")).toBeNull();
    expect(state.calls).toBe(1);
  });

  test("gives up after the initial attempt plus six retries on persistent 5xx", async () => {
    instantTimers();
    const state = stubFetch([() => new Response("", { status: 500 })]);
    await expect(apiGet("https://www.instahyre.com/api/v1/job_search")).rejects.toThrow(/500/);
    expect(state.calls).toBe(7);
  });

  test("a persistent 429 surfaces the rate-limit hint", async () => {
    instantTimers();
    stubFetch([() => new Response("", { status: 429 })]);
    await expect(apiGet("https://www.instahyre.com/api/v1/job_search")).rejects.toThrow(/rate limited/);
  });

  test("does not retry a 4xx that is not 429", async () => {
    const state = stubFetch([() => new Response("", { status: 403 })]);
    await expect(apiGet("https://www.instahyre.com/api/v1/job_search")).rejects.toThrow(/403/);
    expect(state.calls).toBe(1);
  });

  test("an unreachable host fails fast with a clear message", async () => {
    const state = stubFetch([
      () => {
        throw new Error("ECONNREFUSED");
      },
    ]);
    await expect(apiGet("https://www.instahyre.com/api/v1/job_search")).rejects.toThrow(
      /could not reach the Instahyre API/,
    );
    expect(state.calls).toBe(1);
  });

  test("an unparseable 200 body is surfaced, not swallowed", async () => {
    stubFetch([() => new Response("not json", { status: 200 })]);
    await expect(apiGet("https://www.instahyre.com/api/v1/job_search")).rejects.toThrow(
      /unparseable/,
    );
  });
});
