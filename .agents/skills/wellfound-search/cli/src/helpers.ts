import type {
  Currency,
  Eligibility,
  Equity,
  JobResult,
  Salary,
  SearchOutput,
  StatedRequirement,
} from "./types.ts";

export const BASE = "https://wellfound.com";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export class CLIError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

/* ------------------------------------------------------------------ *
 * robots.txt posture — enforced in code, not just documented.
 *
 * wellfound.com/robots.txt disallows /search and the ?jobId= / ?jobSlug= /
 * ?role= / ?preview= / ?inFrame= / ?after_sign_in= query patterns, plus /re/,
 * /u/, /projects/, /auth/, /jobs/applications and /jobs/signup.
 *
 * This CLI only ever builds URLs under the permitted browse paths. The guard
 * below is a backstop so a future edit cannot quietly introduce a blocked
 * path: any URL this CLI is about to fetch is checked first, and a violation
 * is a hard error rather than a request.
 * ------------------------------------------------------------------ */
const DISALLOWED_PREFIXES = [
  "/_jobs/",
  "/auth/",
  "/cdn-cgi/",
  "/documents/",
  "/embed/",
  "/job_listings/report_company",
  "/job_pairings/howitworks",
  "/job_profiles/embed",
  "/jobs/applications",
  "/jobs/signup",
  "/onboarding",
  "/profile/edit",
  "/profile/notifications",
  "/profile/review",
  "/profile/resume",
  "/projects/",
  "/re/",
  "/recruit/dashboard",
  "/search",
  "/social/share_modal",
  "/u/",
];
const DISALLOWED_PARAMS = [
  "after_sign_in",
  "inFrame",
  "jobId",
  "jobSlug",
  "preview",
  "role",
];

/** Throws if `url` would violate wellfound.com/robots.txt. */
export function assertRobotsAllowed(url: string): void {
  const u = new URL(url, BASE);
  for (const p of DISALLOWED_PREFIXES) {
    if (u.pathname === p || u.pathname.startsWith(p)) {
      throw new CLIError(
        `refusing to fetch ${u.pathname}: disallowed by wellfound.com/robots.txt`,
        "ROBOTS_DISALLOWED"
      );
    }
  }
  for (const p of DISALLOWED_PARAMS) {
    if (u.searchParams.has(p)) {
      throw new CLIError(
        `refusing to fetch ${u.pathname}?${p}=...: query pattern disallowed by wellfound.com/robots.txt`,
        "ROBOTS_DISALLOWED"
      );
    }
  }
}

/* ------------------------------------------------------------------ *
 * Fetching
 * ------------------------------------------------------------------ */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface FetchOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

/**
 * Fetch a browse page.
 *
 * redirect: "manual" is load-bearing. Wellfound answers an unknown role or
 * location slug with a 303 to the *unfiltered* role page, which then returns
 * 200 with real-looking listings for the wrong query. Following that redirect
 * silently is how a "Bengaluru" search comes back full of San Francisco jobs.
 * We surface it as an error instead.
 */
export async function fetchPage(
  url: string,
  opts: FetchOptions = {}
): Promise<string> {
  assertRobotsAllowed(url);
  const maxRetries = opts.maxRetries ?? 5;
  const baseDelay = opts.baseDelayMs ?? 1000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
    } catch (err) {
      if (attempt === maxRetries) {
        throw new CLIError(
          `network error fetching ${url}: ${(err as Error).message}`,
          "NETWORK_ERROR"
        );
      }
      await sleep(baseDelay * 2 ** attempt + Math.random() * 250);
      continue;
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location") ?? "(none)";
      throw new CLIError(
        `Wellfound redirected ${url} -> ${loc}. That means the role or location ` +
          `slug is not one it recognises; it falls back to an unfiltered page ` +
          `rather than 404ing. Check the slug (e.g. "bangalore", not "bangalore-india").`,
        "SLUG_NOT_RECOGNISED"
      );
    }
    if (res.status === 404) {
      throw new CLIError(`not found: ${url}`, "NOT_FOUND");
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt === maxRetries) {
        throw new CLIError(
          `Wellfound returned HTTP ${res.status} after ${maxRetries} retries; back off and try later`,
          res.status === 429 ? "RATE_LIMITED" : "UPSTREAM_ERROR"
        );
      }
      await sleep(baseDelay * 2 ** attempt + Math.random() * 250);
      continue;
    }
    if (!res.ok) {
      throw new CLIError(`Wellfound returned HTTP ${res.status} for ${url}`, "HTTP_ERROR");
    }
    return await res.text();
  }
  throw new CLIError(`exhausted retries fetching ${url}`, "RETRY_EXHAUSTED");
}

