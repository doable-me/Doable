# Hetzner Robot API helper for doable test server #2987905
#
# Reads credentials from environment:
#   $env:HETZNER_ROBOT_USER  (webservice username; STARTS WITH '#', e.g. '#ws+SdXXXXXX')
#   $env:HETZNER_ROBOT_PASS  (webservice password)
#
# NOTE: Hetzner Robot webservice usernames include a literal leading '#'.
# Strip it and you get HTTP 401. The webservice user is separate from
# your account login — generate it under Robot → Preferences → Web service settings.
#
# Actions:
#   discover     - GET /server, print server_number/IP/status/DC. Never destructive.
#   rescue       - Activate Linux rescue mode (requires -Confirm). Returns rescue root password.
#   installimage - Drive an automatic Ubuntu 24.04 install from rescue (requires -Confirm).
#   reset        - Hardware reset / reboot (requires -Confirm).
#
# Hard-whitelist guard: rescue / installimage / reset refuse to run unless
# -ServerNumber is exactly 2987905. Edit ALLOWED_SERVERS below to widen.
#
# Usage:
#   $env:HETZNER_ROBOT_USER='ws+...'; $env:HETZNER_ROBOT_PASS='...'
#   .\scripts\hetzner-provision.ps1 -Action discover -ServerNumber 2987905
#   .\scripts\hetzner-provision.ps1 -Action rescue   -ServerNumber 2987905 -Confirm
#   .\scripts\hetzner-provision.ps1 -Action reset    -ServerNumber 2987905 -Confirm

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('discover', 'rescue', 'installimage', 'reset')]
    [string]$Action,

    [Parameter(Mandatory = $true)]
    [int]$ServerNumber,

    [switch]$Confirm,

    [string]$SshPubKeyPath = "$HOME\.ssh\hetzner_doable.pub"
)

$ErrorActionPreference = 'Stop'

# ── Whitelist guard ─────────────────────────────────────────────────────────
$ALLOWED_SERVERS = @(2987905)

function Fail($msg) {
    [Console]::Error.WriteLine("[hetzner-provision] $msg")
    exit 2
}

# ── Credentials ─────────────────────────────────────────────────────────────
$user = $env:HETZNER_ROBOT_USER
$pass = $env:HETZNER_ROBOT_PASS
if ([string]::IsNullOrWhiteSpace($user) -or [string]::IsNullOrWhiteSpace($pass)) {
    Fail "Set `$env:HETZNER_ROBOT_USER and `$env:HETZNER_ROBOT_PASS before running."
}

$pair = "${user}:${pass}"
$basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
$headers = @{ Authorization = "Basic $basic" }
$base = 'https://robot-ws.your-server.de'

# Clear credentials from local vars after building the header so an accidental
# Write-Host of the symbol table can't leak them.
$user = $null; $pass = $null; $pair = $null

function Invoke-Robot {
    param(
        [string]$Path,
        [string]$Method = 'GET',
        [hashtable]$Form = $null
    )
    try {
        $args = @{
            Uri                = "$base$Path"
            Method             = $Method
            Headers            = $headers
            ContentType        = 'application/x-www-form-urlencoded'
            UseBasicParsing    = $true
            TimeoutSec         = 30
        }
        if ($Form) {
            $bodyParts = @()
            foreach ($k in $Form.Keys) {
                $v = [Uri]::EscapeDataString([string]$Form[$k])
                $key = [Uri]::EscapeDataString([string]$k)
                $bodyParts += "$key=$v"
            }
            $args.Body = ($bodyParts -join '&')
        }
        $resp = Invoke-WebRequest @args
        return $resp.Content | ConvertFrom-Json
    } catch {
        $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
        Fail "Robot API $Method $Path failed (HTTP $code): $($_.Exception.Message)"
    }
}

# ── Action dispatch ─────────────────────────────────────────────────────────
switch ($Action) {

    'discover' {
        $servers = Invoke-Robot -Path '/server'
        $match = $servers | Where-Object { $_.server.server_number -eq $ServerNumber }
        if (-not $match) { Fail "Server #$ServerNumber not found in this account." }
        $s = $match.server
        [pscustomobject]@{
            ServerNumber = $s.server_number
            ServerIp     = $s.server_ip
            ServerName   = $s.server_name
            Product      = $s.product
            Dc           = $s.dc
            Status       = $s.status
            PaidUntil    = $s.paid_until
        } | Format-List
    }

    'rescue' {
        if ($ServerNumber -notin $ALLOWED_SERVERS) {
            Fail "Refusing rescue on #$ServerNumber — only $($ALLOWED_SERVERS -join ',') whitelisted."
        }
        if (-not $Confirm) {
            Write-Host "[dry-run] Would POST /boot/$ServerNumber/rescue with os=linux arch=64."
            Write-Host "         Re-run with -Confirm to execute."
            return
        }
        $r = Invoke-Robot -Path "/boot/$ServerNumber/rescue" -Method POST -Form @{ os = 'linux'; arch = '64' }
        Write-Host "Rescue armed. Reboot the server to enter rescue mode."
        Write-Host "Rescue root password: $($r.rescue.password)"
        Write-Host "Authorized keys:       $($r.rescue.authorized_key.Count) configured"
    }

    'installimage' {
        if ($ServerNumber -notin $ALLOWED_SERVERS) {
            Fail "Refusing installimage on #$ServerNumber — only $($ALLOWED_SERVERS -join ',') whitelisted."
        }
        if (-not $Confirm) {
            Write-Host "[dry-run] Would arm rescue, then SSH into rescue and run installimage with"
            Write-Host "         Ubuntu 24.04 autosetup. Re-run with -Confirm to execute."
            return
        }
        Write-Host "installimage drive-from-rescue is multi-step; see docs/doable-hetzner-recipe.md."
        Write-Host "This script only arms rescue. SSH into rescue and run the recipe's installimage block."
    }

    'reset' {
        if ($ServerNumber -notin $ALLOWED_SERVERS) {
            Fail "Refusing reset on #$ServerNumber — only $($ALLOWED_SERVERS -join ',') whitelisted."
        }
        if (-not $Confirm) {
            Write-Host "[dry-run] Would POST /reset/$ServerNumber type=hw. Re-run with -Confirm to execute."
            return
        }
        Invoke-Robot -Path "/reset/$ServerNumber" -Method POST -Form @{ type = 'hw' } | Out-Null
        Write-Host "Hardware reset issued for #$ServerNumber."
    }
}
