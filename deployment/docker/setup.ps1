#Requires -Version 5.1
<#
.SYNOPSIS
    Doable self-hosting setup for native Windows (no WSL, no Git Bash).

.DESCRIPTION
    Pure-PowerShell parallel to deployment/docker/setup.sh. Sets up the
    Doable docker stack on Windows using Docker Desktop as the docker
    daemon. Caddy runs in-stack and terminates TLS -- no host-side nginx,
    certbot, or systemd needed.

    Three deployment modes (same as setup.sh):
      1. -Domain app.example.com   public domain with Let's Encrypt SSL
      2. -DoableHost 192.168.1.50  private network IP/hostname, self-signed
      3. neither                   localhost with self-signed SSL

    For localhost / host mode the script downloads mkcert.exe and installs
    a local CA into the Windows root store so Chrome/Edge/Firefox trust
    the self-signed cert with no warning.

.PARAMETER Domain
    Public domain -- uses Let's Encrypt for SSL via Caddy ACME.

.PARAMETER DoableHost
    IP or hostname for private-network install -- self-signed SSL.
    (Named DoableHost to avoid colliding with PowerShell's $Host
    automatic variable.)

.PARAMETER Email
    Email address for Let's Encrypt registration (optional but recommended
    in domain mode for renewal notifications).

.PARAMETER SkipSsl
    Behind Cloudflare Tunnel / reverse proxy: Caddy uses internal
    self-signed AND binds 127.0.0.1 only. Same effect as
    $env:DOABLE_BEHIND_PROXY = '1'.

.PARAMETER Prebuilt
    Pull pre-built images from ghcr.io (~30s) instead of source build
    (~5-10min). Same effect as $env:DOABLE_PREBUILT = 'true'.

.PARAMETER InstallTrust
    In HOST mode, force-install the mkcert CA into Windows' trust store.
    Default in HOST mode is to skip because the browser is usually on a
    different machine. localhost mode always installs trust.

.EXAMPLE
    .\deployment\docker\setup.ps1
    # Localhost install -- Caddy uses mkcert, opens https://localhost

.EXAMPLE
    .\deployment\docker\setup.ps1 -Domain app.example.com
    # Public domain install -- Caddy auto-fetches Let's Encrypt cert

.EXAMPLE
    .\deployment\docker\setup.ps1 -DoableHost 192.168.1.50 -InstallTrust
    # Private-network install on this machine; install trust because
    # the browser is local too.

.EXAMPLE
    .\deployment\docker\setup.ps1 -Prebuilt -SkipSsl -Domain app.example.com
    # Production install behind Cloudflare Tunnel using pre-built images.

.NOTES
    Requires Docker Desktop for Windows. PowerShell 5.1 (built into
    Windows 10/11) is sufficient -- no pwsh 7+ needed.
#>
[CmdletBinding()]
param(
    [string]$Domain = $env:DOMAIN,
    [string]$DoableHost = $env:HOST,
    [string]$Email = $env:EMAIL,
    [switch]$SkipSsl,
    [switch]$Prebuilt,
    [switch]$InstallTrust
)

# Native commands (docker, mkcert) write progress + success notices to
# stderr, which PowerShell promotes to terminating errors under
# `Stop` whenever a `2>&1` pipeline is in play. Keep the global at
# Continue and rely on the explicit `$LASTEXITCODE` / try-catch
# patterns below for failure handling (mirrors the `set -e` discipline
# in setup.sh — failures are caught at their call site, not globally).
$ErrorActionPreference = 'Continue'

# --- Logging helpers -------------------------------------------------------
function Write-Info { param([string]$Msg) Write-Host "[info]  " -NoNewline -ForegroundColor Blue;  Write-Host $Msg }
function Write-Ok   { param([string]$Msg) Write-Host "[ok]    " -NoNewline -ForegroundColor Green; Write-Host $Msg }
function Write-WarnMsg { param([string]$Msg) Write-Host "[warn]  " -NoNewline -ForegroundColor Yellow; Write-Host $Msg }
function Write-ErrMsg  { param([string]$Msg) Write-Host "[error] " -NoNewline -ForegroundColor Red; Write-Host $Msg }