/* ------------------------------------------------------------------ *
 * Slugs
 * ------------------------------------------------------------------ */

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Wellfound has no free-text browse path (/search is robots-disallowed), so a
 * query is mapped onto one of its role slugs. Aliases cover the phrasings a
 * user is likely to type for a slug that exists under a different name.
 */
export const ROLE_ALIASES: Record<string, string> = {
  ai: "ai-engineer",
  "ai-ml-engineer": "ai-engineer",
  "genai-engineer": "ai-engineer",
  "generative-ai-engineer": "ai-engineer",
  "llm-engineer": "ai-engineer",
  "ml-engineer": "machine-learning-engineer",
  ml: "machine-learning-engineer",
  mle: "machine-learning-engineer",
  "machine-learning": "machine-learning-engineer",
  backend: "backend-engineer",
  "backend-developer": "backend-engineer",
  frontend: "frontend-engineer",
  fullstack: "full-stack-engineer",
  "fullstack-engineer": "full-stack-engineer",
  "data-science": "data-scientist",
  devops: "devops-engineer",
  sre: "devops-engineer",
  "python-developer": "backend-engineer",
  swe: "software-engineer",
};

/**
 * Location slugs verified against the live site. The "-india" suffix forms are
 * mapped away deliberately: /role/l/ai-engineer/bangalore-india 303s to the
 * unfiltered role page, which is what made an earlier research pass conclude
 * Bengaluru volume was "thin". It is not — /bangalore reports 225 AI-engineer
 * jobs.
 */
export const LOCATION_ALIASES: Record<string, string> = {
  bengaluru: "bangalore",
  "bengaluru-india": "bangalore",
  "bangalore-india": "bangalore",
  "bangalore-karnataka": "bangalore",
  blr: "bangalore",
  "new-delhi": "delhi",
  ncr: "delhi",
  gurugram: "gurgaon",
  bombay: "mumbai",
  "india-remote": "india",
};

export function resolveRoleSlug(input: string): string {
  const s = slugify(input);
  return ROLE_ALIASES[s] ?? s;
}

export function resolveLocationSlug(input: string): string {
  const s = slugify(input);
  return LOCATION_ALIASES[s] ?? s;
}

export function buildSearchUrl(opts: {
  role: string;
  location?: string | null;
  remote?: boolean;
  page?: number;
}): string {
  const role = resolveRoleSlug(opts.role);
  const page = opts.page ?? 1;
  let path: string;
  if (opts.remote) {
    // /role/r/{slug} is the site's own remote browse path. It is mutually
    // exclusive with a location slug — Wellfound has no /role/r/{slug}/{loc}.
    path = `/role/r/${role}`;
  } else if (opts.location) {
    path = `/role/l/${role}/${resolveLocationSlug(opts.location)}`;
  } else {
    path = `/role/${role}`;
  }
  // ?page= is NOT in robots.txt's disallowed query list (unlike ?role=).
  return page > 1 ? `${BASE}${path}?page=${page}` : `${BASE}${path}`;
}

export function buildJobUrl(id: string, slug: string | null): string {
  return slug ? `${BASE}/jobs/${id}-${slug}` : `${BASE}/jobs/${id}`;
}

/** Accepts a bare id, an "id-slug" pair, or a full Wellfound job URL. */
export function parseJobRef(ref: string): { id: string; slug: string | null } {
  const trimmed = ref.trim();
  const urlMatch = trimmed.match(/wellfound\.com\/jobs\/(\d+)(?:-([a-z0-9-]+))?/i);
  if (urlMatch) return { id: urlMatch[1]!, slug: urlMatch[2] ?? null };
  const pairMatch = trimmed.match(/^(\d+)-([a-z0-9-]+)$/i);
  if (pairMatch) return { id: pairMatch[1]!, slug: pairMatch[2]! };
  if (/^\d+$/.test(trimmed)) return { id: trimmed, slug: null };
  throw new CLIError(
    `could not read a job id from "${ref}" — pass a numeric id, an "id-slug" pair, or a wellfound.com/jobs/... URL`,
    "BAD_JOB_REF"
  );
}

