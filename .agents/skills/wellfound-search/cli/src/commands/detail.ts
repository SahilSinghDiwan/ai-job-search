import { CLIError, buildJobUrl, fetchPage, parseDetailPage, parseJobRef } from "../helpers.ts";
import type { JobDetail } from "../helpers.ts";

export async function runDetail(ref: string, format: "json" | "plain" | "table"): Promise<string> {
  const { id, slug } = parseJobRef(ref);
  const url = buildJobUrl(id, slug);
  let html: string;
  try {
    html = await fetchPage(url);
  } catch (err) {
    // Wellfound job URLs require the title slug; /jobs/<id> alone 404s. The
    // slug is always present in the `url` field of a search result, so say so
    // rather than leaving the caller with a bare "not found".
    if (!slug && err instanceof CLIError && err.code === "NOT_FOUND") {
      throw new CLIError(
        `Wellfound has no /jobs/${id} page: its job URLs need the title slug too. ` +
          `Pass the "id-slug" pair or the full url from a search result ` +
          `(e.g. ${id}-senior-ai-engineer).`,
        "SLUG_REQUIRED"
      );
    }
    throw err;
  }
  const detail = parseDetailPage(html, url, id);
  if (format === "json") return JSON.stringify(detail, null, 2);
  return renderDetailPlain(detail);
}

export function renderDetailPlain(d: JobDetail): string {
  const lines: string[] = [];
  lines.push(d.title);
  if (d.company) lines.push(`Company:  ${d.company}${d.companyUrl ? ` (${d.companyUrl})` : ""}`);
  lines.push(`Location: ${d.location ?? "-"}`);
  lines.push(
    `Salary:   ${d.salary.raw ?? "not published"}` +
      (d.salary.currencySource === "jsonld" ? "  [currency from schema.org, authoritative]" : "")
  );
  lines.push(`Posted:   ${d.date ?? "-"}${d.postedAt ? ` (${d.postedAt}, exact)` : ""}`);
  lines.push(`Type:     ${d.jobType ?? "-"}`);
  if (d.monthsOfExperience !== null) {
    lines.push(`Experience: ${d.monthsOfExperience} months (~${Math.round(d.monthsOfExperience / 12)} yrs)`);
  }
  lines.push(`Eligibility: ${d.eligibility.tagVerdict} — ${d.eligibility.tagReason}`);
  if (d.eligibility.acceptedRemoteLocations.length) {
    lines.push(`  remote tags: ${d.eligibility.acceptedRemoteLocations.join(", ")}`);
  }
  if (d.eligibility.statedRequirements.length) {
    lines.push("  Stated requirements quoted verbatim (judge these against 04-job-evaluation.md):");
    for (const q of d.eligibility.statedRequirements) lines.push(`    [${q.kind}] "${q.quote}"`);
  }
  lines.push(`URL:      ${d.url}`);
  if (d.industry) lines.push(`Industry: ${d.industry}`);
  lines.push("");
  lines.push("--- Description ---");
  lines.push(d.description);
  if (d.benefits) {
    lines.push("");
    lines.push("--- Benefits ---");
    lines.push(d.benefits);
  }
  return lines.join("\n");
}