# --- Paths -----------------------------------------------------------------
$ScriptDir  = $PSScriptRoot
$ProjectDir = Split-Path $ScriptDir -Parent
$EnvFile    = Join-Path $ScriptDir '.env'
$CertsDir   = Join-Path $ScriptDir 'certs'
$UsePrebuilt = $Prebuilt.IsPresent -or ($env:DOABLE_PREBUILT -eq 'true')
$ComposeFile = if ($UsePrebuilt) {
    Join-Path $ScriptDir 'docker-compose.prod.yml'
} else {
    Join-Path $ScriptDir 'docker-compose.yml'
}

# Docker on Windows wants forward slashes in -f / --env-file args
$ComposeFileFwd = $ComposeFile -replace '\\', '/'
$EnvFileFwd     = $EnvFile     -replace '\\', '/'

Write-Info "Detected OS family: windows-native (PowerShell $($PSVersionTable.PSVersion))"

# --- Docker check ----------------------------------------------------------
Write-Info "Checking prerequisites..."
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-ErrMsg "Docker is not installed. Install Docker Desktop for Windows: https://docs.docker.com/desktop/install/windows-install/"
    exit 1
}
try {
    & docker compose version *> $null
    if ($LASTEXITCODE -ne 0) { throw "compose plugin not found" }
} catch {
    Write-ErrMsg "docker compose plugin not available. Update Docker Desktop (4.0+ ships compose v2 built-in)."
    exit 1
}
Write-Ok "Docker and Docker Compose found"

# --- Disk-space precheck ---------------------------------------------------
# Same intent as setup.sh: 25 GB minimum for source build, 5 GB for prebuilt
# (image pull only). On Windows, Get-PSDrive gives free space natively
# without needing df.
try {
    $drive = (Get-Item $ProjectDir).PSDrive
    $availGB = [int]([math]::Floor($drive.Free / 1GB))
    $minGB = if ($ComposeFile -match 'docker-compose\.prod\.yml') { 5 } else { 25 }
    if ($availGB -lt $minGB) {
        Write-ErrMsg "Only $availGB GB free on $($drive.Root) -- Doable needs at least $minGB GB."
        if ($minGB -eq 25) {
            Write-ErrMsg "Source builds peak around 22 GB; free disk (docker system prune -a) or re-run with -Prebuilt once ghcr images are public."
        }
        Write-ErrMsg "Override with `$env:DOABLE_SKIP_DISK_CHECK = '1' if you know what you're doing."
        if ($env:DOABLE_SKIP_DISK_CHECK -ne '1') { exit 1 }
    } else {
        Write-Ok "Disk space: $availGB GB free on $($drive.Root) (need >= $minGB GB)"
    }
} catch {
    Write-WarnMsg "Could not determine free disk space ($($_.Exception.Message)) -- skipping disk-space precheck."
}

# --- Mode determination ----------------------------------------------------
$Mode = ''
$ListenHost = ''
$HostExplicit = $false

if ($Domain) {
    $Mode = 'domain'; $ListenHost = $Domain; $HostExplicit = $true
    Write-Info "Domain mode -- Let's Encrypt SSL for $Domain"
} elseif ($DoableHost) {
    $Mode = 'host'; $ListenHost = $DoableHost; $HostExplicit = $true
    Write-Info "Private network mode -- self-signed SSL for $DoableHost"
} elseif ([System.Console]::IsInputRedirected -or $env:DOABLE_AUTO_LOCALHOST -eq '1') {
    # Non-interactive stdin (piped install, CI) -- default to localhost.
    $Mode = 'localhost'; $ListenHost = 'localhost'
    Write-Info "Non-interactive stdin (or DOABLE_AUTO_LOCALHOST=1) -- defaulting to localhost mode"
} else {
    Write-Host ""
    Write-Host "No -Domain or -DoableHost specified."
    Write-Host "  -Domain app.example.com  -> public domain with Let's Encrypt"
    Write-Host "  -DoableHost 192.168.1.50 -> private network with self-signed SSL"
    Write-Host ""
    $userInput = Read-Host "Enter domain, IP, or press Enter for localhost"
    if (-not $userInput) {
        $Mode = 'localhost'; $ListenHost = 'localhost'
        Write-Info "Localhost mode -- self-signed SSL on localhost"
    } elseif ($userInput -match '^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$') {
        $Mode = 'host'; $ListenHost = $userInput; $HostExplicit = $true
        Write-Info "Private network mode -- self-signed SSL for $ListenHost"
    } else {
        $Mode = 'domain'; $ListenHost = $userInput; $Domain = $userInput; $HostExplicit = $true
        Write-Info "Domain mode -- Let's Encrypt SSL for $ListenHost"
    }
}