/* ------------------------------------------------------------------ *
 * Compensation
 * ------------------------------------------------------------------ */

const CURRENCY_BY_SYMBOL: Record<string, Currency> = {
  "₹": "INR",
  "Rs": "INR",
  "INR": "INR",
  "$": "USD",
  "US$": "USD",
  "€": "EUR",
  "£": "GBP",
};

/** "30L" -> 3000000, "50k" -> 50000, "1.2M" -> 1200000, "10,000" -> 10000 */
export function parseAmount(token: string): number | null {
  const m = token.replace(/,/g, "").match(/([\d.]+)\s*(Cr|L|k|K|M|m)?/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  switch (m[2]) {
    case "Cr":
      return n * 1e7;
    case "L":
      return n * 1e5;
    case "k":
    case "K":
      return n * 1e3;
    case "M":
    case "m":
      return n * 1e6;
    default:
      return n;
  }
}

const EMPTY_EQUITY: Equity = {
  mentioned: false,
  offered: null,
  raw: null,
  minPercent: null,
  maxPercent: null,
};

export const EMPTY_SALARY: Salary = {
  raw: null,
  min: null,
  max: null,
  currency: null,
  currencySource: null,
  period: null,
  equity: EMPTY_EQUITY,
};

/**
 * Parse a Wellfound browse-card compensation string.
 *
 * Real shapes seen live (2026-08-25):
 *   "₹30L – ₹47L • 0.02% – 0.05%"
 *   "₹15L – ₹25L • No equity"
 *   "₹10,000 – ₹20,000 • No equity"
 *   "$112k – $140k"
 *   ""  (no compensation published)
 *
 * NOTE: the card never states a period. `period` stays null here on purpose;
 * `detail` fills it from schema.org unitText.
 */
export function parseCompensation(raw: string | null | undefined): Salary {
  if (!raw || !raw.trim()) return { ...EMPTY_SALARY, equity: { ...EMPTY_EQUITY } };

  const parts = raw.split("•").map((p) => p.trim());
  const payPart = parts[0] ?? "";
  const equityPart = parts.slice(1).join(" • ").trim();

  let currency: Currency = null;
  for (const [sym, code] of Object.entries(CURRENCY_BY_SYMBOL)) {
    if (payPart.includes(sym)) {
      currency = code;
      break;
    }
  }

  const amounts = [...payPart.matchAll(/[\d][\d,.]*\s*(?:Cr|L|k|K|M|m)?/g)]
    .map((m) => parseAmount(m[0]))
    .filter((n): n is number => n !== null);

  const equity: Equity = { ...EMPTY_EQUITY };
  if (equityPart) {
    equity.mentioned = true;
    equity.raw = equityPart;
    if (/no\s+equity/i.test(equityPart)) {
      equity.offered = false;
    } else {
      const pcts = [...equityPart.matchAll(/([\d.]+)\s*%/g)].map((m) => Number(m[1]));
      if (pcts.length) {
        equity.offered = pcts.some((p) => p > 0);
        equity.minPercent = pcts[0] ?? null;
        equity.maxPercent = pcts.length > 1 ? pcts[pcts.length - 1]! : (pcts[0] ?? null);
      }
    }
  }

  return {
    raw: payPart || null,
    min: amounts[0] ?? null,
    max: amounts.length > 1 ? amounts[amounts.length - 1]! : (amounts[0] ?? null),
    currency,
    currencySource: currency ? "symbol" : null,
    period: null,
    equity,
  };
}

/* ------------------------------------------------------------------ *
 * Remote eligibility
 *
 * Two SEPARATE outputs, per 04-job-evaluation.md:
 *   tagVerdict          <- structured geography tags. Never FAIL.
 *   statedRequirements  <- verbatim quotes that a human may judge FAIL.
 * ------------------------------------------------------------------ */

const INDIA_HINTS = [
  "india",
  "bengaluru",
  "bangalore",
  "hyderabad",
  "mumbai",
  "delhi",
  "pune",
  "chennai",
  "gurgaon",
  "gurugram",
  "noida",
  "kolkata",
  "kochi",
  "ahmedabad",
  "jaipur",
];
const WORLDWIDE_HINTS = ["worldwide", "anywhere", "global", "remote - global"];
const APAC_HINTS = ["apac", "asia pacific", "asia-pacific", "south asia"];

const REQUIREMENT_PATTERNS: Array<{ kind: StatedRequirement["kind"]; re: RegExp }> = [
  // Residency — "you must be somewhere Bengaluru is not."
  { kind: "residency", re: /must\s+(?:reside|live|be\s+based|be\s+located|be\s+physically\s+located)\b[^.!?\n]*/gi },
  { kind: "residency", re: /(?:candidates?|applicants?|you)\s+must\s+be\s+(?:physically\s+)?(?:located|based|residing)\b[^.!?\n]*/gi },
  { kind: "residency", re: /required\s+to\s+(?:reside|live|be\s+based|be\s+located)\b[^.!?\n]*/gi },
  { kind: "residency", re: /this\s+role\s+is\s+(?:only\s+)?open\s+to\s+(?:candidates|applicants|residents)\s+(?:residing|located|based)\b[^.!?\n]*/gi },
  // Work authorization
  { kind: "work-authorization", re: /(?:must\s+be\s+)?(?:legally\s+)?authoriz(?:ed|ation)\s+to\s+work\b[^.!?\n]*/gi },
  { kind: "work-authorization", re: /without\s+(?:the\s+need\s+for\s+)?(?:visa\s+)?sponsorship\b[^.!?\n]*/gi },
  { kind: "work-authorization", re: /(?:we\s+)?(?:are\s+)?(?:unable|not\s+able)\s+to\s+(?:offer|provide)\s+(?:visa\s+)?sponsorship\b[^.!?\n]*/gi },
  { kind: "work-authorization", re: /(?:existing\s+)?right\s+to\s+work\s+in\b[^.!?\n]*/gi },
  // Citizenship / clearance — parent gate in 04-job-evaluation.md
  { kind: "citizenship", re: /must\s+be\s+a\s+(?:citizen|permanent\s+resident|us\s+person)\b[^.!?\n]*/gi },
  { kind: "citizenship", re: /(?:active\s+)?security\s+clearance\s+(?:is\s+)?(?:required|needed)\b[^.!?\n]*/gi },
];

/**
 * Scan a description for lines that MAY be hard location/authorization gates.
 * Returns verbatim quotes only. Deliberately does not decide anything: an empty
 * array means "no pattern matched", NOT "this role is open to India".
 */
export function findStatedRequirements(description: string | null | undefined): StatedRequirement[] {
  if (!description) return [];
  const text = stripHtml(description);
  const out: StatedRequirement[] = [];
  const seen = new Set<string>();
  for (const { kind, re } of REQUIREMENT_PATTERNS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const quote = m[0].trim().replace(/\s+/g, " ").slice(0, 300);
      const key = quote.toLowerCase();
      if (quote.length < 12 || seen.has(key)) continue;
      seen.add(key);
      out.push({ kind, quote });
    }
  }
  return out;
}

