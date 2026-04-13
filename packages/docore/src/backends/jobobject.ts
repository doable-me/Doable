/**
 * Windows Job Objects isolation backend.
 *
 * Uses Win32 Job Objects (via PowerShell + inline C# P/Invoke) to enforce
 * memory limits, active process limits, and kill-on-close semantics.
 * Windows only. No extra binaries required.
 */

import { spawn, type ChildProcess } from "node:child_process";
import type { IsolationBackend, SpawnContext, ResourceLimits, BackendConfig } from "./types.js";

export class JobObjectBackend implements IsolationBackend {
  readonly name = "jobobject";
  readonly description = "Memory + process limits via Win32 Job Objects (Windows)";
  readonly priority = 60;

  available(): boolean {
    return process.platform === "win32";
  }

  spawn(ctx: SpawnContext, limits: ResourceLimits, _config: BackendConfig): ChildProcess {
    const memBytes = parseMemoryLimit(limits.memoryMax);
    const isJs = ctx.cliPath.endsWith(".js");
    const executable = isJs ? process.execPath : ctx.cliPath;

    const cliArgsStr = [
      ...(isJs ? [`"${ctx.cliPath}"`] : []),
      "--headless",
      "--no-auto-update",
      "--log-level", ctx.logLevel,
      "--port", ctx.port.toString(),
      "--auth-token-env", ctx.tokenEnvVar,
    ].join(" ");

    const script = buildJobObjectScript(
      executable,
      cliArgsStr,
      ctx.cwd,
      memBytes,
      limits.tasksMax,
    );

    const encoded = Buffer.from(script, "utf16le").toString("base64");

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...ctx.env,
      [ctx.tokenEnvVar]: ctx.token,
      NODE_DEBUG: "",
    };

    return spawn("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy", "Bypass",
      "-EncodedCommand", encoded,
    ], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: ctx.cwd,
      env,
      windowsHide: true,
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseMemoryLimit(limit: string): number {
  const match = limit.match(/^(\d+)\s*([KMGT]?)B?$/i);
  if (!match) return 200 * 1024 * 1024;
  const num = parseInt(match[1], 10);
  switch ((match[2] || "").toUpperCase()) {
    case "K": return num * 1024;
    case "M": return num * 1024 * 1024;
    case "G": return num * 1024 * 1024 * 1024;
    case "T": return num * 1024 * 1024 * 1024 * 1024;
    default: return num;
  }
}

function buildJobObjectScript(
  executable: string,
  argsStr: string,
  workDir: string,
  memoryLimitBytes: number,
  activeProcessLimit: number,
): string {
  const e = (s: string) => s.replace(/'/g, "''");
  return `$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public class WinJobObject : IDisposable {
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  static extern IntPtr CreateJobObjectW(IntPtr a, string n);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool SetInformationJobObject(IntPtr h, int c, IntPtr i, uint l);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool AssignProcessToJobObject(IntPtr j, IntPtr p);
  [DllImport("kernel32.dll")]
  static extern bool CloseHandle(IntPtr h);

  [StructLayout(LayoutKind.Sequential)]
  struct BASIC {
    public long PerProcessUserTimeLimit;
    public long PerJobUserTimeLimit;
    public uint LimitFlags;
    public UIntPtr MinWorkingSet;
    public UIntPtr MaxWorkingSet;
    public uint ActiveProcessLimit;
    public UIntPtr Affinity;
    public uint PriorityClass;
    public uint SchedulingClass;
  }

  [StructLayout(LayoutKind.Sequential)]
  struct IO_COUNTERS { public ulong R,W,O,RB,WB,OB; }

  [StructLayout(LayoutKind.Sequential)]
  struct EXTENDED {
    public BASIC BasicLimitInformation;
    public IO_COUNTERS IoInfo;
    public UIntPtr ProcessMemoryLimit;
    public UIntPtr JobMemoryLimit;
    public UIntPtr PeakProcessMemoryUsed;
    public UIntPtr PeakJobMemoryUsed;
  }

  IntPtr handle;
  public WinJobObject() {
    handle = CreateJobObjectW(IntPtr.Zero, null);
    if (handle == IntPtr.Zero) throw new Exception("CreateJobObject failed: " + Marshal.GetLastWin32Error());
  }
  public void SetLimits(long mem, int procs) {
    var info = new EXTENDED();
    uint f = 0x2000u;
    if (mem > 0) { info.JobMemoryLimit = (UIntPtr)(ulong)mem; f |= 0x200u; }
    if (procs > 0) { info.BasicLimitInformation.ActiveProcessLimit = (uint)procs; f |= 0x8u; }
    info.BasicLimitInformation.LimitFlags = f;
    int sz = Marshal.SizeOf(typeof(EXTENDED));
    IntPtr ptr = Marshal.AllocHGlobal(sz);
    try {
      Marshal.StructureToPtr(info, ptr, false);
      if (!SetInformationJobObject(handle, 9, ptr, (uint)sz))
        throw new Exception("SetInformationJobObject failed: " + Marshal.GetLastWin32Error());
    } finally { Marshal.FreeHGlobal(ptr); }
  }
  public void Assign(IntPtr ph) {
    if (!AssignProcessToJobObject(handle, ph))
      throw new Exception("AssignProcessToJobObject failed: " + Marshal.GetLastWin32Error());
  }
  public void Dispose() {
    if (handle != IntPtr.Zero) { CloseHandle(handle); handle = IntPtr.Zero; }
  }
}
'@

$job = [WinJobObject]::new()
$job.SetLimits(${memoryLimitBytes}, ${activeProcessLimit})

$psi = [System.Diagnostics.ProcessStartInfo]::new()
$psi.FileName = '${e(executable)}'
$psi.Arguments = '${e(argsStr)}'
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.WorkingDirectory = '${e(workDir)}'
$psi.CreateNoWindow = $true

$proc = [System.Diagnostics.Process]::Start($psi)
$job.Assign($proc.Handle)

$proc.add_ErrorDataReceived({
  param($s, $e)
  if ($e.Data) { [Console]::Error.WriteLine($e.Data) }
})
$proc.BeginErrorReadLine()

while (-not $proc.StandardOutput.EndOfStream) {
  $line = $proc.StandardOutput.ReadLine()
  [Console]::Out.WriteLine($line)
  [Console]::Out.Flush()
}

$proc.WaitForExit()
$code = $proc.ExitCode
$job.Dispose()
$proc.Dispose()
exit $code`;
}