# --- URLs ------------------------------------------------------------------
$ApiUrl = "https://${ListenHost}/api"
$WsUrl  = "wss://${ListenHost}/ws"
$AppUrl = "https://${ListenHost}"
$Cors   = "https://${ListenHost}"

# --- Secret generators (Windows .NET RNG; no openssl needed) --------------
function New-RandomHex {
    param([int]$Bytes)
    $buf = New-Object byte[] $Bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buf)
    -join ($buf | ForEach-Object { '{0:x2}' -f $_ })
}
function New-RandomBase64 {
    param([int]$Bytes)
    $buf = New-Object byte[] $Bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buf)
    [Convert]::ToBase64String($buf)
}

# --- ACL helper (chmod 600 equivalent on Windows) -------------------------
function Set-OwnerOnlyAcl {
    param([string]$Path)
    try {
        $acl = Get-Acl $Path
        $acl.SetAccessRuleProtection($true, $false)
        foreach ($rule in @($acl.Access)) { [void]$acl.RemoveAccessRule($rule) }
        $owner = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
        $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
            $owner, 'FullControl', 'None', 'None', 'Allow'
        )
        $acl.AddAccessRule($rule)
        Set-Acl -Path $Path -AclObject $acl
    } catch {
        Write-WarnMsg "Could not tighten ACL on $Path ($($_.Exception.Message)); secrets are readable by other Windows users on this machine."
    }
}

# --- Generate .env ---------------------------------------------------------
if (Test-Path $EnvFile) {
    Write-WarnMsg ".env already exists at $EnvFile"
    if ([System.Console]::IsInputRedirected -or $env:DOABLE_KEEP_ENV -eq '1') {
        Write-Info "Keeping existing .env (non-interactive or DOABLE_KEEP_ENV=1)"
    } else {
        $overwrite = Read-Host "Overwrite? [y/N]"
        if ($overwrite -match '^[Yy]') {
            Remove-Item -Path $EnvFile -Force
        } else {
            Write-Info "Keeping existing .env"
        }
    }
}

# Auto-rewrite stale URLs on DOMAIN change (mirrors setup.sh behaviour).
if ((Test-Path $EnvFile) -and $HostExplicit -and ($env:DOABLE_KEEP_ENV -ne '1')) {
    $existingAppUrl = (Get-Content $EnvFile -ErrorAction SilentlyContinue |
        Where-Object { $_ -match '^NEXT_PUBLIC_APP_URL=' } | Select-Object -First 1)
    $existingAppUrl = if ($existingAppUrl) { $existingAppUrl -replace '^NEXT_PUBLIC_APP_URL=', '' } else { '' }
    if ($existingAppUrl -and $existingAppUrl -ne $AppUrl) {
        Write-Info "Detected DOMAIN change: $existingAppUrl -> $AppUrl. Rewriting NEXT_PUBLIC_* + CORS_ORIGINS in place..."
        $bakFile = "${EnvFile}.bak.$(Get-Date -UFormat '%Y%m%d-%H%M%S')"
        Copy-Item -Path $EnvFile -Destination $bakFile -Force
        $rewritten = Get-Content $EnvFile | ForEach-Object {
            switch -Regex ($_) {
                '^NEXT_PUBLIC_API_URL='  { "NEXT_PUBLIC_API_URL=$ApiUrl";  break }
                '^NEXT_PUBLIC_WS_URL='   { "NEXT_PUBLIC_WS_URL=$WsUrl";    break }
                '^NEXT_PUBLIC_APP_URL='  { "NEXT_PUBLIC_APP_URL=$AppUrl";  break }
                '^CORS_ORIGINS='         { "CORS_ORIGINS=$Cors";           break }
                '^WS_ALLOWED_ORIGINS='   { "WS_ALLOWED_ORIGINS=$Cors";     break }
                default                  { $_ }
            }
        }
        Set-Content -Path $EnvFile -Value $rewritten -Encoding UTF8
        Set-OwnerOnlyAcl -Path $EnvFile
        Write-Ok "Rewrote URL lines in $EnvFile (backup: $bakFile)"
    }
}

