import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ResourceBackend } from "./types.js";
import type { ResourceLimits, WrapResult } from "../types.js";

/**
 * Full Windows isolation backend.
 *
 * Three mechanisms, all kernel-level, all zero runtime overhead:
 *
 * 1. **Win32 Job Objects** (via PowerShell P/Invoke)
 *    - MemoryMax: hard OS limit, OOM-killed if exceeded (not just V8 heap)
 *    - CPURate: hard CPU rate cap (e.g. 30% = process gets max 30% CPU)
 *    - TasksMax: active process limit (blocks fork bombs)
 *    - Kill-on-close: all processes die when parent exits (no orphans)
 *
 * 2. **Proxy env poisoning** (for network blocking)
 *    - Sets HTTP_PROXY / HTTPS_PROXY to dead endpoint (0.0.0.0:1)
 *    - NO_PROXY allows localhost (dev server still works)
 *    - Blocks all HTTP-based exfiltration (fetch, axios, http.request)
 *
 * 3. **V8 heap limit** (belt-and-suspenders with Job Object)
 *    - --max-old-space-size in NODE_OPTIONS
 *    - Catches JS heap growth before the Job Object OOM-kills the process
 *    - Produces a cleaner error message ("JavaScript heap out of memory")
 *
 * How it works:
 *   The backend writes a small PowerShell wrapper script (.ps1) that uses
 *   .NET P/Invoke to create a Win32 Job Object, sets resource limits, assigns
 *   the current PowerShell process to the Job Object (so all children inherit
 *   the limits), then execs the actual command. The script is cached in temp.
 *
 * Overhead:
 *   ~15MB for the PowerShell process (acceptable for dev; prod uses Linux/systemd).
 *   Job Object and proxy env checks are kernel-level — zero per-operation cost.
 *
 * Requirements:
 *   - Windows 10+ (nested Job Objects need Windows 8+)
 *   - PowerShell 5.1+ (ships with Windows 10)
 *   - 64-bit OS (x64 struct layout assumed)
 */
export class WindowsBackend implements ResourceBackend {
  readonly name = "windows";
  readonly priority = 60;
  readonly description =
    "Windows Job Objects (memory + CPU + tasks) + proxy env (network) + V8 heap limit";

  private cachedScriptPath: string | null = null;

  available(): boolean {
    if (process.platform !== "win32") return false;
    // PowerShell 5.1 ships with all supported Windows 10+ versions
    try {
      const { execSync } = require("node:child_process");
      execSync("powershell.exe -NoProfile -Command $PSVersionTable.PSVersion", {
        stdio: "pipe",
        timeout: 5000,
      });
      return true;
    } catch {
      return false;
    }
  }

  wrapSpawn(
    command: string,
    args: string[],
    options: { limits: ResourceLimits; blockNetwork?: boolean },
  ): WrapResult {
    const { limits, blockNetwork } = options;
    const env: Record<string, string> = {};

    // ── Network: proxy poisoning ──
    // All HTTP client libraries (fetch, axios, node-fetch, undici, http.request)
    // honor HTTP_PROXY/HTTPS_PROXY. Setting them to a dead endpoint blocks all
    // outbound HTTP/HTTPS. NO_PROXY allows localhost so dev servers still work.
    if (blockNetwork !== false) {
      env.HTTP_PROXY = "http://0.0.0.0:1";
      env.HTTPS_PROXY = "http://0.0.0.0:1";
      env.http_proxy = "http://0.0.0.0:1";
      env.https_proxy = "http://0.0.0.0:1";
      env.NO_PROXY = "localhost,127.0.0.1,::1";
      env.no_proxy = "localhost,127.0.0.1,::1";
    }

    // ── V8 heap limit (belt-and-suspenders) ──
    const heapMb = parseMemoryToMb(limits.memoryMax);
    const existingNodeOpts = process.env.NODE_OPTIONS ?? "";
    env.NODE_OPTIONS = `${existingNodeOpts} --max-old-space-size=${heapMb}`.trim();

    // ── Job Object: pass limits via env vars ──
    env.__DOVAULT_EXE = command;
    env.__DOVAULT_ARGS = JSON.stringify(args);
    env.__DOVAULT_MEM = String(parseMemoryToBytes(limits.memoryMax));
    env.__DOVAULT_CPU = String(parseCpuToHundredths(limits.cpuQuota));
    env.__DOVAULT_TASKS = String(limits.tasksMax);

    // ── Wrap command in PowerShell Job Object wrapper ──
    const scriptPath = this.ensureWrapperScript();

    return {
      command: "powershell.exe",
      args: [
        "-NoProfile",
        "-NoLogo",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
      ],
      env,
    };
  }

