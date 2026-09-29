import { join } from "path";
import { readFileSync } from "fs";

const CLI_PATH = join(import.meta.dir, "../src/cli.ts");

export interface CLIResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runCLI(args: string[]): Promise<CLIResult> {
  const proc = Bun.spawn(["bun", "run", CLI_PATH, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

export function parseJSON<T = unknown>(result: CLIResult): T {
  if (result.exitCode !== 0) {
    throw new Error(`CLI exited with code ${result.exitCode}. stderr: ${result.stderr}`);
  }
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    throw new Error(`Failed to parse JSON. stdout: ${result.stdout}\nstderr: ${result.stderr}`);
  }
}

/**
 * Fixtures are real responses captured from wellfound.com on 2026-08-25,
 * trimmed to a handful of listings with long description bodies truncated.
 * Field names, nesting, and values are untouched. No test makes a network call.
 */
export function fixture(name: string): string {
  return readFileSync(join(import.meta.dir, "fixtures", name), "utf-8");
}

/** Frozen "now" so ageDays assertions stay stable forever. */
export const CAPTURE_DATE = new Date("2026-08-25T12:00:00Z");