export function classifyEligibility(args: {
  workplace: string | null;
  locations: string[];
  acceptedRemoteLocations: string[];
  description?: string | null;
}): Eligibility {
  const { workplace, locations, acceptedRemoteLocations } = args;
  const statedRequirements = findStatedRequirements(args.description);

  const isRemote =
    workplace === "REMOTE" ||
    workplace === "ONSITE_OR_REMOTE" ||
    acceptedRemoteLocations.length > 0;

  let tagVerdict: Eligibility["tagVerdict"];
  let tagReason: string;

  if (!isRemote) {
    tagVerdict = "NOT_REMOTE";
    tagReason = locations.length
      ? `On-site role in ${locations.join(", ")}. The remote sub-gate does not apply; judge it as a physical-location role.`
      : "Not flagged remote by the portal and no location given.";
  } else {
    const hay = [...acceptedRemoteLocations, ...locations].join(" | ").toLowerCase();
    const hasIndia = INDIA_HINTS.some((h) => hay.includes(h));
    const hasWorldwide = WORLDWIDE_HINTS.some((h) => hay.includes(h));
    const hasApac = APAC_HINTS.some((h) => hay.includes(h));

    if (hasIndia || hasWorldwide || hasApac) {
      tagVerdict = "PASS";
      tagReason = hasIndia
        ? `Eligibility tags name India or an Indian city (${hay}).`
        : `Eligibility tags name a worldwide/APAC scope (${hay}).`;
    } else if (acceptedRemoteLocations.length > 0) {
      tagVerdict = "FLAG";
      tagReason =
        `Remote, tagged to ${acceptedRemoteLocations.join(", ")} and not India. ` +
        `Per 04-job-evaluation.md a geography tag alone is a FLAG, not a FAIL — ` +
        `verify whether the employer hires India-based staff (Indian entity, EOR, or contractor).`;
    } else {
      tagVerdict = "FLAG_UNVERIFIED";
      tagReason =
        "Marked remote but silent on geography. Report as geography-unconfirmed; " +
        "check the careers page and any single-country benefits before drafting.";
    }
  }

  if (statedRequirements.length) {
    tagReason +=
      ` NOTE: ${statedRequirements.length} stated requirement(s) quoted in ` +
      `statedRequirements — read them verbatim; they may be a FAIL under 04-job-evaluation.md.`;
  }

  return {
    workplace,
    locations,
    acceptedRemoteLocations,
    tagVerdict,
    tagReason,
    statedRequirements,
  };
}