if (-not (Test-Path $EnvFile)) {
    # Fresh .env -> fresh secrets. If a postgres_data volume already exists
    # from a previous install, its password won't match the new .env. Same
    # auth-mismatch trap setup.sh closes by wiping the volume.
    $stale = (docker volume ls -q 2>$null) -split "`n" | Where-Object { $_ -match '_postgres_data$' }
    if ($stale) {
        Write-WarnMsg "Pre-existing postgres_data volume detected -- wiping to avoid auth mismatch."
        docker compose -f $ComposeFileFwd down -v *> $null
        foreach ($v in ((docker volume ls -q 2>$null) -split "`n" |
                Where-Object { $_ -match '_(postgres_data|api_projects|api_thumbnails|ws_projects)$' })) {
            docker volume rm -f $v *> $null
        }
        Write-Ok "Cleared previous-install volumes"
    }

    Write-Info "Generating deployment/docker/.env with random secrets..."

    $jwt        = New-RandomHex 32
    $encKey     = New-RandomHex 32
    $intSecret  = New-RandomHex 32
    $pgPass     = New-RandomHex 16
    $appPass    = New-RandomHex 16
    $bootToken  = New-RandomHex 32
    $kek        = New-RandomBase64 32
    $bootExp    = (Get-Date).ToUniversalTime().AddHours(24).ToString('yyyy-MM-ddTHH:mm:ssZ')
    $genStamp   = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

    $aiKeyNames = @(
        'ANTHROPIC_API_KEY','OPENAI_API_KEY','GEMINI_API_KEY','MINIMAX_API_KEY',
        'OPENROUTER_API_KEY','TOGETHER_API_KEY','FIREWORKS_API_KEY','OPENCODE_ZEN_API_KEY',
        'GROQ_API_KEY','CEREBRAS_API_KEY','DEEPSEEK_API_KEY','MISTRAL_API_KEY',
        'COHERE_API_KEY','XAI_API_KEY','PERPLEXITY_API_KEY','DEEPINFRA_API_KEY',
        'NVIDIA_API_KEY','MOONSHOT_API_KEY','ZHIPU_API_KEY'
    )
    $aiKeyLines = $aiKeyNames | ForEach-Object {
        $v = [System.Environment]::GetEnvironmentVariable($_)
        if (-not $v) { $v = '' }
        "$_=$v"
    }

    $envContent = @"
# Generated by setup.ps1 on $genStamp
# Host: $ListenHost

# --- Secrets -----------------
JWT_SECRET=$jwt
ENCRYPTION_KEY=$encKey
INTERNAL_SECRET=$intSecret
DOABLE_KEK=$kek

# --- First-run bootstrap (single-use; auto-closes after first signup) ---
INSTALL_BOOTSTRAP_TOKEN=$bootToken
INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT=$bootExp

# --- Database ----------------
POSTGRES_USER=doable
POSTGRES_PASSWORD=$pgPass
POSTGRES_DB=doable
DOABLE_APP_PASSWORD=$appPass

# --- Feature flags -----------
# Per-app database (PRD per-app-db): isolated per-app PGlite DB exposed via
# /__doable/data/* + the doable.data builtin MCP server. ON by default; set 0 to disable.
DOABLE_APP_DB_ENABLED=1
DOABLE_APP_AI_ENABLED=1

# --- URLs --------------------
NEXT_PUBLIC_API_URL=$ApiUrl
NEXT_PUBLIC_WS_URL=$WsUrl
NEXT_PUBLIC_APP_URL=$AppUrl
CORS_ORIGINS=$Cors
WS_ALLOWED_ORIGINS=$Cors

# --- Redis (optional) --------
REDIS_URL=

# --- AI providers (BYOK) -----
$($aiKeyLines -join "`n")

# --- OAuth (optional) --------
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# --- Stripe (optional) -------
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
"@

    Set-Content -Path $EnvFile -Value $envContent -Encoding UTF8
    Set-OwnerOnlyAcl -Path $EnvFile
    Write-Ok "Created $EnvFile with generated secrets (owner-only ACL)"
}

