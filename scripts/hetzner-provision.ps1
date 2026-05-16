<#
.SYNOPSIS
    Provision / re-image / reset the Hetzner test box for Doable OOB validation.

.DESCRIPTION
    Wraps the Hetzner Robot REST API (https://robot-ws.your-server.de) for the
    three actions our test-recipe uses: discover the server's IP, arm Linux
    rescue mode with our SSH key fingerprint, and hardware-reset the box so
    rescue actually boots.

    SAFETY: This script is HARD-WHITELISTED to a single Hetzner server number.
    Any other -ServerNumber value is rejected, even with -Confirm. Edit the
    $ALLOWED_SERVERS constant below if you add a second test box.

.PARAMETER Action
    One of:
        discover  - GET /server/<id>  -> prints IP, DC, status, paid-until
        rescue    - POST /boot/<id>/rescue with our SSH key fingerprint(s)
        reset     - POST /reset/<id>  (hardware reset, type=hw)

.PARAMETER ServerNumber
    Hetzner Robot server number. Must be in $ALLOWED_SERVERS.

.PARAMETER Confirm
    Required for rescue and reset. discover does not require it.

.PARAMETER KeyFingerprint
    For rescue: MD5 SSH key fingerprint (e.g. "a8:f0:c6:...:9e") to inject
    into the rescue env. May be passed multiple times. If omitted, defaults
    to the fingerprint of ~/Documents/itdept.pub when present.

.PARAMETER NoPoll
    Skip the post-action polling step. By default, rescue waits for
    rescue.active=true to be visible on a follow-up GET, and reset polls
    for port 22 to drop+come back.

.PARAMETER PollTimeoutSeconds
    Default 300. How long to wait for rescue/reset state to settle.

.EXAMPLE
    # Discover where the server is on the public internet
    .\scripts\hetzner-provision.ps1 -Action discover -ServerNumber 2987905

.EXAMPLE
    # Arm rescue with the itdept key (default), then hardware-reset
    .\scripts\hetzner-provision.ps1 -Action rescue -ServerNumber 2987905 -Confirm
    .\scripts\hetzner-provision.ps1 -Action reset  -ServerNumber 2987905 -Confirm

.NOTES
    Credentials: reads $env:HETZNER_ROBOT_USER and $env:HETZNER_ROBOT_PASS.
    The username starts with '#' (e.g. '#ws+SdWgWZ7P') — keep it quoted in
    your shell so PowerShell doesn't interpret '#' as a comment marker.
    Both env vars must be set; the script refuses to prompt for credentials.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)] [ValidateSet('discover', 'rescue', 'reset')]
    [string] $Action,

    [Parameter(Mandatory)]
    [int] $ServerNumber,

    [switch] $Confirm,

    [string[]] $KeyFingerprint,

    [switch] $NoPoll,

    [int] $PollTimeoutSeconds = 300
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ─── Safety whitelist ────────────────────────────────────────────────────────
# Any server number not in this list is rejected. This is the ONLY thing
# preventing an `-Action reset` from rebooting production by accident.
$ALLOWED_SERVERS = @(2987905)

if ($ServerNumber -notin $ALLOWED_SERVERS) {
    Write-Error "ServerNumber $ServerNumber is not in the safety whitelist ($($ALLOWED_SERVERS -join ', ')). Refusing to act."
    exit 2
}

# ─── Robot API config ────────────────────────────────────────────────────────
$RobotBase = 'https://robot-ws.your-server.de'

if (-not $env:HETZNER_ROBOT_USER -or -not $env:HETZNER_ROBOT_PASS) {
    Write-Error "HETZNER_ROBOT_USER and HETZNER_ROBOT_PASS must be set as environment variables. The username starts with '#' (e.g. '#ws+...') — keep it quoted in your shell."
    exit 2
}

$pair = "$($env:HETZNER_ROBOT_USER):$($env:HETZNER_ROBOT_PASS)"
$basic = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($pair))
$headers = @{ Authorization = "Basic $basic" }

function Invoke-Robot {
    param(
        [Parameter(Mandatory)] [string] $Method,
        [Parameter(Mandatory)] [string] $Path,
        [string] $Body
    )
    $uri = "$RobotBase$Path"
    $invokeArgs = @{
        Uri         = $uri
        Method      = $Method
        Headers     = $headers
        ErrorAction = 'Stop'
        UseBasicParsing = $true
    }
    if ($Body) {
        $invokeArgs.Body        = $Body
        $invokeArgs.ContentType = 'application/x-www-form-urlencoded'
    }
    try {
        $response = Invoke-WebRequest @invokeArgs
        if ($response.Content) {
            return ($response.Content | ConvertFrom-Json)
        }
        return $null
    }
    catch {
        $resp = $_.Exception.Response
        if ($resp) {
            $code = [int]$resp.StatusCode
            $body = ''
            try {
                $stream = $resp.GetResponseStream()
                $reader = New-Object IO.StreamReader($stream)
                $body = $reader.ReadToEnd()
            } catch {}
            Write-Error "Robot API $Method $Path failed with HTTP $code. Body: $body"
        } else {
            Write-Error "Robot API $Method $Path failed: $($_.Exception.Message)"
        }
        exit 3
    }
}