/* ------------------------------------------------------------------ *
 * HTML / JSON extraction
 * ------------------------------------------------------------------ */

export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)));
}

export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface ApolloData {
  [key: string]: any;
}

/** Pull the normalised Apollo cache out of a browse page's __NEXT_DATA__ blob. */
export function extractApolloData(html: string): { data: ApolloData; pageProps: any } {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) {
    throw new CLIError(
      "no __NEXT_DATA__ block in the response — Wellfound may have changed its " +
        "rendering, or the request was served a challenge page. Do not work " +
        "around a challenge; report the skill as broken.",
      "NO_EMBEDDED_DATA"
    );
  }
  let parsed: any;
  try {
    parsed = JSON.parse(m[1]!);
  } catch (err) {
    throw new CLIError(`__NEXT_DATA__ was not valid JSON: ${(err as Error).message}`, "BAD_EMBEDDED_DATA");
  }
  const pageProps = parsed?.props?.pageProps;
  const data = pageProps?.apolloState?.data;
  if (!data || typeof data !== "object") {
    throw new CLIError("__NEXT_DATA__ had no apolloState.data", "BAD_EMBEDDED_DATA");
  }
  return { data, pageProps };
}

function deref(data: ApolloData, node: any): any {
  if (node && typeof node === "object" && typeof node.__ref === "string") {
    return data[node.__ref];
  }
  return node;
}

export interface ParseSearchOptions {
  url: string;
  roleSlug: string;
  locationSlug: string | null;
  remote: boolean;
  page: number;
  /** Injected in tests so date maths is deterministic. */
  now?: Date;
}

/**
 * Turn a browse page into the {meta, results} envelope.
 *
 * Structure (verified live 2026-08-25): ROOT_QUERY.talent holds a key like
 *   seoLandingPageJobSearchResults({"location":"bangalore","page":1,"role":"ai-engineer"})
 * whose `startups` are __refs to StartupResult nodes, each with
 * `highlightedJobListings` __refs to JobListingSearchResult nodes.
 */
