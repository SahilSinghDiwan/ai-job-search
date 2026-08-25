import type { JobResult } from "./types.ts";

function pad(s: string, width: number): string {
  const t = s.length > width ? s.slice(0, width - 1) + "…" : s;
  return t + " ".repeat(Math.max(0, width - t.length));
}

const CURRENCY_GLYPH: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
};

/** Compact human-readable money, e.g. 3000000 INR -> "₹30L". */
export function formatMoney(n: number, currency: string | null): string {
  const g = currency ? (CURRENCY_GLYPH[currency] ?? currency + " ") : "";
  if (currency === "INR") {
    if (n >= 1e7) return `${g}${+(n / 1e7).toFixed(2)}Cr`;
    if (n >= 1e5) return `${g}${+(n / 1e5).toFixed(2)}L`;
    return `${g}${n.toLocaleString("en-IN")}`;
  }
  if (n >= 1e6) return `${g}${+(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${g}${+(n / 1e3).toFixed(0)}k`;
  return `${g}${n}`;
}

export function formatSalary(job: JobResult): string {
  const s = job.salary;
  if (s.raw === null) return "-";
  if (s.min === null) return s.raw;
  const range =
    s.max !== null && s.max !== s.min
      ? `${formatMoney(s.min, s.currency)}-${formatMoney(s.max, s.currency)}`
      : formatMoney(s.min, s.currency);
  const eq = s.equity.offered === true ? " +eq" : s.equity.offered === false ? " noeq" : "";
  return range + eq;
}

const VERDICT_MARK: Record<string, string> = {
  PASS: "PASS",
  FLAG: "FLAG",
  FLAG_UNVERIFIED: "FLAG?",
  NOT_REMOTE: "onsite",
};

export function renderTable(results: JobResult[]): string {
  if (!results.length) return "No results.";
  const rows = results.map((r) => {
    const req = r.eligibility.statedRequirements.length
      ? `!${r.eligibility.statedRequirements.length}`
      : "";
    return [
      pad(r.id, 8),
      pad(r.title, 40),
      pad(r.company ?? "-", 22),
      pad(r.location ?? "-", 26),
      pad(formatSalary(r), 20),
      pad(r.date ?? "-", 10),
      pad(r.ageDays !== null ? `${r.ageDays}d` : "-", 5),
      pad((VERDICT_MARK[r.eligibility.tagVerdict] ?? "-") + req, 8),
    ].join(" ");
  });
  const header = [
    pad("ID", 8),
    pad("TITLE", 40),
    pad("COMPANY", 22),
    pad("LOCATION", 26),
    pad("SALARY", 20),
    pad("POSTED", 10),
    pad("AGE", 5),
    pad("ELIG", 8),
  ].join(" ");
  return [header, "-".repeat(header.length), ...rows].join("\n");
}

export function renderPlain(results: JobResult[]): string {
  return results
    .map((r) => {
      const lines = [
        `${r.title}${r.company ? ` — ${r.company}` : ""}`,
        `  id:       ${r.id}`,
        `  location: ${r.location ?? "-"}`,
        `  salary:   ${r.salary.raw ?? "not published"}${r.salary.equity.raw ? ` • ${r.salary.equity.raw}` : ""}`,
        `  posted:   ${r.date ?? "-"}${r.ageDays !== null ? ` (${r.ageDays} days ago, exact)` : ""}`,
        `  remote:   ${r.eligibility.workplace ?? "-"} [${r.eligibility.tagVerdict}]`,
        `  note:     ${r.eligibility.tagReason}`,
      ];
      for (const q of r.eligibility.statedRequirements) {
        lines.push(`  stated ${q.kind}: "${q.quote}"`);
      }
      lines.push(`  url:      ${r.url}`);
      return lines.join("\n");
    })
    .join("\n\n");
}