# --- Back-fill DOABLE_KEK + DOABLE_APP_PASSWORD on older .env (idempotent) -
function Test-EnvHasValue {
    param([string]$Var)
    $line = Get-Content $EnvFile -ErrorAction SilentlyContinue |
        Where-Object { $_ -match "^${Var}=." } | Select-Object -First 1
    return [bool]$line
}
function Set-EnvVarInFile {
    param([string]$Var, [string]$Value)
    $lines = Get-Content $EnvFile -ErrorAction SilentlyContinue
    if ($lines | Where-Object { $_ -match "^${Var}=" }) {
        $rewritten = $lines | ForEach-Object {
            if ($_ -match "^${Var}=") { "${Var}=$Value" } else { $_ }
        }
        Set-Content -Path $EnvFile -Value $rewritten -Encoding UTF8
    } else {
        Add-Content -Path $EnvFile -Value "${Var}=$Value"
    }
}

if ((Test-Path $EnvFile) -and -not (Test-EnvHasValue 'DOABLE_KEK')) {
    Set-EnvVarInFile 'DOABLE_KEK' (New-RandomBase64 32)
    Set-OwnerOnlyAcl -Path $EnvFile
    Write-Ok "Back-filled DOABLE_KEK in existing $EnvFile"
}
if ((Test-Path $EnvFile) -and -not (Test-EnvHasValue 'DOABLE_APP_PASSWORD')) {
    Set-EnvVarInFile 'DOABLE_APP_PASSWORD' (New-RandomHex 16)
    Set-OwnerOnlyAcl -Path $EnvFile
    Write-Ok "Back-filled DOABLE_APP_PASSWORD in existing $EnvFile"
    # Note: setup.sh also tries to ALTER ROLE on a live postgres container.
    # On Windows we skip that -- operator can run `docker compose down -v && setup.ps1`
    # if they hit auth mismatch on an upgrade.
}

# --- TLS / Caddy wiring ----------------------------------------------------
Write-Info "Setting up TLS for $ListenHost (Caddy in docker)..."
if (-not (Test-Path $CertsDir)) { New-Item -ItemType Directory -Path $CertsDir | Out-Null }

$DoableSite     = $ListenHost
$DoableBindAddr = '127.0.0.1'
$DoableTls      = 'internal'