export function parseSearchPage(html: string, opts: ParseSearchOptions): SearchOutput {
  const { data, pageProps } = extractApolloData(html);

  // Belt-and-braces against the silent-fallback problem: even if a redirect was
  // somehow followed, the page tells us which role/location it actually served.
  const servedRole = pageProps?.role ?? null;
  const servedLocation = pageProps?.location ?? null;
  if (servedRole && servedRole !== opts.roleSlug) {
    throw new CLIError(
      `asked Wellfound for role "${opts.roleSlug}" but it served "${servedRole}"`,
      "SLUG_NOT_RECOGNISED"
    );
  }
  if (opts.locationSlug && servedLocation !== opts.locationSlug) {
    throw new CLIError(
      `asked Wellfound for location "${opts.locationSlug}" but it served ` +
        `${servedLocation ? `"${servedLocation}"` : "an unfiltered page"}. ` +
        `Wellfound silently widens an unrecognised location slug instead of 404ing.`,
      "SLUG_NOT_RECOGNISED"
    );
  }

  const talent = data.ROOT_QUERY?.talent ?? {};
  const key = Object.keys(talent).find((k) => k.startsWith("seoLandingPageJobSearchResults"));
  const block = key ? talent[key] : null;

  const results: JobResult[] = [];
  const now = opts.now ?? new Date();

  for (const startupRef of block?.startups ?? []) {
    const startup = deref(data, startupRef);
    if (!startup) continue;
    const badges: string[] = (startup.badges ?? [])
      .map((b: any) => deref(data, b))
      .map((b: any) => b?.name ?? b?.label ?? null)
      .filter((b: any): b is string => typeof b === "string" && b.length > 0);

    for (const jobRef of startup.highlightedJobListings ?? []) {
      const job = deref(data, jobRef);
      if (!job) continue;

      const remoteConfig = job.remoteConfig ?? null;
      const locations: string[] = Array.isArray(job.locationNames) ? job.locationNames : [];
      const accepted: string[] = Array.isArray(job.acceptedRemoteLocationNames)
        ? job.acceptedRemoteLocationNames
        : [];

      const epoch = typeof job.liveStartAt === "number" ? job.liveStartAt : null;
      const postedAt = epoch ? new Date(epoch * 1000) : null;
      const ageDays = postedAt
        ? Math.floor((now.getTime() - postedAt.getTime()) / 86_400_000)
        : null;

      results.push({
        id: String(job.id),
        title: job.title ?? "",
        company: (startup.name ?? "").trim() || null,
        location: locations.length ? locations.join(", ") : accepted.length ? `Remote (${accepted.join(", ")})` : null,
        date: postedAt ? postedAt.toISOString().slice(0, 10) : null,
        postedAt: postedAt ? postedAt.toISOString() : null,
        datePrecision: postedAt ? "exact" : "unknown",
        ageDays,
        url: buildJobUrl(String(job.id), job.slug ?? null),
        salary: parseCompensation(job.compensation),
        eligibility: classifyEligibility({
          workplace: remoteConfig?.kind ?? null,
          locations,
          acceptedRemoteLocations: accepted,
          description: job.description ?? null,
        }),
        jobType: job.jobType ?? null,
        yearsExperienceMin: job.yearsExperienceMin ?? null,
        yearsExperienceMax: job.yearsExperienceMax ?? null,
        companySlug: startup.slug ?? null,
        companySize: startup.companySize ?? null,
        companyPitch: startup.highConcept ?? null,
        badges,
        autoPosted: Boolean(job.autoPosted),
        atsSource: job.atsSource ?? null,
      });
    }
  }

  const withSalary = results.filter((r) => r.salary.raw !== null).length;

  return {
    meta: {
      count: results.length,
      page: opts.page,
      pageCount: block?.pageCount ?? null,
      perPage: block?.perPage ?? null,
      totalJobCount: block?.totalJobCount ?? null,
      totalStartupCount: block?.totalStartupCount ?? null,
      roleSlug: opts.roleSlug,
      locationSlug: opts.locationSlug,
      remote: opts.remote,
      url: opts.url,
      salaryCoverage: {
        withSalary,
        total: results.length,
        fraction: results.length ? Number((withSalary / results.length).toFixed(3)) : 0,
      },
      postingDates:
        "exact — derived from the listing's own Unix epoch (liveStartAt), not a " +
        "relative string. No precision loss; ageDays is a true age, not a floor.",
      notes: [],
    },
    results,
  };
}

/* ------------------------------------------------------------------ *
 * Detail page (schema.org JobPosting JSON-LD)
 * ------------------------------------------------------------------ */

export interface JobDetail {
  id: string;
  title: string;
  company: string | null;
  companyUrl: string | null;
  location: string | null;
  country: string | null;
  date: string | null;
  postedAt: string | null;
  datePrecision: "exact" | "unknown";
  url: string;
  salary: Salary;
  eligibility: Eligibility;
  jobType: string | null;
  monthsOfExperience: number | null;
  industry: string | null;
  benefits: string | null;
  directApply: boolean | null;
  description: string;
}

