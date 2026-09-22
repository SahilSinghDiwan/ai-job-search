#!/usr/bin/env python3
"""Render reports/application-dashboard.html from the tracker and outcome archives.

Backs the /html-report command. Reads only — never writes to the tracker or the
archives. Re-running overwrites the report in place.

Usage: python3 tools/gen_dashboard.py [output.html]
"""

import csv, re, os, glob, html, datetime, math, sys

ROOT = "/Users/sahil/Downloads/ai-job-search"
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "reports", "application-dashboard.html")
E = lambda s: html.escape(str(s if s is not None else ""), quote=True).replace("'", "&#39;")

rows = list(csv.DictReader(open(os.path.join(ROOT, "job_search_tracker.csv"))))

# ---- outcome archives ----
def norm(s): return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()
STAGE_LABELS = ["Phone screen", "Technical interview", "Case interview", "Final round", "Offer received"]
archives = []
for p in sorted(glob.glob(os.path.join(ROOT, "documents/applications/*/outcome.md"))):
    txt = open(p).read()
    m = re.search(r"^#\s*Outcome:\s*(.+?)\s*$", txt, re.M)
    title = m.group(1) if m else os.path.basename(os.path.dirname(p))
    comp, _, role = title.partition("—")
    stages = [lbl for lbl in STAGE_LABELS if re.search(r"-\s*\[x\]\s*" + re.escape(lbl), txt, re.I)]
    st = re.search(r"\*\*Status:\*\*\s*(\S+)", txt)
    archives.append({"path": os.path.relpath(p, ROOT), "company": comp.strip(), "role": role.strip(),
                     "stages": stages, "status": st.group(1) if st else "", "matched": False,
                     "slug": os.path.basename(os.path.dirname(p))})

for r in rows:
    r["_stages"] = []
    r["_archive"] = ""
    c, ro = norm(r["company"]), norm(r["role"])
    for a in archives:
        if a["matched"]: continue
        ac, ar = norm(a["company"]), norm(a["role"])
        if ac and (ac in c or c in ac) and (ar in ro or ro in ar or "unknown" in ro or "not recorded" in ar):
            a["matched"] = True; r["_stages"] = a["stages"]; r["_archive"] = a["path"]; break

unmatched = [a for a in archives if not a["matched"]]

# ---- normalise status ----
# "Offer accepted" is its own bucket rather than folded into Hired: an accepted
# backup offer is a floor under an ongoing search, not the end of one, and the
# dashboard is misleading if it cannot show the difference.
BUCKET = {"applied": "Active", "interview": "Interview", "offer": "Offer",
          "offer_accepted": "Offer accepted", "accepted": "Offer accepted", "hired": "Hired",
          "rejected": "Rejected/Closed", "no_response": "Rejected/Closed", "no response": "Rejected/Closed",
          "offer_declined": "Rejected/Closed", "interview_only": "Rejected/Closed", "withdrawn": "Rejected/Closed"}
BUCKETS = ["Active", "Interview", "Offer", "Offer accepted", "Hired", "Rejected/Closed"]
COLOR = {"Active": "#3b82f6", "Interview": "#f59e0b", "Offer": "#8b5cf6",
         "Offer accepted": "#22c55e", "Hired": "#16a34a", "Rejected/Closed": "#ef4444"}
for r in rows:
    r["_bucket"] = BUCKET.get((r["status"] or "").strip().lower(), "Active")

total = len(rows)
def count(pred): return sum(1 for r in rows if pred(r))
by_bucket = {b: count(lambda r, b=b: r["_bucket"] == b) for b in BUCKETS}

def tally(key):
    d = {}
    for r in rows: d[(r[key] or "unknown").strip()] = d.get((r[key] or "unknown").strip(), 0) + 1
    return sorted(d.items(), key=lambda kv: (-kv[1], kv[0]))
by_sector, by_channel = tally("sector"), tally("role_type") and tally("channel")

def month(r):
    d = (r["date"] or "").strip()
    return d[:7] if re.match(r"^\d{4}-\d{2}", d) else (d[:4] if re.match(r"^\d{4}$", d) else "unknown")
by_period = sorted({m: sum(1 for r in rows if month(r) == m) for m in map(month, rows)}.items())

# ---- funnel ----
OFFER_BUCKETS = ("Offer", "Offer accepted", "Hired")
def reached_interview(r):
    return r["_bucket"] in ("Interview",) + OFFER_BUCKETS or bool(r["_stages"])
def reached_offer(r):
    return r["_bucket"] in OFFER_BUCKETS or "Offer received" in r["_stages"]
