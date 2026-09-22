#!/usr/bin/env python3
"""ATS check for a generated CV PDF.

Reads the PDF's *embedded text layer* — what an applicant-tracking system actually
parses, as opposed to what the page looks like — and reports:

  1. parseability   : (cid:NNN) markers, U+FFFD replacement chars, empty extraction
  2. contactability : email and phone present as literal text, not icon glyphs only
  3. page count     : the repo standard is exactly 2 pages
  4. keyword cover  : coverage of a job description's terms, with synonym mapping

Extraction backend, in order of preference:
  pdftotext -layout  ->  local ghostscript  ->  ghostscript inside Docker texlive

The Docker fallback exists because this machine has no poppler and no local TeX;
see the cv-ats-hardening note. Nothing here writes to the PDF or the .tex.

Usage:
  python3 tools/ats_check.py cv/main_example.pdf
  python3 tools/ats_check.py cv/main_example.pdf --jd postings/sarvam.txt
  python3 tools/ats_check.py cv/main_example.pdf --jd - < posting.txt
  python3 tools/ats_check.py cv/main_example.pdf --pages 2 --dump extracted.txt

Exit status is 1 if any hard check fails, else 0. Keyword gaps never fail the run —
a gap can be an honest one, and this tool must not encourage stuffing.
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCKER_IMAGE = "texlive/texlive:latest"

# Terms that mean the same thing to a human but not to a keyword matcher. The CV is
# credited with a JD term if it carries the term OR any of its listed equivalents.
SYNONYMS: dict[str, tuple[str, ...]] = {
    "rag": ("retrieval-augmented generation", "retrieval augmented generation"),
    "retrieval-augmented generation": ("rag",),
    "llm": ("large language model", "large language models"),
    "large language model": ("llm",),
    "genai": ("generative ai", "gen ai"),
    "generative ai": ("genai",),
    "gpt": ("openai", "llm"),
    "vector database": ("faiss", "milvus", "chromadb", "vector store", "vector search"),
    "vector store": ("vector database", "faiss", "milvus", "chromadb"),
    "embeddings": ("embedding", "vector search", "semantic search"),
    "k8s": ("kubernetes",),
    "kubernetes": ("k8s",),
    "ci/cd": ("github actions", "gitlab ci", "jenkins", "continuous integration"),
    "mlops": ("llmops", "model deployment"),
    "llmops": ("mlops",),
    "nlp": ("natural language processing",),
    "natural language processing": ("nlp",),
    "fine-tuning": ("fine tuning", "finetuning", "model fine-tuning"),
    "fine-tune": ("fine-tuning", "fine tuning", "finetuning"),
    "tool calling": ("function calling", "tool use", "tool-calling"),
    "function calling": ("tool calling", "tool use", "tool-calling"),
    "hallucination": ("hallucinations", "near-zero-hallucination"),
    "observability": ("monitoring", "telemetry"),
    "code generation": ("test generation", "code-generation"),
    "aws": ("amazon web services",),
    "gcp": ("google cloud",),
    "azure": ("microsoft azure",),
    "rest api": ("rest apis", "restful", "api development"),
    "agentic": ("agentic ai", "ai agents", "agent"),
}

# Multi-word technical terms are scanned as units: they are what a recruiter types
# into a search box, and splitting them ("calling", "face", "design") produces noise.
PHRASES: tuple[str, ...] = (
    "tool calling", "function calling", "prompt engineering", "vector search",
    "semantic search", "hybrid retrieval", "multi-agent", "agentic ai", "ai agents",
    "system design", "distributed systems", "event streaming", "async python",
    "code generation", "test automation", "hugging face", "cost tracking",
    "production-grade", "end to end", "proof-of-concept", "data structures",
    "open-source", "technical writing", "building in public", "inference cost",
    "evaluation harness", "guardrails", "hallucination", "reranking", "chunking",
    "model deployment", "developer tooling", "incident response", "observability",
)

# Words that carry no signal in a JD keyword scan.
STOP = set("""a an the and or of to in for with on at by as is are be been being this that
these those you your we our they their it its will would can could should must may from
have has had do does did not no but if then than so such very more most other others
role roles work working experience experienced years year team teams strong good great
excellent ability able help helps build building building's who what when where why how
across into over about within using use used uses via per plus etc including include
includes required requirement requirements preferred nice must-have responsibilities
responsibility qualifications skills skill knowledge understanding familiarity job
candidate candidates applicant company companies opportunity looking join well like
also new high level levels end ends day days one two three both all any each same
run runs running users user actual against baseline ambiguity ambiguous comfortable
excellent partner translate own owns owning hands-on solid strong grasp clean real
looking define manage write writes written design designs designed build builds
built shipped ship ships problems problem feature features product design ownership
communication versioning tested quality standing hand file files note proxy posting
reference vocabulary recurs targets similar assembled composite instead never thing
""".split())


class CheckError(Exception):
    pass


# ---------------------------------------------------------------- extraction

ASCII_OK = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,;:@/+()-\n")


def _decode(raw: bytes) -> str:
    """Decode tool output without inventing U+FFFD.

    Ghostscript's txtwrite device writes UTF-16 — sometimes big-endian, sometimes
    little-endian, often with no BOM — while pdftotext writes UTF-8. Guessing wrong
    produces CJK soup or manufactured replacement characters, which would corrupt
    the very checks this script exists to run. So every candidate encoding is tried
    and the one whose output looks most like Latin text wins.
    """
    if not raw:
        return ""
    if raw[:2] == b"\xff\xfe":
        return raw.decode("utf-16-le", "replace")[1:]
    if raw[:2] == b"\xfe\xff":
        return raw.decode("utf-16-be", "replace")[1:]

    best, best_score = "", -1.0
    for enc in ("utf-8", "utf-16-le", "utf-16-be", "latin-1"):
        try:
            cand = raw.decode(enc)
        except (UnicodeDecodeError, UnicodeError):
            continue
        if not cand:
            continue
        score = sum(c in ASCII_OK for c in cand) / len(cand)
        if score > best_score:
            best, best_score = cand, score
    return best or raw.decode("latin-1", "replace")


def _run(cmd: list[str]) -> str:
    proc = subprocess.run(cmd, capture_output=True)
    if proc.returncode != 0:
        detail = _decode(proc.stderr or proc.stdout).strip()[:400]
        raise CheckError(f"{cmd[0]} failed: {detail}")
    return _decode(proc.stdout)


def _docker_available() -> bool:
    return bool(shutil.which("docker")) and subprocess.run(
        ["docker", "info"], capture_output=True).returncode == 0


def extract_text(pdf: Path) -> tuple[str, str]:
    """Return (text, backend-name)."""
    if shutil.which("pdftotext"):
        return _run(["pdftotext", "-layout", str(pdf), "-"]), "pdftotext -layout"

    if shutil.which("gs"):
        out = pdf.parent / (pdf.stem + ".atscheck.txt")
        _run(["gs", "-q", "-dNOPAUSE", "-dBATCH", "-sDEVICE=txtwrite",
              "-o", str(out), str(pdf)])
        text = _decode(out.read_bytes())
        out.unlink(missing_ok=True)
        return text, "ghostscript (local)"

    if _docker_available():
        rel = pdf.resolve().relative_to(ROOT)
        text = _run([
            "docker", "run", "--rm", "-v", f"{ROOT}:/work", "-w", "/work",
            DOCKER_IMAGE, "sh", "-c",
            f"gs -q -dNOPAUSE -dBATCH -sDEVICE=txtwrite -o /tmp/o.txt '{rel}' && cat /tmp/o.txt",
        ])
        return text, f"ghostscript (docker {DOCKER_IMAGE})"

    raise CheckError(
        "no way to extract text: install poppler (brew install poppler) or "
        "ghostscript, or start Docker so the texlive image can be used")


def page_count(pdf: Path) -> int | None:
    """Best-effort page count; None when no backend can answer."""
    if shutil.which("pdfinfo"):
        m = re.search(r"^Pages:\s+(\d+)", _run(["pdfinfo", str(pdf)]), re.M)
        if m:
            return int(m.group(1))
    ps = "(%s) (r) file runpdfbegin pdfpagecount = quit" % pdf.name
    if shutil.which("gs"):
        out = _run(["gs", "-q", "-dNODISPLAY", "-dNOSAFER", "-c", ps])
        m = re.search(r"\d+", out)
        if m:
            return int(m.group())
    if _docker_available():
        rel = pdf.resolve().relative_to(ROOT)
        out = _run(["docker", "run", "--rm", "-v", f"{ROOT}:/work", "-w", "/work",
                    DOCKER_IMAGE, "sh", "-c",
                    f"gs -q -dNODISPLAY -dNOSAFER -c '({rel}) (r) file runpdfbegin pdfpagecount = quit'"])
        m = re.search(r"\d+", out)
        if m:
            return int(m.group())
    return None


# ---------------------------------------------------------------- keywords

def jd_terms(jd_text: str, limit: int = 45) -> list[tuple[str, int]]:
    """Rank a job description's meaningful terms by frequency.

    Multi-word technical phrases are kept whole (they are what a recruiter types
    into a search box); everything else falls back to single tokens.
    """
    # Everything above a lone "---" in the first 25 lines is treated as front matter
    # (a human note about the file, not the posting) and excluded from the scan.
    lines = jd_text.splitlines()
    for i, ln in enumerate(lines[:25]):
        if ln.strip() == "---":
            jd_text = "\n".join(lines[i + 1:])
            break

    low = jd_text.lower()
    phrases = list(PHRASES) + [p for p in SYNONYMS if " " in p or "/" in p or "-" in p]
    found: dict[str, int] = {}
    for p in phrases:
        n = low.count(p)
        if n:
            found[p] = n
    # A token already counted inside a matched phrase should not also score alone.
    for p in list(found):
        low = low.replace(p, " ")

    for tok in re.findall(r"[a-z][a-z0-9+#./-]{1,}", low):
        tok = tok.strip("./-")
        if len(tok) < 2 or tok in STOP or tok.isdigit():
            continue
        found[tok] = found.get(tok, 0) + 1
    ranked = sorted(found.items(), key=lambda kv: (-kv[1], kv[0]))
    return ranked[:limit]


_SUFFIXES = ("ations", "ation", "ings", "ing", "ions", "ion", "ers", "er", "es", "ed", "s", "e")


def _stem(word: str) -> str:
    """Crude suffix stripper. Good enough to make integration/integrate match."""
    for suf in _SUFFIXES:
        if len(word) - len(suf) >= 5 and word.endswith(suf):
            return word[: -len(suf)]
    return word


def covered(term: str, cv_low: str, cv_stems: set[str] | None = None) -> str | None:
    """Return the CV string that satisfied `term`, or None.

    Three widening passes: literal substring, then a hand-kept synonym table, then a
    stem match so that a JD's "integrate" is credited to a CV's "integration". The
    stem pass is single-word only — stemming a phrase produces nonsense matches.
    """
    if term in cv_low:
        return term
    for alt in SYNONYMS.get(term, ()):
        if alt in cv_low:
            return alt
    if cv_stems and " " not in term and len(term) >= 6:
        stem = _stem(term)
        if len(stem) >= 5 and stem in cv_stems:
            return f"{stem}~"
    return None


def cv_stem_index(cv_low: str) -> set[str]:
    return {_stem(w) for w in re.findall(r"[a-z][a-z0-9+#-]{2,}", cv_low)}


# ---------------------------------------------------------------- report

class Report:
    def __init__(self) -> None:
        self.failed = False

    def line(self, ok: bool | None, text: str, hard: bool = True) -> None:
        mark = {True: "PASS", False: "FAIL", None: "WARN"}[ok]
        print(f"  [{mark}] {text}")
        if ok is False and hard:
            self.failed = True


def main() -> int:
    ap = argparse.ArgumentParser(description="ATS-parseability and keyword check for a CV PDF")
    ap.add_argument("pdf", help="path to the compiled CV PDF")
    ap.add_argument("--jd", help="job-description text file, or - for stdin")
    ap.add_argument("--pages", type=int, default=2, help="expected page count (default 2, 0 to skip)")
    ap.add_argument("--email", default="diwan.sahilsingh@gmail.com")
    ap.add_argument("--phone", default="8007192680", help="digits only, no country code")
    ap.add_argument("--top", type=int, default=45, help="how many JD terms to score")
    ap.add_argument("--dump", help="write the extracted text layer here")
    args = ap.parse_args()

    pdf = Path(args.pdf).resolve()
    if not pdf.is_file():
        print(f"error: no such PDF: {pdf}", file=sys.stderr)
        return 2

    try:
        text, backend = extract_text(pdf)
    except CheckError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    if args.dump:
        Path(args.dump).write_text(text)

    low = text.lower()
    flat = re.sub(r"\s+", " ", low)
    digits = re.sub(r"\D", "", text)
    r = Report()

    print(f"\nATS check — {pdf.relative_to(ROOT) if pdf.is_relative_to(ROOT) else pdf}")
    print(f"extracted via {backend}, {len(text.split())} words\n")

    print("Parseability")
    cids = re.findall(r"\(cid:\d+\)", text)
    r.line(not cids, f"no (cid:N) markers" + (f" — found {len(cids)}" if cids else ""))
    bad_lines = [ln for ln in text.splitlines() if "\ufffd" in ln]
    bad = text.count("\ufffd")
    if not bad:
        r.line(True, "no U+FFFD replacement characters")
    elif len(bad_lines) <= 3:
        # moderncv draws contact icons from a symbol font; those extract as U+FFFD
        # on the one or two header lines and no ATS cares. Corruption spread across
        # the body (the old \labelitemi bullet bug) is a different animal.
        r.line(None, f"{bad} U+FFFD on {len(bad_lines)} line(s) — icon-glyph noise, "
                     "harmless as long as the contact text is literal too", hard=False)
    else:
        r.line(False, f"{bad} U+FFFD across {len(bad_lines)} lines — body text is "
                      "not extracting; check \\labelitemi and font choices")
    r.line(len(text.split()) > 150, "text layer is substantial (>150 words)")

    print("\nContact details as literal text")
    r.line(args.email.lower() in low, f"email {args.email}")
    r.line(args.phone in digits, f"phone {args.phone}")
    for label, pat in (("LinkedIn URL", "linkedin.com/in/"), ("GitHub URL", "github.com/")):
        r.line(pat in low or None, f"{label} ({pat})", hard=False)

    if args.pages:
        print("\nStructure")
        n = page_count(pdf)
        if n is None:
            r.line(None, "page count unavailable (no pdfinfo/gs/docker)", hard=False)
        else:
            r.line(n == args.pages, f"page count is {n} (expected {args.pages})")

    if args.jd:
        jd = sys.stdin.read() if args.jd == "-" else Path(args.jd).read_text()
        terms = jd_terms(jd, args.top)
        stems = cv_stem_index(flat)
        hits = [(t, n, covered(t, flat, stems)) for t, n in terms]
        have = [h for h in hits if h[2]]
        miss = [h for h in hits if not h[2]]
        pct = 100 * len(have) / len(hits) if hits else 0
        print(f"\nKeyword coverage vs {args.jd}: {len(have)}/{len(hits)} ({pct:.0f}%)")
        print("\n  Missing (highest JD frequency first) — add only what is TRUE:")
        for t, n, _ in miss[:25]:
            print(f"    x  {t:<34} (JD mentions {n})")
        syn = [(t, s) for t, n, s in have if s != t]
        if syn:
            print("\n  Matched by synonym or word stem (~) only — consider the JD's exact wording:")
            for t, s in syn[:12]:
                print(f"    ~  JD says '{t}'  ->  CV says '{s}'")
        print("\n  Note: a missing term is only a problem if the profile genuinely "
              "supports it.\n  Never add a keyword the experience does not back.")

    print()
    if r.failed:
        print("RESULT: FAIL — fix the items above before sending this CV.\n")
        return 1
    print("RESULT: PASS — the text layer is ATS-clean.\n")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except CheckError as exc:
        print(f"error: {exc}", file=sys.stderr)
        sys.exit(2)