# ─── Helpers ─────────────────────────────────────────────────────────────────
function Get-DefaultFingerprint {
    $pubKey = Join-Path $HOME 'Documents\itdept.pub'
    if (-not (Test-Path $pubKey)) {
        return $null
    }
    # ssh-keygen -E md5 -l -f <pub> -> "2048 MD5:a8:f0:c6:... comment (RSA)"
    $sshKeygen = Get-Command 'ssh-keygen' -ErrorAction SilentlyContinue
    if (-not $sshKeygen) {
        Write-Warning "ssh-keygen not on PATH; can't auto-derive fingerprint from $pubKey. Pass -KeyFingerprint explicitly."
        return $null
    }
    $line = & ssh-keygen -E md5 -l -f $pubKey 2>$null
    if (-not $line) { return $null }
    $token = ($line -split '\s+')[1]   # "MD5:a8:f0:..."
    return ($token -replace '^MD5:', '')
}

function Wait-For-Port {
    param(
        [Parameter(Mandatory)] [string] $ServerIp,
        [Parameter(Mandatory)] [int]    $Port,
        [Parameter(Mandatory)] [ValidateSet('up', 'down')] [string] $State,
        [int] $TimeoutSeconds = 300
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $reachable = Test-NetConnection -ComputerName $ServerIp -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue
        if (($State -eq 'up'   -and $reachable) -or
            ($State -eq 'down' -and -not $reachable)) {
            return $true
        }
        Start-Sleep -Seconds 5
    }
    return $false
}

function Get-ServerIp {
    param([int] $Id)
    $resp = Invoke-Robot -Method GET -Path "/server/$Id"
    if (-not $resp -or -not $resp.server) {
        Write-Error "Could not resolve server #$Id via Robot API."
        exit 3
    }
    return $resp.server
}

# ─── Actions ─────────────────────────────────────────────────────────────────
switch ($Action) {

    'discover' {
        $s = Get-ServerIp -Id $ServerNumber
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
        if (-not $Confirm) {
            Write-Error "rescue is destructive (re-images the box on next reset). Re-run with -Confirm."
            exit 4
        }

        # Resolve fingerprints: explicit > itdept.pub default
        if (-not $KeyFingerprint -or $KeyFingerprint.Count -eq 0) {
            $fp = Get-DefaultFingerprint
            if (-not $fp) {
                Write-Error "No -KeyFingerprint passed and could not derive one from ~\Documents\itdept.pub. Aborting rather than arming rescue with only the one-time password."
                exit 4
            }
            $KeyFingerprint = @($fp)
            Write-Host "Using default fingerprint from itdept.pub: $fp" -ForegroundColor DarkGray
        }

        # Body: os=linux&arch=64&authorized_key[]=<fp1>&authorized_key[]=<fp2>...
        $parts = @('os=linux', 'arch=64')
        foreach ($k in $KeyFingerprint) {
            $parts += "authorized_key%5B%5D=$([uri]::EscapeDataString($k))"
        }
        $body = $parts -join '&'

        Write-Host "Arming Linux rescue for server #$ServerNumber with $($KeyFingerprint.Count) key(s)..." -ForegroundColor Cyan
        $resp = Invoke-Robot -Method POST -Path "/boot/$ServerNumber/rescue" -Body $body
        if ($resp -and $resp.rescue) {
            Write-Host ("OK. rescue.active={0}; authorized_keys count={1}." -f `
                $resp.rescue.active, ($resp.rescue.authorized_key | Measure-Object).Count) -ForegroundColor Green
        }

        if (-not $NoPoll) {
            # Confirm via GET that rescue.active=True before declaring success
            $check = Invoke-Robot -Method GET -Path "/boot/$ServerNumber"
            if (-not $check.boot.rescue.active) {
                Write-Warning "Rescue was armed but GET /boot/$ServerNumber reports rescue.active=False. Re-arm before resetting."
                exit 5
            }
            Write-Host "Confirmed rescue.active=True. Next: -Action reset -Confirm." -ForegroundColor Green
        }
    }

    'reset' {
        if (-not $Confirm) {
            Write-Error "reset is destructive (hardware-reboots the box). Re-run with -Confirm."
            exit 4
        }

        $server = Get-ServerIp -Id $ServerNumber
        $ip = $server.server_ip
        Write-Host "Hardware-resetting server #$ServerNumber ($ip)..." -ForegroundColor Cyan

        Invoke-Robot -Method POST -Path "/reset/$ServerNumber" -Body 'type=hw' | Out-Null
        Write-Host "Reset issued." -ForegroundColor Green

        if (-not $NoPoll) {
            Write-Host "Waiting for port 22 to drop (confirms the box actually rebooted)..." -ForegroundColor DarkGray
            $went_down = Wait-For-Port -ServerIp $ip -Port 22 -State down -TimeoutSeconds 120
            if (-not $went_down) {
                Write-Warning "Port 22 never went down within 120s — the reset may not have fired. Check Hetzner KVM console."
            } else {
                Write-Host "Port 22 dropped. Waiting for SSH to come back up..." -ForegroundColor DarkGray
            }
            $came_back = Wait-For-Port -ServerIp $ip -Port 22 -State up -TimeoutSeconds $PollTimeoutSeconds
            if ($came_back) {
                Write-Host "Server is reachable on port 22 again. SSH in to confirm hostname=rescue." -ForegroundColor Green
            } else {
                Write-Warning "Port 22 didn't come back within $PollTimeoutSeconds s. The server may still be booting; retry SSH manually."
                exit 5
            }
        }
    }
}
