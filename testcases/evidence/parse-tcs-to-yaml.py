#!/usr/bin/env python3
"""
Parse all testcases/*/TC-*.md prose files and emit a single corpus.yaml
with one entry per TC ID containing method, path, body (if obvious),
expected_status, and auth_role.

Heuristic parsing — best-effort. TCs that can't be auto-parsed get
emitted with `parse_status: skipped` and a reason. The runner skips those.

Output: testcases/evidence/corpus-parsed.yaml
"""
import os, re, json, sys, glob

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TC_FILES = sorted(glob.glob(os.path.join(ROOT, "testcases", "[0-9][0-9]-*", "TC-*.md")))

# Regex helpers
TC_ID_RE = re.compile(r'^##\s+(TC-[A-Z][A-Z0-9_-]+-\d+)', re.MULTILINE)
METHOD_PATH_RES = [
    re.compile(r'\b(GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS)\s+(/[\w\-/.{}:?&=%@~+]*)'),
    re.compile(r'curl[^\n]*?(GET|POST|PATCH|PUT|DELETE)?\s*[^\n]*?["\']?(https?://[^\s"\'`)]+|/[\w\-/.{}:?&=%@~+]+)["\']?'),
]
EXPECTED_STATUS_RE = re.compile(r'Expected[*\s:]*(?:HTTP\s+)?(\d{3})')
ALT_STATUS_RE = re.compile(r'\b(\d{3})\b\s*(?:OK|Created|No Content|Bad Request|Unauthorized|Forbidden|Not Found|Conflict|Internal)')
AUTH_RE = re.compile(r'qa-(owner|admin|member|viewer|alice|bob|charlie)', re.I)
SEV_RE = re.compile(r'\*\*Severity:\*\*\s*(\w+)', re.I)
BODY_JSON_RE = re.compile(r'`?\{[^`{}]*\}`?')

def parse_tc_block(tc_id: str, block: str):
    """Return a dict for a single TC block (text from TC heading to next heading)."""
    method = None
    path = None

    # Try to find METHOD /path pattern
    m = METHOD_PATH_RES[0].search(block)
    if m:
        method, path = m.group(1), m.group(2)
    else:
        # try curl pattern
        m = METHOD_PATH_RES[1].search(block)
        if m:
            method = m.group(1) or "GET"
            path = m.group(2)

    expected = None
    m = EXPECTED_STATUS_RE.search(block)
    if m: expected = int(m.group(1))
    if expected is None:
        m = ALT_STATUS_RE.search(block)
        if m: expected = int(m.group(1))

    auth = None
    m = AUTH_RE.search(block)
    if m: auth = "qa-" + m.group(1).lower()

    sev = None
    m = SEV_RE.search(block)
    if m: sev = m.group(1).lower()

    body = None
    m = BODY_JSON_RE.search(block)
    if m:
        candidate = m.group(0).strip('`')
        try:
            body = json.loads(candidate)
        except Exception:
            body = None

    parse_status = "ok"
    skip_reason = None
    if not method or not path:
        parse_status = "skipped"
        skip_reason = "no METHOD+path found"
    elif path.startswith("/") and "..." in path:
        parse_status = "skipped"
        skip_reason = "path contains ellipsis placeholder"
    elif "<" in (path or "") and ">" in (path or ""):
        parse_status = "skipped"
        skip_reason = "path contains placeholder <...>"

    return {
        "id": tc_id,
        "method": method,
        "path": path,
        "expected_status": expected,
        "auth": auth or "qa-owner",
        "severity": sev,
        "body": body,
        "parse_status": parse_status,
        "skip_reason": skip_reason,
    }

def main():
    all_entries = []
    for tcfile in TC_FILES:
        with open(tcfile, encoding="utf-8") as f:
            txt = f.read()
        # Split by ## TC-... headings
        positions = [(m.group(1), m.start()) for m in TC_ID_RE.finditer(txt)]
        for i, (tcid, pos) in enumerate(positions):
            end = positions[i+1][1] if i+1 < len(positions) else len(txt)
            block = txt[pos:end]
            entry = parse_tc_block(tcid, block)
            entry["file"] = os.path.relpath(tcfile, ROOT).replace("\\","/")
            all_entries.append(entry)

    # Write
    out = os.path.join(ROOT, "testcases", "evidence", "corpus-parsed.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(all_entries, f, indent=1)

    # Summary
    total = len(all_entries)
    ok = sum(1 for e in all_entries if e["parse_status"] == "ok")
    skipped = total - ok
    by_method = {}
    for e in all_entries:
        if e["parse_status"] == "ok":
            by_method[e["method"]] = by_method.get(e["method"], 0) + 1
    print(f"total: {total}")
    print(f"parseable: {ok}  skipped: {skipped}")
    print(f"by method:", by_method)
    print(f"output: {out}")

if __name__ == "__main__":
    main()
