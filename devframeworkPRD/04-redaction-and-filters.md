# 04 — Redaction & Log Filter Pipeline

> Companion to `03-build-event-protocol.md`. The filter chain defined here
> runs at the publisher boundary inside `BuildEventPublisher`
> (`03-build-event-protocol.md` §8) — BEFORE any byte is serialized to SSE
> or WS. There is NO downstream redaction; if a string reaches the wire,
> it has already passed every filter.
>
> All citations refer to `_discovery/01-vite-flow.md`,
> `_discovery/02-runtime-infra.md`, and `_discovery/03-streaming.md`.

---

## 1. Goals & threat model

### 1.1 Goals

- **Default-deny for credential-shaped strings.** Anything that even
  *might* be a secret is replaced with a redaction token before it
  hits a stream. Over-redaction is acceptable; leaks are not.
- **Pre-serialization placement.** All redaction happens inside the
  publisher's `attach()` per-line callback (PRD 03 §8), BEFORE the
  event reaches `stream.writeSSE` or `broadcastToRoom`. There is no
  "downstream cleanup" path.
- **Generalize the existing rule.**
  `services/api/src/integrations/supabase/provisioner.ts:37` already
  declares "credentials NEVER returned via SSE / logs / chat — only
  stored in the vault" (`_discovery/03-streaming.md` §"SSE endpoints"
  table row + §"Open questions" #3). This PRD makes that a
  project-wide invariant.
- **Composable.** Built-in filters + adapter-supplied + project-supplied,
  in a deterministic order.
- **Auditable.** Every redaction increments a counter so we can detect
  when a filter is over-redacting in production without leaking what
  was redacted.

### 1.2 Threat model — what we redact and why

