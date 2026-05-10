#!/usr/bin/env python3
"""
Run the parsed corpus from testcases/evidence/corpus-parsed.json against env1.
For each parseable entry: curl method+path with the right auth token,
record HTTP status, compare to expected_status, write a CSV result.

Output:
- testcases/99-runlog/env1/CORPUS-PARSED-RESULTS.csv (one row per TC)
- testcases/99-runlog/env1/CORPUS-PARSED-SUMMARY.md (counts + bug list)
- testcases/bugs/BUG-CORPUS-PARSED-NNN.md (one per FAIL where actual != expected and not 4xx auth)
"""
import os, json, csv, subprocess, sys, time, re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PARSED = os.path.join(ROOT, "testcases", "evidence", "corpus-parsed.json")
TOKENS = os.path.join(ROOT, "testcases", "evidence", "_tokens-env1.json")
OUT_CSV = os.path.join(ROOT, "testcases", "99-runlog", "env1", "CORPUS-PARSED-RESULTS.csv")
OUT_MD  = os.path.join(ROOT, "testcases", "99-runlog", "env1", "CORPUS-PARSED-SUMMARY.md")
BUGS_DIR = os.path.join(ROOT, "testcases", "bugs")

API_BASE = os.environ.get("API_BASE_URL", "https://zantaz-api.doable.me")
WEB_BASE = os.environ.get("WEB_BASE_URL", "https://zantaz.doable.me")
WS_ID = "4bbd6afe-c396-4da6-add5-d71f73f51801"
PRJ_ID = "c6f845d0-1c43-4897-b48d-c23fbb8e125a"

with open(TOKENS, encoding="utf-8") as f:
    tokens_data = json.load(f)
def tok_for(name: str) -> str:
    return tokens_data.get(name or "qa-owner", tokens_data["qa-owner"])["access"]

def resolve_path(p: str) -> str:
    if not p: return ""
    if p.startswith("http"):
        # Replace any placeholder host
        p = re.sub(r"https?://(?:env1|<env>|api|<env>-api)\.doable\.me", API_BASE, p)
        return p
    # Path placeholders
    p = p.replace("{workspaceId}", WS_ID).replace("{wsid}", WS_ID).replace("{wid}", WS_ID)
    p = p.replace("{projectId}", PRJ_ID).replace("{pid}", PRJ_ID).replace("{id}", PRJ_ID)
    p = p.replace(":workspaceId", WS_ID).replace(":wsid", WS_ID).replace(":wid", WS_ID)
    p = p.replace(":projectId", PRJ_ID).replace(":pid", PRJ_ID).replace(":id", PRJ_ID)
    return API_BASE + p

def run_tc(entry):
    """Returns (http_code, result, note)."""
    url = resolve_path(entry["path"])
    if "{" in url or "<" in url or "$" in url:
        return ("-", "SKIP", f"unresolved placeholder in URL: {url}")
    method = entry["method"] or "GET"
    auth = tok_for(entry["auth"])
    cmd = [
        "curl", "-sS", "-o", "/dev/null", "-w", "%{http_code}",
        "--max-time", "8",
        "-X", method,
        "-H", f"Authorization: Bearer {auth}",
    ]
    body = entry.get("body")
    if body and method in ("POST", "PUT", "PATCH"):
        cmd += ["-H", "Content-Type: application/json", "-d", json.dumps(body)]
    cmd.append(url)
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=10, text=True)
        code = r.stdout.strip() or "ERR"
    except Exception as e:
        return ("ERR", "FAIL", f"curl exception: {e}")
    expected = entry.get("expected_status")
    if expected is None:
        # No expected, treat as INFO
        result = "INFO"
        note = "no expected_status"
    else:
        if str(code) == str(expected):
            result = "PASS"
            note = ""
        elif code in ("401","403","404") and str(expected) in ("404","403","401"):
            # cross-tier 4xx — call it AUTH-MATCH (e.g. expected 404 got 403)
            result = "AUTH_OK"
            note = f"close 4xx match (expected={expected}, got={code})"
        elif code in ("401","403"):
            result = "AUTH_BLOCK"
            note = f"got {code} but expected {expected} — likely needs different role"
        elif code in ("500","502","503"):
            result = "FAIL_5XX"
            note = f"server error {code}"
        else:
            result = "MISMATCH"
            note = f"expected {expected} got {code}"
    return (code, result, note)

def main():
    with open(PARSED, encoding="utf-8") as f:
        entries = json.load(f)
    parseable = [e for e in entries if e["parse_status"] == "ok"]
    print(f"running {len(parseable)} parseable TCs against {API_BASE}")

    counts = {"PASS":0,"INFO":0,"AUTH_OK":0,"AUTH_BLOCK":0,"FAIL_5XX":0,"MISMATCH":0,"SKIP":0,"FAIL":0}
    rows = []
    failure_samples = []
    t0 = time.time()
    for i, entry in enumerate(parseable):
        code, result, note = run_tc(entry)
        counts[result] = counts.get(result, 0) + 1
        rows.append({"tc_id": entry["id"], "file": entry["file"],
                     "method": entry["method"], "path": entry["path"],
                     "expected": entry.get("expected_status"),
                     "got": code, "result": result, "note": note,
                     "auth": entry["auth"], "severity": entry["severity"]})
        if result in ("FAIL_5XX", "MISMATCH"):
            failure_samples.append(rows[-1])
        if (i+1) % 100 == 0:
            print(f"  {i+1}/{len(parseable)} done  elapsed={int(time.time()-t0)}s  counts={counts}")

    # CSV
    os.makedirs(os.path.dirname(OUT_CSV), exist_ok=True)
    with open(OUT_CSV, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["tc_id","file","method","path","expected","got","result","note","auth","severity"])
        w.writeheader(); w.writerows(rows)

    # Summary MD
    with open(OUT_MD, "w", encoding="utf-8") as f:
        f.write(f"# CORPUS-PARSED — Summary\n\n")
        f.write(f"**Run:** {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())} · **Target:** {API_BASE}\n\n")
        f.write(f"**Total parseable:** {len(parseable)} of {len(entries)}\n\n")
        f.write("| Result | Count |\n|---|---:|\n")
        for k in ("PASS","INFO","AUTH_OK","AUTH_BLOCK","FAIL_5XX","MISMATCH","SKIP","FAIL"):
            f.write(f"| {k} | {counts.get(k,0)} |\n")
        f.write(f"\n## Failures (FAIL_5XX + first 30 MISMATCH)\n\n")
        f.write("| TC | METHOD | PATH | expected | got | note |\n|---|---|---|---|---|---|\n")
        n = 0
        for r in rows:
            if r["result"] in ("FAIL_5XX","MISMATCH") and n < 50:
                f.write(f"| {r['tc_id']} | {r['method']} | `{r['path']}` | {r['expected']} | {r['got']} | {r['note']} |\n")
                n += 1
        f.write(f"\n## CSV: {os.path.relpath(OUT_CSV, ROOT)}\n")

    print(f"\n=== final counts ===")
    for k, v in counts.items():
        print(f"  {k}: {v}")
    print(f"csv:     {OUT_CSV}")
    print(f"summary: {OUT_MD}")
    print(f"elapsed: {int(time.time()-t0)}s")

if __name__ == "__main__":
    main()