f_applied, f_int = total, count(reached_interview)
f_off, f_hired = count(reached_offer), by_bucket["Hired"]
resolved = by_bucket["Rejected/Closed"] + sum(by_bucket[b] for b in OFFER_BUCKETS)
pct_progressed = (f_int / total * 100) if total else 0
rej_rate = (by_bucket["Rejected/Closed"] / resolved * 100) if resolved else 0

# ---- svg helpers ----
def doughnut(data, size=230, thick=38):
    tot = sum(v for _, v in data) or 1
    cx = cy = size / 2; r = (size - thick) / 2 - 6
    parts, ang = [], -90.0
    for label, v in data:
        if not v: continue
        sweep = v / tot * 360
        if sweep >= 359.99:
            parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{COLOR.get(label,"#94a3b8")}" stroke-width="{thick}"/>')
        else:
            a0, a1 = math.radians(ang), math.radians(ang + sweep)
            x0, y0 = cx + r * math.cos(a0), cy + r * math.sin(a0)
            x1, y1 = cx + r * math.cos(a1), cy + r * math.sin(a1)
            parts.append(f'<path d="M {x0:.2f} {y0:.2f} A {r:.2f} {r:.2f} 0 {1 if sweep>180 else 0} 1 {x1:.2f} {y1:.2f}" '
                         f'fill="none" stroke="{COLOR.get(label,"#94a3b8")}" stroke-width="{thick}" stroke-linecap="butt"/>')
        ang += sweep
    parts.append(f'<text x="{cx}" y="{cy-2}" text-anchor="middle" class="dn">{tot}</text>')
    parts.append(f'<text x="{cx}" y="{cy+16}" text-anchor="middle" class="dl">applications</text>')
    lab = ", ".join(f"{v} {l}" for l, v in data if v)
    return (f'<svg viewBox="0 0 {size} {size}" width="{size}" height="{size}" role="img" '
            f'aria-label="Status breakdown: {E(lab)}">' + "".join(parts) + "</svg>")

def hbars(data, color="#3b82f6", w=430, rowh=26, labw=150):
    if not data: return '<p class="muted">No data.</p>'
    mx = max(v for _, v in data) or 1
    h = rowh * len(data) + 8
    out = []
    for i, (label, v) in enumerate(data):
        y = i * rowh + 4
        bw = max(2, (w - labw - 40) * v / mx)
        c = color(label) if callable(color) else color
        out.append(f'<text x="{labw-8}" y="{y+14}" text-anchor="end" class="bl">{E(label)}</text>'
                   f'<rect x="{labw}" y="{y+3}" width="{bw:.1f}" height="{rowh-11}" rx="3" fill="{c}"/>'
                   f'<text x="{labw+bw+6:.1f}" y="{y+14}" class="bv">{v}</text>')
    lab = ", ".join(f"{E(l)} {v}" for l, v in data)
    return (f'<svg viewBox="0 0 {w} {h}" width="100%" height="{h}" role="img" aria-label="{lab}">'
            + "".join(out) + "</svg>")

# ---- table ----
def trunc(s, n=80):
    s = (s or "").strip()
    return s if len(s) <= n else s[:n-1].rstrip() + "…"
def cell(v): return E(v) if (v or "").strip() else "—"
def src(v):
    v = (v or "").strip()
    if not v: return "—"
    if v.startswith("http"): return f'<a href="{E(v)}" target="_blank" rel="noopener">{E(trunc(v,40))}</a>'
    return E(v)

def sortkey(r):
    return ((r["date"] or ""), )
tbl_rows = sorted(rows, key=lambda r: ((r["date"] or ""),), reverse=True)
tbl_rows = sorted(tbl_rows, key=lambda r: (-int((r["date"] or "0").replace("-", "")[:8] or 0), (r["company"] or "").lower()))

trs = []
for r in tbl_rows:
    b = r["_bucket"]
    stages = ", ".join(r["_stages"]) or ""
    trs.append(
      f'<tr data-status="{E(b)}" data-sector="{E(r["sector"])}" '
      f'data-search="{E((r["company"]+" "+r["role"]+" "+r["sector"]+" "+r["notes"]).lower())}">'
      f'<td class="nowrap">{cell(r["date"])}</td>'
      f'<td class="co">{cell(r["company"])}</td>'
      f'<td>{cell(r["role"])}</td>'
      f'<td class="mono">{cell(r["sector"])}</td>'
      f'<td class="mono">{cell(r["channel"])}</td>'
      f'<td><span class="pill" style="background:{COLOR[b]}">{E(b)}</span></td>'
      f'<td class="mono">{E(stages) if stages else "—"}</td>'
      f'<td title="{E(r["notes"])}">{E(trunc(r["notes"]))}</td>'
      f'<td class="mono">{src(r["source"])}</td></tr>')