switch ($Mode) {
    'domain' {
        if ($SkipSsl.IsPresent -or $env:DOABLE_BEHIND_PROXY -eq '1') {
            Write-Info "DOMAIN mode + behind-proxy: Caddy binds 127.0.0.1 (tunnel/CDN owns public ingress)"
            $DoableBindAddr = '127.0.0.1'
            $DoableTls = 'internal'
        } else {
            Write-Info "DOMAIN mode: Caddy binds 0.0.0.0 + auto-fetches Let's Encrypt cert for $ListenHost"
            $DoableBindAddr = '0.0.0.0'
            $DoableTls = if ($Email) { $Email } else { 'internal' }
            if (-not $Email) {
                Write-WarnMsg "Email not set -- Caddy ACME will register without a contact address."
                Write-WarnMsg "  Re-run with -Email you@example.com for renewal notifications."
            }
        }
    }
    { $_ -in 'host','localhost' } {
        $DoableBindAddr = '127.0.0.1'
        $DoableTls = '/certs/cert.pem /certs/key.pem'

        $wantTrust = $false
        if ($Mode -eq 'localhost') {
            $wantTrust = $true
        } elseif ($Mode -eq 'host') {
            if ($InstallTrust.IsPresent -or $env:DOABLE_INSTALL_TRUST -eq '1') { $wantTrust = $true }
        }

        $mkcertCmd = Get-Command mkcert -ErrorAction SilentlyContinue
        $mkcertExe = if ($mkcertCmd) { $mkcertCmd.Source } else { $null }

        if (-not $mkcertExe -and $wantTrust) {
            $arch = if ([Environment]::Is64BitOperatingSystem) {
                if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq 'Arm64') { 'arm64' } else { 'amd64' }
            } else { 'amd64' }
            $mkcertUrl = "https://github.com/FiloSottile/mkcert/releases/latest/download/mkcert-v1.4.4-windows-$arch.exe"
            $localBin = Join-Path $env:LOCALAPPDATA 'doable\bin'
            if (-not (Test-Path $localBin)) { New-Item -ItemType Directory -Path $localBin -Force | Out-Null }
            $mkcertExe = Join-Path $localBin 'mkcert.exe'
            Write-Info "Downloading mkcert (one-time, $(Split-Path -Leaf $mkcertUrl))..."
            try {
                # ProgressPreference SilentlyContinue makes Invoke-WebRequest 20x faster
                # on large downloads -- the default progress bar is unreasonably slow.
                $prevProgress = $ProgressPreference
                $ProgressPreference = 'SilentlyContinue'
                Invoke-WebRequest -Uri $mkcertUrl -OutFile $mkcertExe -UseBasicParsing
                $ProgressPreference = $prevProgress
                $env:Path = "$localBin;$env:Path"
            } catch {
                Write-WarnMsg "mkcert download failed: $($_.Exception.Message)"
                $mkcertExe = $null
            }
        }

        if ($wantTrust -and $mkcertExe -and (Test-Path $mkcertExe)) {
            Write-Info "Installing mkcert local CA into Windows trust store..."
            # mkcert -install writes the CA into HKCU\...\Root for the current
            # user -- no admin required for the user store. Chrome 105+ needs
            # the ChromeRootStoreEnabled policy too; mkcert handles the
            # Firefox/NSS dance automatically if Firefox is installed.
            #
            # IMPORTANT: do NOT pipe mkcert's `2>&1` into a Where-Object filter.
            # PowerShell 5.1 buffers stderr from native exes and the pipeline
            # can hang indefinitely waiting for the next stderr line. Capture
            # to a log file instead and let the operator open it on failure.
            $mkcertLog = Join-Path $env:TEMP 'doable-mkcert-install.log'
            $mkcertProc = Start-Process -FilePath $mkcertExe -ArgumentList '-install' `
                -NoNewWindow -Wait -PassThru `
                -RedirectStandardOutput $mkcertLog -RedirectStandardError "$mkcertLog.err"
            if ($mkcertProc.ExitCode -ne 0) {
                Write-WarnMsg "mkcert -install exited with code $($mkcertProc.ExitCode). See $mkcertLog / $mkcertLog.err"
            } else {
                Get-Content $mkcertLog,"$mkcertLog.err" -ErrorAction SilentlyContinue |
                    Where-Object { $_ -match 'installed|CA|local' } |
                    ForEach-Object { Write-Host "  $_" }
            }

            Write-Info "Issuing browser-trusted cert for $ListenHost..."
            $certFile = Join-Path $CertsDir 'cert.pem'
            $keyFile  = Join-Path $CertsDir 'key.pem'
            # Build dedup'd SAN list -- always include the listen host plus the
            # localhost loopback names so the same cert keeps working when the
            # operator hits the box on 127.0.0.1 / ::1 directly.
            $sanList = New-Object System.Collections.Generic.List[string]
            foreach ($san in @($ListenHost, 'localhost', '127.0.0.1', '::1')) {
                if ($san -and -not $sanList.Contains($san)) { [void]$sanList.Add($san) }
            }
            # Same Start-Process pattern as -install above -- PowerShell 5.1's
            # 2>&1 pipeline buffering bites here too if we leave stderr on the
            # PS pipeline. Log to a file the operator can `cat` on failure.
            $leafLog = Join-Path $env:TEMP 'doable-mkcert-leaf.log'
            $leafArgs = @('-cert-file', $certFile, '-key-file', $keyFile) + $sanList.ToArray()
            $leafProc = Start-Process -FilePath $mkcertExe -ArgumentList $leafArgs `
                -NoNewWindow -Wait -PassThru `
                -RedirectStandardOutput $leafLog -RedirectStandardError "$leafLog.err"
            if ((Test-Path $certFile) -and (Test-Path $keyFile) -and $leafProc.ExitCode -eq 0) {
                Write-Ok "Browser-trusted cert ready at $certFile"
            } else {
                Write-WarnMsg "mkcert leaf-cert generation failed (exit=$($leafProc.ExitCode)) -- Caddy will use internal self-signed"
                Get-Content $leafLog,"$leafLog.err" -ErrorAction SilentlyContinue |
                    ForEach-Object { Write-Host "  $_" }
                $DoableTls = 'internal'
            }
        } elseif ($wantTrust) {
            Write-Info "mkcert unavailable -- Caddy will use internal self-signed (browser warning expected once)"
            $DoableTls = 'internal'
        } else {
            Write-Info "HOST mode without -InstallTrust: Caddy will use internal self-signed."
            Write-Info "  Browser will show a one-time warning. Re-run with -InstallTrust if the server is also the browser machine."
            $DoableTls = 'internal'
        }
    }
}

