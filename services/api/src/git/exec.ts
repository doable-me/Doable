// ─── Git CLI Executor ────────────────────────────────────────
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd: projectPath,
      timeout: opts?.timeout ?? 30_000,
      maxBuffer: 10 * 1024 * 1024, // 10 MB
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
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