sectors = sorted({(r["sector"] or "unknown") for r in rows})
today = datetime.date.today().isoformat()

cards = "".join(
    f'<div class="card" style="border-left-color:{COLOR.get(l,"#64748b")}">'
    f'<div class="num">{v}</div><div class="lbl">{E(l)}</div></div>'
    for l, v in [("Total", total)] + [(b, by_bucket[b]) for b in BUCKETS])

f_acc = by_bucket["Offer accepted"]
funnel = [("Applied", f_applied), ("Interview", f_int), ("Offer", f_off), ("Accepted", f_acc)]
FCOL = {"Applied": "#3b82f6", "Interview": "#f59e0b", "Offer": "#8b5cf6", "Accepted": "#22c55e"}

unmatched_html = ""
if unmatched:
    items = "".join(f'<li><b>{E(a["company"])}</b> — {E(a["role"] or "role not recorded")} '
                    f'(stages: {E(", ".join(a["stages"]) or "none recorded")}) · <code>{E(a["path"])}</code></li>'
                    for a in unmatched)
    unmatched_html = f'<div class="panel warn"><h3>Unmatched outcome archives</h3><ul>{items}</ul></div>'

HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Job Search Dashboard</title>
<style>
:root{{--bg:#f1f5f9;--panel:#fff;--text:#0f172a;--muted:#64748b;--border:#e2e8f0;
--active:#3b82f6;--interview:#f59e0b;--offer:#8b5cf6;--hired:#22c55e;--rejected:#ef4444;
--shadow:0 1px 2px rgba(15,23,42,.06),0 4px 16px rgba(15,23,42,.06);}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--text);
font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}}
.wrap{{max-width:1200px;margin:0 auto;padding:26px 20px 60px}}
header{{display:flex;flex-wrap:wrap;gap:10px;align-items:baseline;justify-content:space-between;margin-bottom:20px}}
h1{{font-size:23px;margin:0;letter-spacing:-.02em}}
h3{{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 14px}}
.gen{{font-size:13px;color:var(--muted)}}
.cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px}}
.card{{background:var(--panel);border:1px solid var(--border);border-left:4px solid #64748b;
border-radius:10px;padding:14px 16px;box-shadow:var(--shadow)}}
.card .num{{font-size:30px;font-weight:700;letter-spacing:-.03em;line-height:1.1}}
.card .lbl{{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-top:2px}}
.grid{{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px}}
@media (max-width:860px){{.grid{{grid-template-columns:1fr}}}}
.panel,.chart-card{{background:var(--panel);border:1px solid var(--border);border-radius:12px;
padding:16px 18px;box-shadow:var(--shadow)}}
.dough{{display:flex;gap:18px;align-items:center;flex-wrap:wrap}}
.legend{{list-style:none;margin:0;padding:0;font-size:13.5px}}
.legend li{{display:flex;align-items:center;gap:8px;margin-bottom:6px}}
.sw{{width:10px;height:10px;border-radius:3px;flex:none}}
.legend .n{{margin-left:auto;font-variant-numeric:tabular-nums;color:var(--muted);padding-left:14px}}
text.dn{{font:700 26px system-ui;fill:var(--text)}}
text.dl{{font:11px system-ui;fill:var(--muted)}}
text.bl{{font:12.5px system-ui;fill:var(--muted)}}
text.bv{{font:600 12.5px system-ui;fill:var(--text)}}
.rates{{display:flex;gap:22px;flex-wrap:wrap;margin-top:12px;font-size:13px;color:var(--muted)}}
.rates b{{color:var(--text);font-size:15px}}
.toolbar{{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px}}
.toolbar input,.toolbar select{{font:inherit;padding:7px 10px;border:1px solid var(--border);
border-radius:8px;background:var(--panel);color:inherit}}
.toolbar input{{flex:1;min-width:200px}}
.count{{font-size:13px;color:var(--muted);margin-left:auto}}
.tablewrap{{overflow-x:auto;background:var(--panel);border:1px solid var(--border);
border-radius:12px;box-shadow:var(--shadow)}}
table{{border-collapse:collapse;width:100%;min-width:980px;font-size:13.5px}}
th{{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);
padding:11px 12px;border-bottom:1px solid var(--border);white-space:nowrap;background:var(--panel)}}
td{{padding:9px 12px;border-bottom:1px solid var(--border);vertical-align:top}}
tbody tr:nth-child(even){{background:#f8fafc}}
tbody tr:last-child td{{border-bottom:none}}
.co{{font-weight:600;white-space:nowrap}}
.mono{{color:var(--muted);font-size:12.5px}}
.nowrap{{white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--muted)}}
.pill{{display:inline-block;padding:2px 9px;border-radius:999px;color:#fff;font-size:11.5px;
font-weight:600;white-space:nowrap}}
a{{color:#2563eb}}
.warn{{border-left:4px solid var(--interview);margin-bottom:20px}}
.warn ul{{margin:0;padding-left:20px;font-size:13.5px}}
code{{background:var(--bg);padding:1px 5px;border-radius:4px;font-size:12px}}
.muted{{color:var(--muted)}}
footer{{margin-top:26px;font-size:12.5px;color:var(--muted);text-align:center}}
</style></head><body><div class="wrap">

<header>
  <h1>🔍 Job Search Dashboard</h1>
  <div class="gen">Generated: {today}</div>
</header>

<div class="cards">{cards}</div>

<div class="grid">
  <div class="chart-card"><h3>Status breakdown</h3>
    <div class="dough">{doughnut([(b, by_bucket[b]) for b in BUCKETS])}
      <ul class="legend">{"".join(f'<li><span class="sw" style="background:{COLOR[b]}"></span>{E(b)}<span class="n">{by_bucket[b]}</span></li>' for b in BUCKETS)}</ul>
    </div>
  </div>
  <div class="chart-card"><h3>By sector</h3>{hbars(by_sector, "#6366f1")}</div>
</div>

<div class="grid">
  <div class="chart-card"><h3>By channel</h3>{hbars(by_channel, "#0ea5e9")}</div>
  <div class="chart-card"><h3>Application funnel</h3>
    {hbars(funnel, lambda l: FCOL[l])}
    <div class="rates">
      <span><b>{pct_progressed:.0f}%</b> progressed past resume screen</span>
      <span><b>{rej_rate:.0f}%</b> rejection rate ({by_bucket["Rejected/Closed"]} of {resolved} resolved)</span>
    </div>
  </div>
</div>

<div class="grid">
  <div class="chart-card"><h3>By month applied</h3>{hbars(by_period, "#14b8a6")}</div>
  <div class="chart-card"><h3>Notes</h3>
    <p class="muted" style="font-size:13.5px;margin:0">
      Interview stages come from <code>documents/applications/*/outcome.md</code> and are merged onto
      matching tracker rows. “Progressed past resume screen” counts any application that reached an
      interview stage, including ones later rejected. <b>Offer accepted</b> is kept separate from
      <b>Hired</b>: the auxoai offer was accepted on 2026-08-27 as a backup below the target band, so
      the search continues from a floor rather than a deadline. Every figure is read directly from
      <code>job_search_tracker.csv</code> and the outcome archives — nothing is inferred.</p>
  </div>
</div>

{unmatched_html}

<div class="toolbar">
  <input type="search" id="q" placeholder="🔍 Search company, role, sector, notes…">
  <select id="fs"><option value="">All statuses</option>{"".join(f'<option>{E(b)}</option>' for b in BUCKETS)}</select>
  <select id="fsec"><option value="">All sectors</option>{"".join(f'<option>{E(s)}</option>' for s in sectors)}</select>
  <span class="count" id="count"></span>
</div>

<div class="tablewrap"><table>
<thead><tr><th>Date</th><th>Company</th><th>Role</th><th>Sector</th><th>Channel</th><th>Status</th><th>Stages reached</th><th>Notes</th><th>Source</th></tr></thead>
<tbody id="tb">{"".join(trs)}</tbody>
</table></div>

<footer>Generated by Claude Code · ai-job-search · {today}</footer>
</div>
<script>
const q=document.getElementById("q"),fs=document.getElementById("fs"),
fsec=document.getElementById("fsec"),tb=document.getElementById("tb"),cnt=document.getElementById("count");
function apply(){{
  const t=q.value.trim().toLowerCase(),s=fs.value,sec=fsec.value;let n=0;
  for(const tr of tb.rows){{
    const ok=(!s||tr.dataset.status===s)&&(!sec||tr.dataset.sector===sec)&&(!t||tr.dataset.search.includes(t));
    tr.hidden=!ok; if(ok)n++;
  }}
  cnt.textContent=n+" of "+tb.rows.length+" shown";
}}
q.addEventListener("input",apply);fs.addEventListener("change",apply);fsec.addEventListener("change",apply);
apply();
</script>
</body></html>
"""
os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, "w").write(HTML)
print("wrote", OUT, len(HTML), "bytes")
print("total", total, "buckets", by_bucket)
print("funnel", funnel, "progressed %.1f%%" % pct_progressed, "rej %.1f%%" % rej_rate)
print("unmatched archives:", [a["slug"] for a in unmatched])
for r in rows:
    if r["_stages"]: print("  merged:", r["company"], "|", r["_stages"])