# Persist Caddy env vars to .env
Set-EnvVarInFile 'DOABLE_SITE'      $DoableSite
Set-EnvVarInFile 'DOABLE_TLS'       $DoableTls
Set-EnvVarInFile 'DOABLE_BIND_ADDR' $DoableBindAddr
Set-OwnerOnlyAcl -Path $EnvFile

Write-Ok "Caddy TLS config persisted to .env (DOABLE_SITE=$DoableSite, BIND=$DoableBindAddr)"

# --- Build / pull and start ------------------------------------------------
Push-Location $ProjectDir
try {
    if ($ComposeFile -match 'docker-compose\.prod\.yml') {
        Write-Info "Pulling pre-built images from ghcr.io (tag: $(if ($env:DOABLE_IMAGE_TAG) { $env:DOABLE_IMAGE_TAG } else { 'latest' }))..."
        $pullLog = Join-Path $env:TEMP 'doable-pull.log'
        & docker compose -f $ComposeFileFwd pull 2>&1 | Tee-Object -FilePath $pullLog
        if ($LASTEXITCODE -ne 0) {
            $pullText = Get-Content $pullLog -Raw -ErrorAction SilentlyContinue
            if ($pullText -match '(?i)denied|unauthorized|not found|private') {
                Write-WarnMsg "ghcr.io images not publicly accessible yet (registry denied)."
                Write-WarnMsg "Falling back to source build (~5-10 minutes)..."
                $ComposeFile = Join-Path $ScriptDir 'docker-compose.yml'
                $ComposeFileFwd = $ComposeFile -replace '\\', '/'
                Write-Info "Building Docker images from source..."
                & docker compose -f $ComposeFileFwd build
                if ($LASTEXITCODE -ne 0) { Write-ErrMsg "docker compose build failed."; exit 1 }
            } else {
                Write-ErrMsg "docker compose pull failed. See output above."
                exit 1
            }
        }
    } else {
        Write-Info "Building Docker images from source (this takes ~5-10 minutes)..."
        & docker compose -f $ComposeFileFwd build
        if ($LASTEXITCODE -ne 0) { Write-ErrMsg "docker compose build failed."; exit 1 }
    }

    Write-Info "Starting containers..."
    & docker compose -f $ComposeFileFwd up -d
    if ($LASTEXITCODE -ne 0) { Write-ErrMsg "docker compose up failed."; exit 1 }
} finally {
    Pop-Location
}

# --- Migrate completion watchdog -------------------------------------------
# One-shot migrate container exits before api/ws/web become ready. If it
# fails (typically stale postgres_data volume with mismatched password),
# api/ws never start. Wait up to 60s and surface a clear recovery command.
Write-Info "Waiting for migrate container to complete..."
$migrateExit = '?'
for ($i = 1; $i -le 30; $i++) {
    $state = (& docker inspect doable-migrate --format '{{.State.Status}}' 2>$null) -as [string]
    if ($state -eq 'exited') {
        $migrateExit = (& docker inspect doable-migrate --format '{{.State.ExitCode}}' 2>$null) -as [string]
        break
    }
    Start-Sleep -Seconds 2
}

if ($migrateExit -ne '0' -and $migrateExit -ne '?') {
    Write-Host ""
    Write-ErrMsg "Migration container exited with code $migrateExit -- install is broken."
    Write-ErrMsg "Most common cause: stale postgres_data volume from a prior install with a"
    Write-ErrMsg "different .env (POSTGRES_PASSWORD mismatch). Postgres skipped re-init because"
    Write-ErrMsg "the data directory wasn't empty."
    Write-ErrMsg ""
    Write-ErrMsg "Recover with:"
    Write-ErrMsg "  docker compose -f $ComposeFileFwd --env-file $EnvFileFwd down -v"
    Write-ErrMsg "  docker compose -f $ComposeFileFwd --env-file $EnvFileFwd up -d"
    Write-ErrMsg ""
    Write-ErrMsg "Migrate logs (last 15 lines):"
    (& docker logs doable-migrate 2>&1) | Select-Object -Last 15 | ForEach-Object { Write-Host "  $_" }
    exit 1
}
Write-Ok "Migrations applied"