export function parseDetailPage(html: string, url: string, id: string): JobDetail {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  let ld: any = null;
  for (const b of blocks) {
    try {
      const parsed = JSON.parse(b[1]!);
      const candidate = Array.isArray(parsed) ? parsed.find((p) => p?.["@type"] === "JobPosting") : parsed;
      if (candidate?.["@type"] === "JobPosting") {
        ld = candidate;
        break;
      }
    } catch {
      // A malformed block must not break the others.
    }
  }
  if (!ld) {
    throw new CLIError(
      `no schema.org JobPosting block on ${url} — the posting may be closed, or ` +
        `Wellfound changed the page. Do not guess the fields.`,
      "NO_JOB_POSTING_DATA"
    );
  }

  const org = ld.hiringOrganization ?? {};
  const places = Array.isArray(ld.jobLocation) ? ld.jobLocation : ld.jobLocation ? [ld.jobLocation] : [];
  const locality = places
    .map((p: any) => {
      const a = p?.address ?? {};
      return [a.addressLocality, a.addressRegion, a.addressCountry].filter(Boolean).join(", ");
    })
    .filter(Boolean);
  const country = places[0]?.address?.addressCountry ?? null;

  // applicantLocationRequirements is schema.org's own remote-eligibility field —
  // the structured tag, i.e. a FLAG input, never a FAIL on its own.
  const alrRaw = ld.applicantLocationRequirements;
  const alr = Array.isArray(alrRaw) ? alrRaw : alrRaw ? [alrRaw] : [];
  const acceptedRemoteLocations = alr
    .map((x: any) => (typeof x === "string" ? x : x?.name))
    .filter((x: any): x is string => typeof x === "string");

  const description = stripHtml(ld.description ?? "");

  const salary = { ...EMPTY_SALARY, equity: { ...EMPTY_SALARY.equity } };
  const bs = ld.baseSalary;
  if (bs?.value) {
    const v = bs.value;
    salary.min = typeof v.minValue === "number" ? v.minValue : (typeof v.value === "number" ? v.value : null);
    salary.max = typeof v.maxValue === "number" ? v.maxValue : salary.min;
    salary.currency = (bs.currency ?? null) as Currency;
    salary.currencySource = bs.currency ? "jsonld" : null;
    salary.period = v.unitText ?? null;
    salary.raw =
      salary.min !== null
        ? `${salary.currency ?? ""} ${salary.min.toLocaleString("en-US")} - ${(salary.max ?? salary.min).toLocaleString("en-US")}${salary.period ? ` per ${salary.period.toLowerCase()}` : ""}`.trim()
        : null;
  }

  const posted = ld.datePosted ? new Date(ld.datePosted) : null;
  const validPosted = posted && !Number.isNaN(posted.getTime()) ? posted : null;

  return {
    id,
    title: ld.title ?? "",
    company: (org.name ?? "").trim() || null,
    companyUrl: org.sameAs ?? null,
    location: locality.length ? locality.join(" | ") : ld.jobLocationType === "TELECOMMUTE" ? "Remote" : null,
    country,
    date: validPosted ? validPosted.toISOString().slice(0, 10) : null,
    postedAt: validPosted ? validPosted.toISOString() : null,
    datePrecision: validPosted ? "exact" : "unknown",
    url,
    salary,
    eligibility: classifyEligibility({
      workplace: ld.jobLocationType === "TELECOMMUTE" ? "REMOTE" : locality.length ? "ONSITE" : null,
      locations: locality,
      acceptedRemoteLocations,
      description,
    }),
    jobType: ld.employmentType ?? null,
    monthsOfExperience:
      typeof ld.experienceRequirements?.monthsOfExperience === "number"
        ? ld.experienceRequirements.monthsOfExperience
        : null,
    industry: ld.industry ? String(ld.industry).trim() : null,
    benefits: ld.jobBenefits ? stripHtml(String(ld.jobBenefits)) : null,
    directApply: typeof ld.directApply === "boolean" ? ld.directApply : null,
    description,
  };
}

/* ------------------------------------------------------------------ *
 * Output
 * ------------------------------------------------------------------ */

export function writeError(message: string, code: string): void {
  process.stderr.write(JSON.stringify({ error: message, code }) + "\n");
}
