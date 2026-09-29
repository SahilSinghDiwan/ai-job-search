# Fixtures

Real HTML captured from We Work Remotely on **2026-08-25**. Every byte in these
files is a verbatim slice of a live response — nothing was hand-written,
reformatted or edited. Only whole regions were cut out, to keep the repo small.

| File | Source URL | What was kept |
|------|------------|---------------|
| `search-ai-engineer.html` | `/remote-jobs/search?term=AI+engineer` | 7 complete `<li>` listing elements (6 real + 1 sponsored `listing-ad`), wrapped in the page's own `#search-results` / `<section class="jobs">` / `<ul>` scaffolding. Chosen to cover every eligibility case: a bare US country tag, "Anywhere in the World", "North America Only", a card with no geographic chip at all, a card with a published salary, and the 76-country listing that includes Indonesia but not India. |
| `detail-anywhere.html` | `/remote-jobs/a-team-senior-independent-ai-engineer-architect` | The `application/ld+json` block, the `<h1>`, the description div, and the "About the job" sidebar `<ul>`. A worldwide posting: `Region: Anywhere in the World`, 249-entry `applicantLocationRequirements` including `IN`, and the stale-`datePosted` re-post case (JSON-LD says 2024-06-16, the page says 19 days ago). |
| `detail-geolocked-us.html` | `/remote-jobs/sinclair-broadcast-group-sr-principal-data-engineer-data-architect` | Same slices. A GeoLocked posting: `Country: 🇺🇸 United States of America`, `(This job is GeoLocked)`, `applicantLocationRequirements: ["US"]`, and a JSON-LD date that agrees with the page. |

## Refreshing them

Only refresh when WWR changes its markup and a parser breaks. Capture with a
browser User-Agent, one request at a time, and slice out the same regions:

```bash
curl -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 \
  (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
  "https://weworkremotely.com/remote-jobs/search?term=AI+engineer" -o /tmp/wwr.html
```

The tests pin absolute dates (`2026-08-05` and friends) against a fixed
`TODAY = 2026-08-25`, so a refresh means updating those expectations too.
