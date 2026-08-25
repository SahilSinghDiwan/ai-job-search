// Shared result types for the wellfound-search CLI.
//
// Design note: this CLI *extracts and quotes*. It never returns a hiring
// verdict. The FLAG-vs-FAIL judgement lives in
// .claude/skills/job-application-assistant/04-job-evaluation.md and is made by
// the human (or by /rank reading these fields), not here.

export type Currency = "INR" | "USD" | "EUR" | "GBP" | "CAD" | "AUD" | null;

export interface Equity {
  /** Did the posting say anything at all about equity? */
  mentioned: boolean;
  /** true = a range was offered, false = explicitly "No equity", null = unstated. */
  offered: boolean | null;
  /** Verbatim equity substring as the portal rendered it. */
  raw: string | null;
  minPercent: number | null;
  maxPercent: number | null;
}

export interface Salary {
  /** Verbatim compensation string as rendered on the card, e.g. "₹30L – ₹47L". */
  raw: string | null;
  min: number | null;
  max: number | null;
  currency: Currency;
  /**
   * "symbol"  = inferred from the currency glyph on the browse card. A bare "$"
   *             is assumed USD; Wellfound does not disambiguate CAD/AUD/SGD there.
   * "jsonld"  = taken from schema.org baseSalary.currency on the detail page.
   *             Authoritative — prefer it when present.
   */
  currencySource: "symbol" | "jsonld" | null;
  /**
   * "YEAR" | "MONTH" | "HOUR" from the detail page's JSON-LD unitText.
   * ALWAYS null on search results: the browse card states an amount with no
   * period. Do not assume annual — a "₹10,000 – ₹20,000" intern card is monthly.
   * Run `detail` to resolve it.
   */
  period: string | null;
  equity: Equity;
}

/**
 * A verbatim line from the posting that looks like a hard location or
 * work-authorization requirement. These are the FAIL *candidates* under
 * 04-job-evaluation.md — quoted, never judged here.
 */
export interface StatedRequirement {
  kind: "residency" | "work-authorization" | "citizenship";
  quote: string;
}

export interface Eligibility {
  /** ONSITE | REMOTE | ONSITE_OR_REMOTE | null (portal's own remoteConfig.kind). */
  workplace: string | null;
  /** Office/company locations attached to the listing. */
  locations: string[];
  /**
   * Wellfound's structured remote-eligibility tags, e.g. ["United States"].
   * A tag is a *tag*: per 04-job-evaluation.md a bare geography tag is a FLAG,
   * never a FAIL on its own.
   */
  acceptedRemoteLocations: string[];
  /**
   * Verdict derived ONLY from the structured tags. Deliberately cannot be
   * "FAIL" — a tag alone can never fail a role under the framework.
   *   PASS            - India / APAC / worldwide named, or an India office location
   *   FLAG            - tagged to a geography that is not India
   *   FLAG_UNVERIFIED - remote but silent on geography
   *   NOT_REMOTE      - an on-site role; the parent location gate applies instead
   */
  tagVerdict: "PASS" | "FLAG" | "FLAG_UNVERIFIED" | "NOT_REMOTE";
  tagReason: string;
  /**
   * Verbatim quotes that MAY constitute a FAIL. Separate from tagVerdict on
   * purpose: collapsing the two is exactly the error 04-job-evaluation.md warns
   * about. An empty array is not a pass — it means nothing matched the patterns.
   */
  statedRequirements: StatedRequirement[];
}

export interface JobResult {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  /** ISO YYYY-MM-DD, derived from an exact Unix epoch. Never a relative string. */
  date: string | null;
  url: string;
  /** Full ISO-8601 instant. Exact to the second — see datePrecision. */
  postedAt: string | null;
  /** "exact" whenever liveStartAt was present; "unknown" if the portal omitted it. */
  datePrecision: "exact" | "unknown";
  ageDays: number | null;
  salary: Salary;
  eligibility: Eligibility;
  jobType: string | null;
  yearsExperienceMin: number | null;
  yearsExperienceMax: number | null;
  companySlug: string | null;
  companySize: string | null;
  companyPitch: string | null;
  badges: string[];
  /** true when the listing was auto-imported from the company's ATS. */
  autoPosted: boolean;
  atsSource: string | null;
}

export interface SearchMeta {
  count: number;
  page: number;
  pageCount: number | null;
  perPage: number | null;
  /** Portal's own total for this role+location — the real volume signal. */
  totalJobCount: number | null;
  totalStartupCount: number | null;
  roleSlug: string;
  locationSlug: string | null;
  remote: boolean;
  url: string;
  /** How many of the emitted results carried a compensation string. */
  salaryCoverage: { withSalary: number; total: number; fraction: number };
  postingDates: string;
  notes: string[];
}

export interface SearchOutput {
  meta: SearchMeta;
  results: JobResult[];
}