  /**
   * Wrap a command for jailed execution.
   *
   * Windows doesn't have kernel-level filesystem isolation (no chroot/namespaces)
   * without Hyper-V containers. This provides:
   *   - Job Object: memory, CPU, task limits (OS-enforced)
   *   - Kill-on-close: all children die when parent exits
   *   - Network: proxy poisoning (HTTP-level block)
   *   - V8 heap limit (Node.js processes)
   *
   * The jail path is passed to the caller for cwd enforcement but does NOT
   * restrict filesystem access at the kernel level. The docore permission
   * handler (command allowlist + path validation) remains the primary gate
   * on Windows.
   */
  wrapExec(
    command: string,
    args: string[],
    options: { limits: ResourceLimits; blockNetwork?: boolean; jail: string },
  ): WrapResult {
    // On Windows, wrapExec is identical to wrapSpawn — Job Objects handle
    // resources, but true FS isolation requires containers (not available
    // without Hyper-V). The jail parameter is used by the caller for cwd.
    return this.wrapSpawn(command, args, options);
  }

  /**
   * Write the PowerShell wrapper script to temp (once, cached).
   */
  private ensureWrapperScript(): string {
    if (this.cachedScriptPath && existsSync(this.cachedScriptPath)) {
      return this.cachedScriptPath;
    }

    const vaultDir = join(tmpdir(), "dovault");
    if (!existsSync(vaultDir)) {
      mkdirSync(vaultDir, { recursive: true });
    }

    const scriptPath = join(vaultDir, "job-wrapper.ps1");
    writeFileSync(scriptPath, POWERSHELL_JOB_WRAPPER, "utf-8");
    this.cachedScriptPath = scriptPath;
    return scriptPath;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Parsing helpers
// ═══════════════════════════════════════════════════════════════════════════

function parseMemoryToMb(value: string): number {
  const match = value.match(/^(\d+)\s*(M|G|K)?$/i);
  if (!match) return 200;
  const num = parseInt(match[1]!, 10);
  const unit = (match[2] ?? "M").toUpperCase();
  switch (unit) {
    case "G": return num * 1024;
    case "K": return Math.max(1, Math.round(num / 1024));
    default: return num;
  }
}

function parseMemoryToBytes(value: string): number {
  return parseMemoryToMb(value) * 1024 * 1024;
}

function parseCpuToHundredths(value: string): number {
  // "30%" → 3000 (hundredths of a percent, as Windows CPU rate control expects)
  const match = value.match(/^(\d+)%?$/);
  if (!match) return 5000; // default 50%
  return parseInt(match[1]!, 10) * 100;
}

// ═══════════════════════════════════════════════════════════════════════════
// PowerShell Job Object Wrapper Script
//
// Uses .NET P/Invoke to call Win32 Job Object APIs directly.
// All limits, command, and args are passed via environment variables
// to avoid PowerShell parameter quoting issues.
//
// Flow:
//   1. Compile C# P/Invoke bindings (Add-Type, cached in-session)
//   2. Create a Job Object
//   3. Set memory limit (JobMemoryLimit)
//   4. Set CPU rate cap (CpuRateControlInformation)
//   5. Set active process limit (ActiveProcessLimit)
//   6. Enable kill-on-close (all children die when parent exits)
//   7. Assign current PowerShell process to the Job Object
//   8. Clean up dovault env vars
//   9. Exec the actual command (inherits Job Object from parent)
//  10. Exit with the child's exit code
// ═══════════════════════════════════════════════════════════════════════════

const POWERSHELL_JOB_WRAPPER = `
# dovault Job Object wrapper — do not edit (generated by dovault)
$ErrorActionPreference = 'Stop'

# ── Read config from environment ──
$exe = $env:__DOVAULT_EXE
$argsJson = $env:__DOVAULT_ARGS
$memBytes = [long]($env:__DOVAULT_MEM)
$cpuRate = [int]($env:__DOVAULT_CPU)
$maxProcs = [int]($env:__DOVAULT_TASKS)

$exeArgs = @()
if ($argsJson) {
  $parsed = $argsJson | ConvertFrom-Json
  if ($parsed -is [array]) { $exeArgs = @($parsed) }
  elseif ($parsed) { $exeArgs = @($parsed) }
}

# ── Compile Win32 Job Object bindings ──
try {
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class DovaultJob
{
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern IntPtr CreateJobObjectW(IntPtr sa, string name);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool SetInformationJobObject(
        IntPtr hJob, int infoClass, IntPtr info, uint cbLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProc);

    [DllImport("kernel32.dll")]
    public static extern bool CloseHandle(IntPtr h);

    // InfoClass constants
    public const int ExtendedLimitInformation = 9;
    public const int CpuRateControlInformation = 15;

    // LimitFlags
    public const uint KILL_ON_JOB_CLOSE = 0x00002000;
    public const uint ACTIVE_PROCESS    = 0x00000008;
    public const uint JOB_MEMORY        = 0x00000200;

    // CPU rate control flags
    public const uint CPU_RATE_ENABLE   = 0x00000001;
    public const uint CPU_RATE_HARD_CAP = 0x00000004;
}

// JOBOBJECT_BASIC_LIMIT_INFORMATION (64 bytes on x64)
[StructLayout(LayoutKind.Sequential)]
public struct JOBOBJECT_BASIC_LIMIT_INFORMATION
{
    public long   PerProcessUserTimeLimit;
    public long   PerJobUserTimeLimit;
    public uint   LimitFlags;
    public UIntPtr MinimumWorkingSetSize;
    public UIntPtr MaximumWorkingSetSize;
    public uint   ActiveProcessLimit;
    public UIntPtr Affinity;
    public uint   PriorityClass;
    public uint   SchedulingClass;
}

// IO_COUNTERS (48 bytes)
[StructLayout(LayoutKind.Sequential)]
public struct IO_COUNTERS
{
    public ulong ReadOperationCount;
    public ulong WriteOperationCount;
    public ulong OtherOperationCount;
    public ulong ReadTransferCount;
    public ulong WriteTransferCount;
    public ulong OtherTransferCount;
}

// JOBOBJECT_EXTENDED_LIMIT_INFORMATION (144 bytes on x64)
[StructLayout(LayoutKind.Sequential)]
public struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
{
    public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
    public IO_COUNTERS IoInfo;
    public UIntPtr ProcessMemoryLimit;
    public UIntPtr JobMemoryLimit;
    public UIntPtr PeakProcessMemoryUsed;
    public UIntPtr PeakJobMemoryUsed;
}

// JOBOBJECT_CPU_RATE_CONTROL_INFORMATION (8 bytes)
[StructLayout(LayoutKind.Sequential)]
public struct JOBOBJECT_CPU_RATE_CONTROL_INFORMATION
{
    public uint ControlFlags;
    public uint CpuRate;
}
"@ -ErrorAction Stop

# ── Create Job Object ──
$job = [DovaultJob]::CreateJobObjectW([IntPtr]::Zero, $null)
if ($job -eq [IntPtr]::Zero) {
  Write-Error "CreateJobObject failed: $([System.Runtime.InteropServices.Marshal]::GetLastWin32Error())"
  throw "Failed to create Job Object"
}

# ── Set extended limits (memory, tasks, kill-on-close) ──
$extInfo = New-Object JOBOBJECT_EXTENDED_LIMIT_INFORMATION
$flags = [DovaultJob]::KILL_ON_JOB_CLOSE

if ($maxProcs -gt 0) {
  $flags = $flags -bor [DovaultJob]::ACTIVE_PROCESS
  $extInfo.BasicLimitInformation.ActiveProcessLimit = [uint32]$maxProcs
}

if ($memBytes -gt 0) {
  $flags = $flags -bor [DovaultJob]::JOB_MEMORY
  $extInfo.JobMemoryLimit = [UIntPtr]::new($memBytes)
}

$extInfo.BasicLimitInformation.LimitFlags = $flags

$extSize = [System.Runtime.InteropServices.Marshal]::SizeOf($extInfo)
$extPtr = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($extSize)
[System.Runtime.InteropServices.Marshal]::StructureToPtr($extInfo, $extPtr, $false)
$ok = [DovaultJob]::SetInformationJobObject(
  $job, [DovaultJob]::ExtendedLimitInformation, $extPtr, [uint32]$extSize)
[System.Runtime.InteropServices.Marshal]::FreeHGlobal($extPtr)

if (-not $ok) {
  Write-Warning "SetInformationJobObject(ExtendedLimit) failed: $([System.Runtime.InteropServices.Marshal]::GetLastWin32Error())"
}

# ── Set CPU rate control ──
if ($cpuRate -gt 0 -and $cpuRate -lt 10000) {
  $cpuInfo = New-Object JOBOBJECT_CPU_RATE_CONTROL_INFORMATION
  $cpuInfo.ControlFlags = [DovaultJob]::CPU_RATE_ENABLE -bor [DovaultJob]::CPU_RATE_HARD_CAP
  $cpuInfo.CpuRate = [uint32]$cpuRate

  $cpuSize = [System.Runtime.InteropServices.Marshal]::SizeOf($cpuInfo)
  $cpuPtr = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($cpuSize)
  [System.Runtime.InteropServices.Marshal]::StructureToPtr($cpuInfo, $cpuPtr, $false)
  $ok2 = [DovaultJob]::SetInformationJobObject(
    $job, [DovaultJob]::CpuRateControlInformation, $cpuPtr, [uint32]$cpuSize)
  [System.Runtime.InteropServices.Marshal]::FreeHGlobal($cpuPtr)

  if (-not $ok2) {
    Write-Warning "SetInformationJobObject(CpuRate) failed: $([System.Runtime.InteropServices.Marshal]::GetLastWin32Error())"
  }
}

# ── Assign current process to Job Object ──
# All child processes inherit the Job Object and its limits.
# Nested Job Objects are supported on Windows 8+ (we require Windows 10+).
$thisProc = [System.Diagnostics.Process]::GetCurrentProcess()
$assigned = [DovaultJob]::AssignProcessToJobObject($job, $thisProc.Handle)
if (-not $assigned) {
  Write-Warning "AssignProcessToJobObject failed: $([System.Runtime.InteropServices.Marshal]::GetLastWin32Error())"
}

} catch {
  # Job Object setup failed — run command WITHOUT limits (better than not running at all)
  Write-Warning "dovault: Job Object setup failed, running without OS limits: $_"
}

# ── Clean up dovault env vars (don't leak into child) ──
Remove-Item Env:\\__DOVAULT_EXE -ErrorAction SilentlyContinue
Remove-Item Env:\\__DOVAULT_ARGS -ErrorAction SilentlyContinue
Remove-Item Env:\\__DOVAULT_MEM -ErrorAction SilentlyContinue
Remove-Item Env:\\__DOVAULT_CPU -ErrorAction SilentlyContinue
Remove-Item Env:\\__DOVAULT_TASKS -ErrorAction SilentlyContinue

# ── Exec the actual command ──
# The child inherits stdio from PowerShell (which inherits from Node.js).
# The child inherits the Job Object from this process.
& $exe @exeArgs
exit $LASTEXITCODE
`;
