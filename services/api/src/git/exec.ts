// ─── Git CLI Executor ────────────────────────────────────────
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { rootCertificates } from "node:tls";
import { writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

// ─── CA bundle for HTTPS git remotes ─────────────────────────
// The git CLI verifies github.com's TLS cert against the host's CA store.
// On hosts where that store is missing or unreadable by the API user
// (minimal Docker images, sandboxed/baremetal installs, gnutls builds with
// no default CA path) git fails every fetch/clone/push with:
//   "server certificate verification failed. CAfile: none CRLfile: none"
// To make HTTPS git work the same on ANY install, we point git at Node's
// bundled Mozilla root certificates (always present in-process) by writing
// them to a temp PEM once and exporting GIT_SSL_CAINFO. An operator-provided
// GIT_SSL_CAINFO that actually exists is respected and wins.
let caBundlePath: string | null | undefined;
function getCaBundlePath(): string | null {
  if (caBundlePath !== undefined) return caBundlePath;
  const operator = process.env.GIT_SSL_CAINFO;
  if (operator && existsSync(operator)) {
    caBundlePath = operator;
    return caBundlePath;
  }
  try {
    const p = join(tmpdir(), "doable-git-ca-bundle.pem");
    if (!existsSync(p)) {
      writeFileSync(p, rootCertificates.join("\n") + "\n", { mode: 0o644 });
    }
    caBundlePath = p;
  } catch {
    caBundlePath = null; // fall back to git's default behaviour
  }
  return caBundlePath;
}

export interface ExecOpts {
  env?: Record<string, string>;
  timeout?: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export class GitError extends Error {
  readonly exitCode: number;
  readonly stderr: string;
  constructor(message: string, exitCode: number, stderr: string) {
    super(message);
    this.name = "GitError";
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

export async function execGit(
  projectPath: string,
  args: string[],
  opts?: ExecOpts
): Promise<ExecResult> {
  try {
    // Trust the project dir regardless of its on-disk owner. Generated/imported
    // project trees get chowned to a per-project sandbox UID (dev-uid-allocator,
    // so the bwrap-jailed Vite can read/write them — see projects/dev-server-start.ts),
    // but the API runs git as the `doable` user. Without this, every git op in
    // such a repo dies with `fatal: detected dubious ownership in repository`
    // and GitHub connect/push fails. Scoping safe.directory to THIS projectPath
    // (per-call) is the exact exception git itself suggests — narrower than a
    // global `safe.directory=*` and works on any install (docker/baremetal/cli)
    // no matter which uid owns the dir.
    const gitArgs = ["-c", `safe.directory=${projectPath}`, ...args];
    const { stdout, stderr } = await execFileAsync("git", gitArgs, {
      cwd: projectPath,
      timeout: opts?.timeout ?? 30_000,
      maxBuffer: 10 * 1024 * 1024, // 10 MB
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        ...(getCaBundlePath() ? { GIT_SSL_CAINFO: getCaBundlePath()! } : {}),
        ...opts?.env,
      },
    });
    return { stdout: stdout.trimEnd(), stderr: stderr.trimEnd() };
  } catch (err: unknown) {
    const e = err as {
      code?: number | string;
      stderr?: string;
      message?: string;
    };
    const exitCode =
      typeof e.code === "number" ? e.code : 1;
    const stderr =
      typeof e.stderr === "string" ? e.stderr.trimEnd() : "";
    throw new GitError(
      `git ${args[0]} failed: ${stderr || e.message || "unknown error"}`,
      exitCode,
      stderr
    );
  }
}