# --- Success banner --------------------------------------------------------
# Re-read the active bootstrap token in case the operator kept an existing .env.
$activeBootToken = ''
$bootLine = Get-Content $EnvFile | Where-Object { $_ -match '^INSTALL_BOOTSTRAP_TOKEN=.' } | Select-Object -First 1
if ($bootLine) { $activeBootToken = $bootLine -replace '^INSTALL_BOOTSTRAP_TOKEN=', '' }

Write-Host ""
Write-Host "=========================================================================="
Write-Host "Doable is running at $AppUrl" -ForegroundColor Green
Write-Host "=========================================================================="
Write-Host ""
Write-Host "  What to do next:"
Write-Host ""
Write-Host "    1. Open $AppUrl/signup in your browser."
Write-Host "       The FIRST account to sign up becomes the platform owner"
Write-Host "       automatically -- no SSH, no SQL, no .env editing required."
Write-Host ""
Write-Host "    2. You'll be guided through a 4-step setup wizard at /setup:"
Write-Host "       Welcome -> AI provider -> Google/GitHub sign-in -> Plans & Billing."
Write-Host ""
Write-Host "       AI provider step covers 50+ providers including OpenAI, Anthropic,"
Write-Host "       Gemini, OpenRouter, Together, Fireworks, Groq, Cerebras, DeepSeek,"
Write-Host "       Mistral, Cohere, xAI, Perplexity, MiniMax, Moonshot, Zhipu, plus"
Write-Host "       Azure/Bedrock/Vertex AND local OpenAI-compatible servers"
Write-Host "       (Ollama, LM Studio, vLLM, llama.cpp, Jan, LocalAI, ...)."
Write-Host ""
Write-Host "       Tip: pre-set any of these env vars before running setup.ps1 and"
Write-Host "       the wizard's AI step starts pre-configured (first non-empty wins):"
Write-Host "         ANTHROPIC_API_KEY  OPENAI_API_KEY    GEMINI_API_KEY"
Write-Host "         MINIMAX_API_KEY    OPENROUTER_API_KEY  TOGETHER_API_KEY"
Write-Host "         FIREWORKS_API_KEY  GROQ_API_KEY      DEEPSEEK_API_KEY"
Write-Host "         MISTRAL_API_KEY    COHERE_API_KEY    XAI_API_KEY"
Write-Host "         PERPLEXITY_API_KEY DEEPINFRA_API_KEY NVIDIA_API_KEY"
Write-Host "         MOONSHOT_API_KEY   ZHIPU_API_KEY     OPENCODE_ZEN_API_KEY"
Write-Host ""
if ($Mode -ne 'domain') {
    Write-Host "  Note: Self-signed SSL -- Chrome 105+ on Windows reads the OS root store" -ForegroundColor Yellow
    Write-Host "        only if ChromeRootStoreEnabled=0 is set. If mkcert ran the trust" -ForegroundColor Yellow
    Write-Host "        install above, restart Chrome once and the cert is trusted." -ForegroundColor Yellow
    Write-Host ""
}
if ($activeBootToken) {
    Write-Host "  Bootstrap token (only needed if signup is delayed past 24h or you need"
    Write-Host "  to force-promote -- kept private, single-use, server-side enforced):"
    Write-Host ""
    Write-Host "      $activeBootToken"
    Write-Host ""
}
Write-Host "  OAuth callback URLs to register in each provider's dashboard (when you"
Write-Host "  reach Step 3 of the setup wizard):"
Write-Host ""
Write-Host "    Google login:  $ApiUrl/auth/google/callback"
Write-Host "    GitHub login:  $ApiUrl/auth/github/callback"
Write-Host "    GitHub repo:   $ApiUrl/auth/github/repo/callback"
Write-Host ""
Write-Host "  Useful commands (PowerShell):"
Write-Host "    View logs:   docker compose -f $ComposeFileFwd logs -f"
Write-Host "    Stop:        docker compose -f $ComposeFileFwd down"
Write-Host "    Restart:     docker compose -f $ComposeFileFwd restart"
Write-Host "    Edit config: notepad $EnvFile  (or your editor of choice)"
Write-Host "=========================================================================="
