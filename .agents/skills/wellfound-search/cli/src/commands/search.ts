import {
  CLIError,
  buildSearchUrl,
  fetchPage,
  parseSearchPage,
  resolveLocationSlug,
  resolveRoleSlug,
} from "../helpers.ts";
import { renderPlain, renderTable } from "../table.ts";
import type { SearchOutput } from "../types.ts";

export interface SearchArgs {
  query: string;
  location: string | null;
  remote: boolean;
  page: number;
  limit: number | null;
  jobage: number | null;
  hasSalary: boolean;
  format: "json" | "table" | "plain";
}

export async function runSearch(args: SearchArgs): Promise<string> {
  const roleSlug = resolveRoleSlug(args.query);
  if (!roleSlug) throw new CLIError("--query resolved to an empty role slug", "BAD_ARGS");
  if (args.remote && args.location) {
    throw new CLIError(
      "--remote and --location are mutually exclusive: Wellfound's remote browse " +
        "path (/role/r/<slug>) takes no location. Search remote, then read each " +
        "result's eligibility.acceptedRemoteLocations.",
      "BAD_ARGS"
    );
  }
  const locationSlug = args.location ? resolveLocationSlug(args.location) : null;
  const url = buildSearchUrl({
    role: roleSlug,
    location: locationSlug,
    remote: args.remote,
    page: args.page,
  });

  const html = await fetchPage(url);
  const out: SearchOutput = parseSearchPage(html, {
    url,
    roleSlug,
    locationSlug,
    remote: args.remote,
    page: args.page,
  });

  return finalize(out, args);
}

/** Filtering + formatting, split out so it can be tested against fixtures offline. */
export function finalize(out: SearchOutput, args: SearchArgs): string {
  let results = out.results;

  if (args.jobage !== null) {
    const before = results.length;
    results = results.filter((r) => r.ageDays !== null && r.ageDays <= args.jobage!);
    out.meta.notes.push(
      `--jobage ${args.jobage} applied client-side (Wellfound's browse pages take ` +
        `no recency parameter): ${before} -> ${results.length} on this page. Dates are ` +
        `exact, so this is a true age filter, not an approximation.`
    );
  }
  if (args.hasSalary) {
    const before = results.length;
    results = results.filter((r) => r.salary.raw !== null);
    out.meta.notes.push(`--has-salary applied: ${before} -> ${results.length} on this page.`);
  }
  if (args.limit !== null && results.length > args.limit) {
    results = results.slice(0, args.limit);
  }

  const withSalary = results.filter((r) => r.salary.raw !== null).length;
  out.results = results;
  out.meta.count = results.length;
  out.meta.salaryCoverage = {
    withSalary,
    total: results.length,
    fraction: results.length ? Number((withSalary / results.length).toFixed(3)) : 0,
  };

  if (out.meta.remote) {
    out.meta.notes.push(
      "Remote results are frequently gated to a single country. eligibility.tagVerdict " +
        "reports FLAG for a non-India geography tag and never FAIL — a tag alone is not a " +
        "disqualifier under 04-job-evaluation.md. Read eligibility.statedRequirements " +
        "verbatim for lines that may be an actual hard requirement."
    );
  }
  if (out.meta.totalJobCount !== null && out.meta.pageCount !== null && out.meta.pageCount > args.page) {
    out.meta.notes.push(
      `Wellfound reports ${out.meta.totalJobCount} jobs across ${out.meta.pageCount} pages ` +
        `for this role+location; this is page ${args.page}. Use --page to go deeper.`
    );
  }

  if (args.format === "table") return renderTable(results);
  if (args.format === "plain") return renderPlain(results);
  return JSON.stringify(out, null, 2);
}