| Class | Source | Why redact |
|---|---|---|
| Env-var values resolved by `resolveProjectEnvVars` | `services/api/src/projects/dev-server-start.ts:109-120` (vault-backed user creds + `env_vars` table) | Vite `define` replacement / dotenv echo can print these to stdout (`_discovery/03-streaming.md` §"Open questions" #3) |
| Absolute filesystem paths | `cwd: projectPath` in `spawnJailedVite` (`vite-jail.ts:82`) leaks `/data/projects/{uuid}/...` and on dev `C:\Users\gj\...` (host username) | Reveals OS username, server topology, project IDs (project IDs are UUIDs that index private projects) |
| OS usernames | Process launch env, error stack traces | Direct PII / leakable host identity |
| Internal IPs / hostnames | Dev server runs on `127.0.0.1` (CLAUDE.md "CRITICAL: Network Security"); other internal services on loopback | Reveals deployment topology; sometimes credentials in URLs |
| URLs containing tokens | OAuth callback URLs, presigned S3 URLs, Supabase URLs with `?apikey=...` | Direct credential leak |
| Email addresses | User accounts surfaced in error messages | PII |
| AWS-style key shapes | AKIA…, ASIA…, secret keys | Direct credential leak |
| GitHub PAT shapes | `ghp_...`, `gho_...`, `ghs_...`, `ghu_...` | Direct credential leak |
| Supabase keys | `sbp_...`, anon/service keys (JWT-shaped, `eyJ...` with `role` claim) | Direct credential leak |
| Generic JWTs | Three base64url segments separated by `.` | Likely credential |
| Generic high-entropy strings | Last-resort heuristic | Catch-all for unknown secret formats |

### 1.3 Out of scope

- Redacting user-authored code that the user pastes into chat. Chat
  redaction is a different surface and not addressed here.
- Redacting AI tool RESULTS (handled by existing `tool_result` payload
  shaping). This PRD covers only the build-event publisher path.

---

## 2. Pipeline architecture

```ts
// services/api/src/build-events/filters/types.ts (new)
export interface FilterContext {
  stream: "stdout" | "stderr";
  buildId: string;
  projectId: string;
  /** snapshot of env-var values active for this build (for env-redactor) */
  envSecrets: ReadonlyArray<string>;
  /** OS usernames seen on the host (for username-redactor) */
  osUsernames: ReadonlyArray<string>;
  /** project workspace path so we can rewrite to project-relative */
  projectPath: string;
}

/**
 * Pure transformation. Returns:
 *   - the (possibly transformed) line to pass to the next filter
 *   - null to DROP the line entirely
 * Filters MUST NOT throw on user input. Throws are caught upstream and
 * cause the line to be dropped (fail-closed) — see §9.
 */
export type LogFilter = {
  id: string;
  alwaysOn?: boolean;            // §5
  apply(line: string, ctx: FilterContext): string | null;
};

export class LogFilterChain {
  constructor(private filters: ReadonlyArray<LogFilter>) {}
  run(line: string, ctx: FilterContext): string | null {
    let cur: string | null = line;
    for (const f of this.filters) {
      try {
        cur = f.apply(cur!, ctx);
        if (cur === null) {
          metrics.inc("filter_drop", { id: f.id });
          return null;
        }
      } catch (e) {
        metrics.inc("filter_error", { id: f.id });
        log.warn("filter threw, dropping line (fail-closed)", { id: f.id, err: String(e) });
        return null;        // fail-closed (§9)
      }
    }
    return cur;
  }
}
```

### 2.1 Order

```
1. truncate (input cap, §8)
2. deny-list (always-on, never disabled)
   2a. env-var literal redactor
   2b. AWS / GitHub / Supabase / JWT shape redactor
   2c. high-entropy generic redactor
3. transform (path / URL / username / email)
4. adapter-supplied filters (§4)
5. project-supplied filters (§4)
6. passthrough
```

Order rationale:
- Truncate first so regex execution can never blow up on a 10MB line.
- Deny-list before transform so credentials are gone before we start
  rewriting paths/URLs (a URL containing a token gets the token zapped
  by 2b first, then the URL rewriter runs on the already-clean URL).
- Adapter / project filters run last so they see ALREADY-redacted text;
  their job is enrichment, not security. They CANNOT un-redact.

### 2.2 Placement in the publisher

```ts
// 03-build-event-protocol.md §8
const filtered = this.filterChain.run(raw, ctx);   // ← THIS LINE is the boundary
if (filtered === null) return;                      // dropped
this.publishLog(stream, filtered, buildId);         // wire-bound
```

**Invariant:** there is no path from `child.stdout` → SSE/WS that
bypasses `filterChain.run`. Code review and lint MUST enforce this:
the only call site for `BuildEventPublisher.publishLog` is inside
`attach()`, after `filterChain.run`.

---

## 3. Built-in filters

### 3.1 Env-var value redactor (`env-values`) — ALWAYS ON

Receives `ctx.envSecrets` — the resolved env-var values for the
spawned process (built from `resolveProjectEnvVars`,
`_discovery/02-runtime-infra.md` §"Per-project process lifecycle").
Builds a literal-match regex per build session and replaces every
occurrence.

```ts
function buildEnvRedactor(): LogFilter {
  return {
    id: "env-values",
    alwaysOn: true,
    apply(line, ctx) {
      let out = line;
      for (const v of ctx.envSecrets) {
        if (!v || v.length < 4) continue;          // skip empties + trivially short
        // Escape regex metas; build per-line lazily-cached regex
        const re = literalRegexCache.get(v) ?? new RegExp(escapeRe(v), "g");
        out = out.replace(re, "<REDACTED:env>");
      }
      return out;
    }
  };
}
```

Notes:
- We do NOT include the env-var KEY in the token (`<REDACTED:env:DB_URL>`)
  because the key itself can reveal the integration (e.g.
  `STRIPE_SECRET_KEY`). Plain `<REDACTED:env>` only.
- Only values with `length >= 4` are matched to avoid matching every
  occurrence of a 1-char value like `1`.
- `literalRegexCache` is a per-build-session LRU; cleared on build end.

**Tests** (table — see §7):

| Input | Env vars | Expected |
|---|---|---|
| `connecting to postgres://user:s3cr3t@host:5432/db` | `DB_URL=postgres://user:s3cr3t@host:5432/db` | `connecting to <REDACTED:env>` |
| `key = sbp_abcdef0123` | `SUPABASE_KEY=sbp_abcdef0123` | `key = <REDACTED:env>` (env hits before generic shape) |
| `value: a` (1 char) | `X=a` | `value: a` (skipped — too short) |

### 3.2 Path redactor (`path`)

Collapses absolute filesystem paths to project-relative or `<REDACTED:path>`.

```ts
function buildPathRedactor(): LogFilter {
  return {
    id: "path",
    apply(line, ctx) {
      let out = line;

      // a) project-relative rewrite
      // /data/projects/<uuid>/src/App.tsx → src/App.tsx
      out = out.replace(
        new RegExp(escapeRe(ctx.projectPath) + "[/\\\\]?", "g"),
        ""
      );

      // b) /home/<user>/... → <REDACTED:path>
      out = out.replace(/\/home\/[^\/\s]+\/[^\s)]*/g, "<REDACTED:path>");

      // c) Windows C:\Users\<user>\...
      out = out.replace(/[A-Z]:\\Users\\[^\\]+\\[^\s)]*/gi, "<REDACTED:path>");

      // d) /root/... (the prod app dir per CLAUDE.md "Deployment")
      out = out.replace(/\/root\/(?!doable\/projects\/)[^\s)]*/g, "<REDACTED:path>");

      // e) /Users/<mac-user>/...
      out = out.replace(/\/Users\/[^\/\s]+\/[^\s)]*/g, "<REDACTED:path>");

      return out;
    }
  };
}
```

**Tests:**

| Input | Expected |
|---|---|
| `error in /data/projects/abc-uuid/src/App.tsx:5:10` | `error in src/App.tsx:5:10` |
| `at /home/gj/.npm/_cacache/x` | `at <REDACTED:path>` |
| `at C:\Users\gj\Documents\workspace\doable\node_modules\foo` | `at <REDACTED:path>` |
| `at /root/doable/services/api/src/x.ts` | `at <REDACTED:path>` |

### 3.3 URL redactor (`url`)

Strips query strings and credential-bearing components. Keeps host+path skeleton.

```ts
const URL_RE = /\b(https?:\/\/)([^\s/?#)]+)(\/[^\s?#)]*)?(\?[^\s)]*)?/g;

function buildUrlRedactor(): LogFilter {
  return {
    id: "url",
    apply(line) {
      return line.replace(URL_RE, (_, scheme, host, path, query) => {
        if (host && host.includes("@")) {
          // userinfo leak — full redact
          return "<REDACTED:url>";
        }
        // Keep host + path, drop query
        return `${scheme}${host}${path ?? ""}${query ? "?<REDACTED:query>" : ""}`;
      });
    }
  };
}
```

**Tests:**

| Input | Expected |
|---|---|
| `https://api.example.com/v1/users?token=abc123` | `https://api.example.com/v1/users?<REDACTED:query>` |
| `https://user:pass@db.example.com/x` | `<REDACTED:url>` |
| `http://localhost:3100/preview/uuid/` | `http://localhost:3100/preview/uuid/` |

### 3.4 Username redactor (`username`)

Replaces literal occurrences of OS usernames seen on the host.
`ctx.osUsernames` is built at startup by reading `/etc/passwd` (Linux),
`/Users/` directory listing (macOS), or `Get-WmiObject Win32_UserAccount`
(Windows). On dev: includes the developer's local username (e.g. `gj`).

```ts
function buildUsernameRedactor(): LogFilter {
  return {
    id: "username",
    apply(line, ctx) {
      let out = line;
      for (const u of ctx.osUsernames) {
        if (u.length < 3) continue;
        // Word-boundary so we don't redact substrings like "gj" inside "package.json"
        out = out.replace(new RegExp(`\\b${escapeRe(u)}\\b`, "g"), "<REDACTED:user>");
      }
      return out;
    }
  };
}
```

**Tests:**

| Input | OS users | Expected |
|---|---|---|
| `Permission denied for user gj` | `["gj"]` | `Permission denied for user <REDACTED:user>` |
| `package.json` | `["gj"]` | `package.json` (word boundary) |

### 3.5 Email / secret-shape regexes (`shapes`) — ALWAYS ON

```ts
const PATTERNS: Array<[RegExp, string]> = [
  // Email — RFC 2822-ish (intentionally lax)
  [/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g, "<REDACTED:email>"],

  // AWS access key
  [/\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASCA)[0-9A-Z]{16}\b/g, "<REDACTED:aws-key>"],
  // AWS secret key — 40-char base64-y, harder to fingerprint, prefer entropy

  // GitHub tokens
  [/\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g, "<REDACTED:github-token>"],
  [/\bgithub_pat_[A-Za-z0-9_]{82}\b/g, "<REDACTED:github-pat>"],

  // Supabase
  [/\bsbp_[a-z0-9]{40}\b/g, "<REDACTED:supabase-key>"],

  // Slack
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, "<REDACTED:slack-token>"],

  // Stripe
  [/\b(?:sk|pk|rk)_(?:test|live)_[A-Za-z0-9]{20,}\b/g, "<REDACTED:stripe-key>"],

  // Generic JWT (3 base64url segments)
  [/\beyJ[A-Za-z0-9_\-]{8,}\.eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\b/g, "<REDACTED:jwt>"],

  // Anthropic / OpenAI
  [/\bsk-ant-[A-Za-z0-9_\-]{20,}\b/g, "<REDACTED:anthropic-key>"],
  [/\bsk-(?:proj-)?[A-Za-z0-9]{20,}\b/g, "<REDACTED:openai-key>"],
];

function buildShapeRedactor(): LogFilter {
  return {
    id: "shapes",
    alwaysOn: true,
    apply(line) {
      let out = line;
      for (const [re, token] of PATTERNS) out = out.replace(re, token);
      return out;
    }
  };
}
```

**Tests:**

| Input | Expected |
|---|---|
| `key=ghp_abcdefghijklmnopqrstuvwxyz0123456789AB` | `key=<REDACTED:github-token>` |
| `Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c` | `Authorization: Bearer <REDACTED:jwt>` |
| `contact: alice@example.com` | `contact: <REDACTED:email>` |

### 3.6 Generic high-entropy redactor (`entropy`) — ALWAYS ON

Last resort. Heuristic: any "word" of `length >= 32` whose
Shannon entropy `> 4.0 bits/char` and which does NOT match a path-y
shape (no `/`, `\`) is replaced.

```ts
function shannonBitsPerChar(s: string): number {
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let h = 0;
  for (const c of counts.values()) {
    const p = c / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

const WORD_RE = /\b[A-Za-z0-9_\-+/=]{32,256}\b/g;

function buildEntropyRedactor(): LogFilter {
  return {
    id: "entropy",
    alwaysOn: true,
    apply(line) {
      return line.replace(WORD_RE, (m) =>
        shannonBitsPerChar(m) > 4.0 ? "<REDACTED:high-entropy>" : m
      );
    }
  };
}
```

False-positives are acceptable; the auditor logs counts (§6) so we can
tune threshold per environment without seeing payloads.

**Tests:**

| Input | Expected |
|---|---|
| `hash: ab12cd34ef56...64chars total ABCDEFGH...` (high entropy) | `hash: <REDACTED:high-entropy>` |
| `hello world this is a normal log line` | unchanged |
| `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` (low entropy) | unchanged (entropy < 4) |

---

## 4. Custom filters

### 4.1 Adapter-supplied

```ts
interface FrameworkAdapter {
  // ... see 02-framework-abstraction.md
  /** Optional. Adapter-specific redactions, run AFTER built-ins. */
  logFilters?: LogFilter[];
}
```

Use case: the Vite adapter strips `vite-error-overlay` HTML tags from
parsed error messages before they reach the wire (replicating today's
overlay-text scrubbing in `services/api/src/ai/preview-errors.ts`,
`_discovery/01-vite-flow.md` item 21). The Next.js adapter might
collapse `_next/static/chunks/<long-hash>.js` references.

### 4.2 Project-supplied (workspace policy)

Workspace admin can configure additional filters through a
`workspace_policies` table:

```sql
CREATE TABLE workspace_log_filters (
  workspace_id UUID NOT NULL,
  id           SERIAL,
  filter_id    TEXT NOT NULL,           -- e.g. "deny-pattern"
  config       JSONB NOT NULL,          -- e.g. {"pattern":"INTERNAL-\\d+","token":"<REDACTED:internal>"}
  enabled      BOOL NOT NULL DEFAULT true,
  PRIMARY KEY (workspace_id, id)
);
```

Two built-in filter types are configurable: `deny-pattern` (regex →
token) and `drop-pattern` (regex → drop entire line).

### 4.3 Composition order (recap, complete)

```
1. truncate                     [always-on, framework]
2. env-values                   [always-on]
3. shapes                       [always-on]
4. entropy                      [always-on]
5. path                         [default-on, can be disabled per project? NO — see §5]
6. url                          [always-on]
7. username                     [default-on]
8. email                        [folded into shapes]
9. adapter.logFilters[]         [adapter-controlled]
10. workspace_log_filters[]     [admin-controlled, evaluated in `id` order]
```

---

## 5. Always-on baseline

The following filters **CANNOT** be disabled by any UI, admin setting,
or feature flag:

- `env-values`
- `shapes`
- `entropy`
- `url` (the userinfo branch — full URL passthrough is allowed when no
  credentials present)
- `path` (the absolute-path branches — project-relative rewrite is OK
  to disable for debugging, but `/home`/`C:\Users`/`/root`/`/Users`
  rewrites are mandatory)

Implementation: `LogFilter.alwaysOn=true` means the chain constructor
will refuse to remove or reorder them. Workspace admins can ADD
filters but cannot remove always-on ones. Code-level enforcement:

```ts
class LogFilterChain {
  constructor(filters: LogFilter[]) {
    const alwaysOn = builtIns.filter(f => f.alwaysOn);
    const userFilters = filters.filter(f => !f.alwaysOn);
    this.filters = [...alwaysOn, ...userFilters];   // always-on always wins
  }
}
```

---

## 6. Auditability

Every redaction increments a per-filter counter. We log COUNTS, never
payloads.

```ts
// metrics namespace: build_filter_*
//   build_filter_match_total{filter_id, project_id, env}      // counts redactions
//   build_filter_drop_total{filter_id, project_id, env}       // counts dropped lines
//   build_filter_error_total{filter_id, project_id, env}      // counts thrown filters
//   build_filter_apply_seconds{filter_id} (histogram)         // per-line wall-time
```

Periodic dashboard (Vigil per memory `feedback_vigil_visual_first.md`):
top filter IDs by match count. A spike in `entropy` matches without a
corresponding `shapes` spike is a signal we're over-redacting normal
log lines and should tune the entropy threshold.

We do NOT log the matched substring, the offset, or any context that
could be used to reconstruct the redacted value. Counts only.

---

## 7. Tests

### 7.1 Per-filter unit tests (table)

The complete table sits in `services/api/src/build-events/filters/*.test.ts`.
Excerpt:

| Filter | Input | Context | Expected output |
|---|---|---|---|
| env-values | `db url is postgres://u:s3cr3t@h:5432/x` | `envSecrets=["postgres://u:s3cr3t@h:5432/x"]` | `db url is <REDACTED:env>` |
| env-values | `key abc` | `envSecrets=["a"]` | `key abc` (too short, not matched) |
| shapes | `tok=ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` | n/a | `tok=<REDACTED:github-token>` |
| shapes | `email me at bob@example.org` | n/a | `email me at <REDACTED:email>` |
| shapes | `eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123XYZdefXYZ123abc` | n/a | `<REDACTED:jwt>` |
| entropy | `id 8d4f9a2c8d4f9a2c8d4f9a2c8d4f9a2c8d4f9a2c` | n/a | `id <REDACTED:high-entropy>` |
| entropy | `the quick brown fox jumps over the lazy dog 1 2 3` | n/a | unchanged |
| path | `error in /data/projects/uuid/src/x.ts:1` | `projectPath="/data/projects/uuid"` | `error in src/x.ts:1` |
| path | `at /home/alice/x` | n/a | `at <REDACTED:path>` |
| path | `at C:\Users\gj\workspace\doable\src\foo.ts` | n/a | `at <REDACTED:path>` |
| url | `GET https://api.example.com/v1?key=abc` | n/a | `GET https://api.example.com/v1?<REDACTED:query>` |
| url | `https://u:p@h.example.com/x` | n/a | `<REDACTED:url>` |
| username | `Permission denied for user gj` | `osUsernames=["gj"]` | `Permission denied for user <REDACTED:user>` |
| username | `package.json` | `osUsernames=["gj"]` | `package.json` (word boundary) |

### 7.2 End-to-end chain tests

Same input flows through the full chain in order and asserts the final
output. Important cases:

| Input | Expected |
|---|---|
| `loaded /data/projects/uuid/.env: KEY=ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` | `loaded .env: KEY=<REDACTED:github-token>` |
| `connect https://user:pass@db.host?token=ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` | `connect <REDACTED:url>` (URL redactor wins on userinfo; token also caught earlier by shapes — both protections layered) |

### 7.3 Property-based tests

For each shape regex: generate 1 000 random matching strings, assert
all are redacted. For each non-matching corpus (program identifiers,
file paths, prose), assert match rate stays below 0.5%.

### 7.4 Anti-bypass tests

| Attack | Expected |
|---|---|
| Newline embedded in env value: `secret\nfoo=bar` | line-by-line redaction still catches `secret` if env-values regex is built on raw value |
| Unicode homoglyph in token (`ghр_…` — Cyrillic р) | NOT caught by shape regex (false negative). Mitigation: entropy filter still redacts |
| Base64-wrapped token | If wrapped result still has high entropy and length ≥ 32, entropy filter catches |

These tests document known gaps, not assertions of completeness.

---

## 8. Performance

Constraints:

- Sub-millisecond per line at p99 for typical log lines (≤512 bytes).
- A pathological 10MB line MUST not block the publisher more than
  truncation cost (~O(line length) once).

Implementation:

- **Truncate first.** `MAX_LINE_BYTES=8192` (matches PRD 03 §6.4) is
  enforced as the FIRST filter so all subsequent regex work is bounded.
  Truncation suffix: `<TRUNC:+N>`.
- **Precompiled regexes.** Every shape pattern is a module-level
  `const RegExp`; entropy WORD_RE is module-level; per-build env-value
  regexes are LRU-cached for the build session.
- **Single-pass strategy where possible.** The shapes filter runs N
  regex `.replace`s; we accept the cost rather than building a single
  alternation (which loses the per-pattern token).
- **Avoid catastrophic backtracking.** All shape regexes use bounded
  quantifiers (`{20,255}` not `+`). URL regex uses negated character
  classes (`[^\s/?#]+`) instead of `.+`. Reviewed for ReDoS before
  merge.

Benchmark target (CI): 10 000 lines × 256 bytes through full chain in
< 250 ms wall on a single core.

---

## 9. Failure mode

**Fail-closed.** If any filter throws on an input line, the line is
DROPPED (not passed through unredacted). Concretely:

```ts
try {
  cur = f.apply(cur!, ctx);
} catch (e) {
  metrics.inc("filter_error", { id: f.id });
  log.warn("filter threw, dropping line", { id: f.id });
  return null;       // line never reaches the wire
}
```

Why fail-closed:
- A filter throwing usually means an unexpected input shape — exactly
  the case where novel data could be a leak.
- The user loses one log line. They do NOT lose a credential.

A circuit-breaker SHOULD be wired: if a single filter throws on >1% of
lines in any 60s window, that filter is auto-disabled (replaced with
a passthrough that increments `filter_disabled_total{id}`). This
prevents a buggy filter from silencing the entire build. NOTE: this
only applies to non-`alwaysOn` filters. An always-on filter that
throws repeatedly pages on-call instead of being disabled.

Tests:
- Fuzz each filter with 10k random byte strings; assert no panic.
- Assert that filter throwing produces NO output line and a metric.

---

## 10. Open issues

1. **Should the redactor see `tool_call.arguments` payloads?** Today
   `tool_call` SSE events
   (`_discovery/03-streaming.md` §"Copilot tool-event bridge") send
   raw arg objects to the client — `arguments` may include file paths
   and AI-pasted credential-looking strings. Proposal: route those
   args through the same chain (or a JSON-aware variant) before
   serialization. Out of scope for this PRD but worth scheduling.
2. **Per-environment filter sets.** Should dev mode use a more
   permissive path filter (so the developer SEES `/data/projects/...`
   and can navigate)? Recommendation: NO. Dev should match prod to
   prevent surprises. The IDE has its own way of showing local paths
   outside the build event stream.
3. **Adapter-supplied always-on filters.** Should an adapter be able
   to declare its own filter as `alwaysOn`? Probably yes for
   framework-specific credentials (e.g. a Convex adapter could mark
   its dev-key shape always-on). Lock-down: only adapters bundled in
   the Doable binary can set `alwaysOn`; user-supplied adapters
   cannot.
4. **Audit of existing log paths.** This PRD covers the build-event
   publisher. Other places that already write to SSE/WS (chat
   `text_delta`, `tool_result`) bypass this chain. Follow-up: a
   universal "outbound text guard" wrapper that runs the same chain
   over EVERY string-typed payload before any `writeSSE` / WS broadcast.
5. **Performance fall-back at very high log rates.** PRD 03 §6 caps
   batching at 50 lines / 50ms. If the redactor itself becomes the
   bottleneck under sustained 10k lines/sec, a streaming Aho-Corasick
   matcher across all literal env values would help. Defer until
   measured.
6. **Internationalization.** Email and entropy regexes are ASCII-leaning.
   Non-Latin scripts in tokens may slip past entropy if char distribution
   is narrow. Acceptable for v1; revisit if a real customer reports it.
7. **Reversal for support / debug.** When a user reports "this build
   failed and I can't tell why because everything is redacted," we
   need an internal-only path that lets a Doable engineer (NOT a
   workspace admin) view the raw line. Proposal: a separate "raw log
   capture" feature gated by an Anthropic-side admin tool, writing to
   a short-TTL secure store, OFF by default. PRD pending.
