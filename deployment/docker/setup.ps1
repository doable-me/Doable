#Requires -Version 5.1
# ==============================================================================
# Doable - Self-hosting setup script (Windows)
# ==============================================================================
# Sets up everything needed to run Doable with Docker Compose + nginx + SSL.
# nginx ALWAYS sits in front of services. Services NEVER bind to 0.0.0.0.
#
# Requirements:
#   - Windows 10/11 (64-bit)
#   - Docker Desktop for Windows (https://docs.docker.com/desktop/install/windows-install/)
#   - PowerShell 5.1+ (built-in) or PowerShell 7+ (recommended)
#   - Run this script from PowerShell as Administrator for nginx + SSL setup
#
# Usage:
#   # Public domain (Let's Encrypt SSL via win-acme):
#   $env:DOMAIN="app.example.com"; .\deployment\docker\setup.ps1
#
#   # Private network / LAN (self-signed SSL for an IP address):
#   $env:HOST_ADDR="192.168.1.50"; .\deployment\docker\setup.ps1
#
#   # Localhost only (self-signed SSL on localhost):
#   .\deployment\docker\setup.ps1
#
#   # Skip Let's Encrypt (e.g. behind Cloudflare proxy):
#   $env:DOMAIN="app.example.com"; .\deployment\docker\setup.ps1 --skip-ssl
#
# NOTE: $env:HOST is a reserved PowerShell automatic variable (the machine
#       hostname). Use $env:HOST_ADDR instead of $env:HOST on Windows.
# ==============================================================================

[CmdletBinding()]
param(
    [switch]$SkipSsl,
    [switch]$Prebuilt,
    [switch]$Help
)

Set-StrictMode -Version Latest
# Use Continue so that stderr output from native commands (e.g. Docker warnings)
# does not trigger a terminating error. Explicit exit codes are checked manually.
$ErrorActionPreference = 'Continue'

# --- Paths --------------------------------------------------------------------
$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
$EnvFile    = Join-Path $ScriptDir '.env'

# nginx on Windows (via Chocolatey or manual) lives here by default
$NginxDir        = 'C:\nginx'
$NginxConf       = Join-Path $NginxDir 'conf\nginx.conf'
$NginxSitesDir   = Join-Path $NginxDir 'conf\sites-enabled'
$SelfSignedDir   = Join-Path $env:APPDATA 'doable\ssl'

# Pre-built vs source-build compose file
if ($env:DOABLE_PREBUILT -eq 'true' -or $Prebuilt) {
    $ComposeFile = Join-Path $ScriptDir 'docker-compose.prod.yml'
} else {
    $ComposeFile = Join-Path $ScriptDir 'docker-compose.yml'
}

# --- Colour helpers -----------------------------------------------------------
function Write-Info  { param([string]$Msg) Write-Host "[info]  $Msg" -ForegroundColor Cyan }
function Write-Ok    { param([string]$Msg) Write-Host "[ok]    $Msg" -ForegroundColor Green }
function Write-Warn  { param([string]$Msg) Write-Host "[warn]  $Msg" -ForegroundColor Yellow }
function Write-Err   { param([string]$Msg) Write-Host "[error] $Msg" -ForegroundColor Red }

# --- Help ---------------------------------------------------------------------
if ($Help) {
    Write-Host @"
Usage: [set env vars] .\deployment\docker\setup.ps1 [-SkipSsl] [-Prebuilt]

Options:
  -SkipSsl    Set up nginx but skip Let's Encrypt (e.g. behind Cloudflare)
  -Prebuilt   Pull pre-built images from ghcr.io instead of building from source
              (~30s install vs ~5-10min build). Same as setting DOABLE_PREBUILT=true.

Environment variables (set with `$env:VAR = "value"` before running):
  DOMAIN          Your domain name - uses Let's Encrypt (win-acme) for SSL
  HOST_ADDR       IP or hostname for private network - self-signed SSL
  EMAIL           Email for Let's Encrypt notifications (optional)
  DOABLE_PREBUILT Set to 'true' to pull from ghcr.io (same as -Prebuilt)
  DOABLE_IMAGE_TAG Image tag to pull (default: latest; use v1.2.3 to pin)

If neither DOMAIN nor HOST_ADDR is set, defaults to localhost with self-signed SSL.
"@
    exit 0
}

# --- Admin check --------------------------------------------------------------
# nginx as a Windows service and writing to C:\nginx require elevation.
$currentPrincipal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Err "This script must be run as Administrator (right-click PowerShell -> Run as administrator)."
    exit 1
}

# --- Check prerequisites ------------------------------------------------------
Write-Info "Checking prerequisites..."

# Docker Desktop
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Err "Docker is not installed. Install Docker Desktop for Windows:"
    Write-Err "  https://docs.docker.com/desktop/install/windows-install/"
    exit 1
}

# Docker daemon running
$dockerInfoOutput = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Err "Docker daemon is not running. Please start Docker Desktop and try again."
    exit 1
}

# Docker Compose v2
$composeVersion = docker compose version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Err "Docker Compose v2 plugin not found. Make sure Docker Desktop is up to date."
    exit 1
}

$dockerVersion = (docker --version 2>&1) | Where-Object { $_ -notmatch '^WARNING' } | Select-Object -First 1
$composeVersionStr = $composeVersion | Where-Object { $_ -notmatch '^WARNING' } | Select-Object -First 1
Write-Ok "Docker $dockerVersion found"
Write-Ok "Docker Compose $composeVersionStr found"

# openssl - ships with Git for Windows and is in PATH when Git is installed
if (-not (Get-Command openssl -ErrorAction SilentlyContinue)) {
    Write-Err "openssl not found in PATH."
    Write-Err "Install Git for Windows (includes openssl): https://gitforwindows.org/"
    Write-Err "Or install OpenSSL directly: https://slproweb.com/products/Win32OpenSSL.html"
    exit 1
}
Write-Ok "openssl found"

# --- Determine mode -----------------------------------------------------------
$Mode       = ''
$ListenHost = ''

$domainEnv    = $env:DOMAIN
$hostAddrEnv  = $env:HOST_ADDR   # NOTE: use HOST_ADDR not HOST (HOST is reserved on Windows)

if ($domainEnv) {
    $Mode       = 'domain'
    $ListenHost = $domainEnv
    Write-Info "Domain mode - Let's Encrypt SSL for $ListenHost"
} elseif ($hostAddrEnv) {
    $Mode       = 'host'
    $ListenHost = $hostAddrEnv
    Write-Info "Private network mode - self-signed SSL for $ListenHost"
} else {
    Write-Host ""
    Write-Host "No DOMAIN or HOST_ADDR specified."
    Write-Host "  `$env:DOMAIN='app.example.com'   -> public domain with Let's Encrypt"
    Write-Host "  `$env:HOST_ADDR='192.168.1.50'   -> private network with self-signed SSL"
    Write-Host ""
    $UserInput = Read-Host "Enter domain, IP, or press Enter for localhost"
    if ([string]::IsNullOrWhiteSpace($UserInput)) {
        $Mode       = 'localhost'
        $ListenHost = 'localhost'
        Write-Info "Localhost mode - self-signed SSL on localhost"
    } elseif ($UserInput -match '^\d+\.\d+\.\d+\.\d+$') {
        $Mode       = 'host'
        $ListenHost = $UserInput
        Write-Info "Private network mode - self-signed SSL for $ListenHost"
    } else {
        $Mode       = 'domain'
        $ListenHost = $UserInput
        $domainEnv  = $UserInput
        Write-Info "Domain mode - Let's Encrypt SSL for $ListenHost"
    }
}

# --- URL variables ------------------------------------------------------------
$ApiUrl  = "https://$ListenHost/api"
$WsUrl   = "wss://$ListenHost/ws"
$AppUrl  = "https://$ListenHost"
$Cors    = "https://$ListenHost"

# --- Secret generation helper ------------------------------------------------
# Uses openssl (available via Git for Windows) for cryptographically secure
# random bytes - same source as the Linux/macOS scripts.
function New-RandomHex {
    param([int]$Bytes)
    $result = openssl rand -hex $Bytes 2>&1
    if ($LASTEXITCODE -ne 0) { throw "openssl rand -hex $Bytes failed" }
    return $result.Trim()
}

function New-RandomBase64 {
    param([int]$Bytes)
    $result = openssl rand -base64 $Bytes 2>&1
    if ($LASTEXITCODE -ne 0) { throw "openssl rand -base64 $Bytes failed" }
    return $result.Trim()
}

# --- Generate .env ------------------------------------------------------------
if (Test-Path $EnvFile) {
    Write-Warn ".env already exists at $EnvFile"
    $overwrite = Read-Host "Overwrite? [y/N]"
    if ($overwrite -notmatch '^[Yy]') {
        Write-Info "Keeping existing .env"
    } else {
        Remove-Item $EnvFile -Force
    }
}

if (-not (Test-Path $EnvFile)) {
    # If a postgres_data volume already exists, wipe it to avoid password mismatch
    $volumes = docker volume ls -q 2>&1
    if ($volumes -match '_postgres_data$') {
        Write-Warn "Pre-existing postgres_data volume detected - its password won't match the fresh .env."
        Write-Warn "Wiping postgres + api + ws + thumbnails volumes to avoid an authentication mismatch."
        docker compose -f $ComposeFile down -v 2>&1 | Out-Null
        $oldVolumes = docker volume ls -q 2>&1 | Where-Object { $_ -match '_(postgres_data|api_projects|api_thumbnails|ws_projects)$' }
        foreach ($vol in $oldVolumes) {
            docker volume rm -f $vol 2>&1 | Out-Null
        }
        Write-Ok "Cleared previous-install volumes"
    }

    Write-Info "Generating deployment/docker/.env with random secrets..."

    $JwtSecret              = New-RandomHex 32
    $EncryptionKey          = New-RandomHex 32
    $InternalSecret         = New-RandomHex 32
    $PgPassword             = New-RandomHex 16
    $BootstrapToken         = New-RandomHex 32
    $DoableKek              = New-RandomBase64 32
    $BootstrapTokenExpires  = (Get-Date).ToUniversalTime().AddHours(24).ToString('yyyy-MM-ddTHH:mm:ssZ')
    $GeneratedAt            = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

    # Resolve env-var API keys that may have been pre-exported by the operator
    $AnthropicKey     = if ($env:ANTHROPIC_API_KEY)      { $env:ANTHROPIC_API_KEY }      else { '' }
    $OpenAiKey        = if ($env:OPENAI_API_KEY)         { $env:OPENAI_API_KEY }         else { '' }
    $GeminiKey        = if ($env:GEMINI_API_KEY)         { $env:GEMINI_API_KEY }         else { '' }
    $MiniMaxKey       = if ($env:MINIMAX_API_KEY)        { $env:MINIMAX_API_KEY }        else { '' }
    $OpenRouterKey    = if ($env:OPENROUTER_API_KEY)     { $env:OPENROUTER_API_KEY }     else { '' }
    $TogetherKey      = if ($env:TOGETHER_API_KEY)       { $env:TOGETHER_API_KEY }       else { '' }
    $FireworksKey     = if ($env:FIREWORKS_API_KEY)      { $env:FIREWORKS_API_KEY }      else { '' }
    $OpenCodeZenKey   = if ($env:OPENCODE_ZEN_API_KEY)   { $env:OPENCODE_ZEN_API_KEY }   else { '' }
    $GroqKey          = if ($env:GROQ_API_KEY)           { $env:GROQ_API_KEY }           else { '' }
    $CerebrasKey      = if ($env:CEREBRAS_API_KEY)       { $env:CEREBRAS_API_KEY }       else { '' }
    $DeepSeekKey      = if ($env:DEEPSEEK_API_KEY)       { $env:DEEPSEEK_API_KEY }       else { '' }
    $MistralKey       = if ($env:MISTRAL_API_KEY)        { $env:MISTRAL_API_KEY }        else { '' }
    $CohereKey        = if ($env:COHERE_API_KEY)         { $env:COHERE_API_KEY }         else { '' }
    $XaiKey           = if ($env:XAI_API_KEY)            { $env:XAI_API_KEY }            else { '' }
    $PerplexityKey    = if ($env:PERPLEXITY_API_KEY)     { $env:PERPLEXITY_API_KEY }     else { '' }
    $DeepInfraKey     = if ($env:DEEPINFRA_API_KEY)      { $env:DEEPINFRA_API_KEY }      else { '' }
    $NvidiaKey        = if ($env:NVIDIA_API_KEY)         { $env:NVIDIA_API_KEY }         else { '' }
    $MoonshotKey      = if ($env:MOONSHOT_API_KEY)       { $env:MOONSHOT_API_KEY }       else { '' }
    $ZhipuKey         = if ($env:ZHIPU_API_KEY)          { $env:ZHIPU_API_KEY }          else { '' }

    $envContent = @"
# Generated by setup.ps1 on $GeneratedAt
# Host: $ListenHost

# --- Secrets ---
JWT_SECRET=$JwtSecret
ENCRYPTION_KEY=$EncryptionKey
INTERNAL_SECRET=$InternalSecret
DOABLE_KEK=$DoableKek

# --- First-run bootstrap (single-use; auto-closes after first signup) ---
INSTALL_BOOTSTRAP_TOKEN=$BootstrapToken
INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT=$BootstrapTokenExpires

# --- Database ---
POSTGRES_USER=doable
POSTGRES_PASSWORD=$PgPassword
POSTGRES_DB=doable

# --- URLs ---
NEXT_PUBLIC_API_URL=$ApiUrl
NEXT_PUBLIC_WS_URL=$WsUrl
NEXT_PUBLIC_APP_URL=$AppUrl
CORS_ORIGINS=$Cors

# --- Redis (optional) ---
REDIS_URL=

# --- AI providers (set ANY ONE for first-boot pre-config) ---
ANTHROPIC_API_KEY=$AnthropicKey
OPENAI_API_KEY=$OpenAiKey
GEMINI_API_KEY=$GeminiKey
MINIMAX_API_KEY=$MiniMaxKey
OPENROUTER_API_KEY=$OpenRouterKey
TOGETHER_API_KEY=$TogetherKey
FIREWORKS_API_KEY=$FireworksKey
OPENCODE_ZEN_API_KEY=$OpenCodeZenKey
GROQ_API_KEY=$GroqKey
CEREBRAS_API_KEY=$CerebrasKey
DEEPSEEK_API_KEY=$DeepSeekKey
MISTRAL_API_KEY=$MistralKey
COHERE_API_KEY=$CohereKey
XAI_API_KEY=$XaiKey
PERPLEXITY_API_KEY=$PerplexityKey
DEEPINFRA_API_KEY=$DeepInfraKey
NVIDIA_API_KEY=$NvidiaKey
MOONSHOT_API_KEY=$MoonshotKey
ZHIPU_API_KEY=$ZhipuKey

# --- OAuth (optional) ---
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# --- Stripe (optional) ---
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
"@

    # Write with UTF-8 no-BOM (important for Docker / Linux container compatibility)
    [System.IO.File]::WriteAllText($EnvFile, $envContent, [System.Text.UTF8Encoding]::new($false))

    # Restrict permissions to current user only (equivalent to chmod 600 on Linux).
    # Uses icacls (standard Windows built-in) to avoid antivirus false-positives
    # from the SetAccessRuleProtection / Set-Acl pattern.
    $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    icacls $EnvFile /inheritance:r /grant:r "${currentUser}:F" 2>&1 | Out-Null

    Write-Ok "Created deployment/docker/.env with generated secrets (owner-only permissions)"
}

# --- Idempotent back-fill: DOABLE_KEK for older .env files -------------------
$envLines = Get-Content $EnvFile -ErrorAction SilentlyContinue
$hasKek = $envLines | Where-Object { $_ -match '^DOABLE_KEK=.+' }
if (-not $hasKek) {
    $newKek = New-RandomBase64 32
    $hasEmptyKek = $envLines | Where-Object { $_ -match '^DOABLE_KEK=' }
    if ($hasEmptyKek) {
        $envLines = $envLines -replace '^DOABLE_KEK=.*', "DOABLE_KEK=$newKek"
        [System.IO.File]::WriteAllLines($EnvFile, $envLines, [System.Text.UTF8Encoding]::new($false))
    } else {
        $backfillTs = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
        Add-Content -Path $EnvFile -Value "`n# Added by setup.ps1 back-fill ($backfillTs)`nDOABLE_KEK=$newKek"
    }
    Write-Ok "Back-filled DOABLE_KEK in existing $EnvFile"
}

# --- Check for port conflicts -------------------------------------------------
# Warn if ports 80, 443, or 5432 are already bound by another process.
# Port 5432 is common on Windows dev machines with a native PostgreSQL install —
# Docker tries to bind 127.0.0.1:5432 and fails with EADDRINUSE if it's taken.
foreach ($port in @(80, 443, 5432)) {
    $listener = netstat -ano 2>$null | Select-String "0.0.0.0:$port\s+.*LISTENING|127.0.0.1:$port\s+.*LISTENING"
    if ($listener) {
        $listenerPid = ($listener[0] -split '\s+')[-1]
        $proc = (Get-Process -Id $listenerPid -ErrorAction SilentlyContinue).ProcessName
        if ($port -eq 5432) {
            Write-Warn "Port $port is in use by '$proc' (PID $listenerPid) - Docker postgres will fail to bind."
            Write-Warn "Stop it with: Stop-Service -Name postgresql* -Force  (or: taskkill /PID $listenerPid /F)"
        } else {
            Write-Warn "Port $port is in use by '$proc' (PID $listenerPid) - nginx may fail to start."
            Write-Warn "Stop the conflicting process before continuing."
        }
    }
}

# --- Install nginx for Windows ------------------------------------------------
Write-Info "Setting up nginx reverse proxy for $ListenHost..."

# Check if nginx is already installed at C:\nginx
$nginxExe = Join-Path $NginxDir 'nginx.exe'
if (-not (Test-Path $nginxExe)) {
    Write-Info "nginx not found at $NginxDir. Installing via Chocolatey..."

    # Check for Chocolatey
    if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
        Write-Info "Installing Chocolatey package manager..."
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
        # Download to a temp file first (avoids Invoke-Expression+DownloadString
        # which antivirus tools flag heavily as a malware pattern)
        $chocoInstaller = Join-Path $env:TEMP 'choco-install.ps1'
        Invoke-WebRequest -Uri 'https://community.chocolatey.org/install.ps1' -OutFile $chocoInstaller -UseBasicParsing
        & $chocoInstaller
        Remove-Item $chocoInstaller -Force -ErrorAction SilentlyContinue
        # Refresh PATH so choco is available in this session
        $env:PATH = [System.Environment]::GetEnvironmentVariable('PATH', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('PATH', 'User')
    }

    choco install nginx -y --no-progress
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Failed to install nginx via Chocolatey."
        Write-Err "Install manually from https://nginx.org/en/download.html and extract to C:\nginx"
        exit 1
    }
    Write-Ok "Installed nginx"
}

# Chocolatey sometimes reports nginx as installed without leaving a usable
# C:\nginx tree behind. Resolve the real install directory from common
# Chocolatey layouts, then force a reinstall once if the binary still cannot
# be found.
if (-not (Test-Path $nginxExe)) {
    Write-Info "nginx.exe not at $NginxDir - searching Chocolatey install locations..."

    $nginxExeCandidates = @(
        'C:\ProgramData\chocolatey\lib\nginx\tools\nginx.exe'
        'C:\ProgramData\chocolatey\lib\nginx\tools\nginx\nginx.exe'
        'C:\tools\nginx.exe'
        'C:\tools\nginx\nginx.exe'
        'C:\nginx\nginx.exe'
    )

    $resolvedNginxExe = $nginxExeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

    if (-not $resolvedNginxExe) {
        $resolvedNginxExe = Get-ChildItem 'C:\tools' -Filter 'nginx.exe' -Recurse -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty FullName -First 1
    }

    if (-not $resolvedNginxExe) {
        Write-Info "nginx.exe still missing - forcing Chocolatey reinstall..."
        choco install nginx -y --no-progress --force
        if ($LASTEXITCODE -ne 0) {
            Write-Err "Failed to reinstall nginx via Chocolatey."
            Write-Err "Install manually from https://nginx.org/en/download.html and extract to C:\nginx"
            exit 1
        }

        $resolvedNginxExe = $nginxExeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    }

    if ($resolvedNginxExe) {
        $resolvedNginxDir = Split-Path -Parent $resolvedNginxExe
        if (Test-Path $NginxDir) {
            Remove-Item $NginxDir -Force -Recurse -ErrorAction SilentlyContinue
        }
        New-Item -ItemType Junction -Path $NginxDir -Target $resolvedNginxDir -Force | Out-Null
        Write-Ok "Linked nginx install to $NginxDir"
    } else {
        Write-Err "nginx.exe not found after Chocolatey install. Extract nginx manually to C:\nginx"
        Write-Err "Download from https://nginx.org/en/download.html and extract as C:\nginx"
        exit 1
    }
}

# Ensure sites-enabled directory exists inside nginx conf dir
if (-not (Test-Path $NginxSitesDir)) {
    New-Item -ItemType Directory -Path $NginxSitesDir -Force | Out-Null
}

# nginx expects logs to exist under its prefix when using default relative paths.
$NginxLogsDir = Join-Path $NginxDir 'logs'
if (-not (Test-Path $NginxLogsDir)) {
    New-Item -ItemType Directory -Path $NginxLogsDir -Force | Out-Null
}

# Patch the main nginx.conf to include sites-enabled if not already present.
# We target only the LAST closing brace (which closes the http block in the
# default Chocolatey nginx.conf) using LastIndexOf to avoid matching inner
# block braces from events{} or server{} blocks.
$nginxMainConf = Get-Content $NginxConf -Raw -ErrorAction SilentlyContinue
if ($nginxMainConf -and $nginxMainConf -notmatch 'sites-enabled') {
    $includeDir  = $NginxSitesDir.Replace('\', '/')
    $includeLine = "    include $includeDir/*.conf;`n"
    $lastBrace   = $nginxMainConf.LastIndexOf('}')
    if ($lastBrace -ge 0) {
        $nginxMainConf = $nginxMainConf.Substring(0, $lastBrace) + $includeLine + $nginxMainConf.Substring($lastBrace)
    }
    [System.IO.File]::WriteAllText($NginxConf, $nginxMainConf, [System.Text.UTF8Encoding]::new($false))
    Write-Ok "Patched nginx.conf to include sites-enabled"
}

# Avoid localhost conflicts with the default Chocolatey server block so the
# generated localhost site in sites-enabled wins for port 80 redirects.
$nginxMainConf = Get-Content $NginxConf -Raw -ErrorAction SilentlyContinue
if ($nginxMainConf) {
    $updatedMainConf = [regex]::Replace(
        $nginxMainConf,
        '(?m)^(\s*server_name\s+)localhost\s*;',
        '$1_;',
        1
    )

    if ($updatedMainConf -ne $nginxMainConf) {
        [System.IO.File]::WriteAllText($NginxConf, $updatedMainConf, [System.Text.UTF8Encoding]::new($false))
        Write-Ok "Adjusted default nginx server_name to avoid localhost conflicts"
    }
}

# --- SSL certificates ---------------------------------------------------------
$SslCert = ''
$SslKey  = ''

if ($Mode -eq 'domain' -and -not $SkipSsl) {
    # Let's Encrypt on Windows via win-acme (wacs)
    Write-Info "Setting up Let's Encrypt SSL for $ListenHost via win-acme..."

    $wacsExe = 'C:\win-acme\wacs.exe'
    if (-not (Test-Path $wacsExe)) {
        Write-Info "Installing win-acme via Chocolatey..."
        choco install win-acme -y --no-progress
        if ($LASTEXITCODE -ne 0) {
            Write-Err "Failed to install win-acme via Chocolatey."
            Write-Err "Install manually from https://www.win-acme.com/ and extract to C:\win-acme"
            exit 1
        }
    }

    # win-acme stores certs in C:\ProgramData\win-acme by default
    # Use the IIS-style PEM export for nginx compatibility
    $certBase = "C:\ProgramData\win-acme\$ListenHost"
    & $wacsExe --target manual --host $ListenHost --validation selfhosting `
               --store pemfiles --pemfilespath $certBase `
               --installation none --accepttos --notaskscheduler
    if ($LASTEXITCODE -ne 0) {
        Write-Err "win-acme certificate request failed. Check $certBase for details."
        exit 1
    }

    # win-acme names the files <host>-chain.pem and <host>-key.pem
    $SslCert = "$certBase\$ListenHost-chain.pem"
    $SslKey  = "$certBase\$ListenHost-key.pem"
    Write-Ok "SSL certificate obtained via Let's Encrypt (win-acme)"

} else {
    # Self-signed certificate
    if ($Mode -eq 'domain' -and $SkipSsl) {
        Write-Info "Skipping Let's Encrypt (-SkipSsl). Generating self-signed certificate..."
    } else {
        Write-Info "Generating self-signed SSL certificate for $ListenHost..."
    }

    if (-not (Test-Path $SelfSignedDir)) {
        New-Item -ItemType Directory -Path $SelfSignedDir -Force | Out-Null
    }

    $SslCert = Join-Path $SelfSignedDir 'cert.pem'
    $SslKey  = Join-Path $SelfSignedDir 'key.pem'

    if ((Test-Path $SslCert) -and (Test-Path $SslKey)) {
        Write-Warn "Self-signed certificate already exists at $SelfSignedDir. Keeping it."
    } else {
        # Build SAN extension
        if ($ListenHost -match '^\d+\.\d+\.\d+\.\d+$') {
            $SanExt = "subjectAltName=IP:$ListenHost"
        } else {
            $SanExt = "subjectAltName=DNS:$ListenHost"
        }

        # openssl on Windows (from Git for Windows) handles forward slashes fine
        openssl req -x509 -newkey rsa:2048 -nodes `
            -keyout $SslKey -out $SslCert `
            -days 365 -subj "/CN=$ListenHost" `
            -addext $SanExt

        if ($LASTEXITCODE -ne 0) {
            Write-Err "openssl failed to generate self-signed certificate."
            exit 1
        }
        Write-Ok "Self-signed certificate created at $SelfSignedDir"
    }
}

# --- Generate nginx site config -----------------------------------------------
# nginx on Windows requires forward slashes in paths
$SslCertFwd = $SslCert.Replace('\', '/')
$SslKeyFwd  = $SslKey.Replace('\', '/')

$templatePath = Join-Path $ScriptDir 'nginx.conf.template'
$templateContent = Get-Content $templatePath -Raw

$nginxSiteConf = $templateContent `
    -replace '__HOST__',     $ListenHost `
    -replace '__SSL_CERT__', $SslCertFwd `
    -replace '__SSL_KEY__',  $SslKeyFwd

$siteConfPath = Join-Path $NginxSitesDir "$ListenHost.conf"
[System.IO.File]::WriteAllText($siteConfPath, $nginxSiteConf, [System.Text.UTF8Encoding]::new($false))

# --- Start / reload nginx -----------------------------------------------------
# Test config first
& $nginxExe -p $NginxDir -t -c $NginxConf
if ($LASTEXITCODE -ne 0) {
    Write-Err "nginx config test failed. Check $NginxConf and $siteConfPath"
    exit 1
}

# nginx Windows service: check if already running
$nginxProcs = Get-Process nginx -ErrorAction SilentlyContinue
if ($nginxProcs) {
    Write-Info "Reloading nginx (sending -s reload)..."
    & $nginxExe -p $NginxDir -s reload -c $NginxConf
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "nginx reload failed; attempting full restart..."
        Get-Process nginx -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Process -FilePath $nginxExe -ArgumentList "-p `"$NginxDir`" -c `"$NginxConf`"" -WindowStyle Hidden
    }
} else {
    Write-Info "Starting nginx..."
    Start-Process -FilePath $nginxExe -ArgumentList "-p `"$NginxDir`" -c `"$NginxConf`"" -WindowStyle Hidden
}

$httpsListener = Get-NetTCPConnection -LocalPort 443 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $httpsListener) {
    Write-Err "nginx started but port 443 is not listening. Check C:\nginx\logs\error.log"
    exit 1
}

Write-Ok "nginx configured and running for $ListenHost"

# --- Windows Firewall ---------------------------------------------------------
Write-Info "Configuring Windows Firewall rules for ports 80 and 443..."
$fwRules = @(
    @{ Name = 'Doable-HTTP';  Port = 80  },
    @{ Name = 'Doable-HTTPS'; Port = 443 }
)
foreach ($rule in $fwRules) {
    $existing = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
    if (-not $existing) {
        New-NetFirewallRule -DisplayName $rule.Name `
            -Direction Inbound -Protocol TCP -LocalPort $rule.Port `
            -Action Allow -Profile Any | Out-Null
        Write-Ok "Firewall rule added: $($rule.Name) (port $($rule.Port))"
    } else {
        Write-Ok "Firewall rule already exists: $($rule.Name)"
    }
}

# --- Build (or pull) and start ------------------------------------------------
Write-Host ""
Set-Location $ProjectDir

if ($ComposeFile -match 'docker-compose\.prod\.yml') {
    $imageTag = if ($env:DOABLE_IMAGE_TAG) { $env:DOABLE_IMAGE_TAG } else { 'latest' }
    Write-Info "Pulling pre-built images from ghcr.io (tag: $imageTag)..."
    docker compose -f $ComposeFile pull
    Write-Info "Starting containers..."
} else {
    Write-Info "Building Docker images from source (this takes ~5-10 minutes)..."
    docker compose -f $ComposeFile build
    Write-Info "Starting containers..."
}
docker compose -f $ComposeFile up -d

if ($LASTEXITCODE -ne 0) {
    Write-Err "docker compose up failed. Check the output above for details."
    exit 1
}

# Re-read bootstrap token from .env (handles the "keep existing .env" case)
$activeBootstrapToken = ''
$envFileLines = Get-Content $EnvFile -ErrorAction SilentlyContinue
$tokenLine = $envFileLines | Where-Object { $_ -match '^INSTALL_BOOTSTRAP_TOKEN=' } | Select-Object -First 1
if ($tokenLine) {
    $activeBootstrapToken = ($tokenLine -split '=', 2)[1]
}

# --- Summary ------------------------------------------------------------------
Write-Host ""
Write-Host ("=" * 74)
Write-Host "Doable is running at $AppUrl" -ForegroundColor Green
Write-Host ("=" * 74)
Write-Host ""
Write-Host "  What to do next:"
Write-Host ""
Write-Host "    1. Open $AppUrl/signup in your browser."
Write-Host "       The FIRST account to sign up becomes the platform owner"
Write-Host "       automatically - no editing required."
Write-Host ""
Write-Host "    2. You'll be guided through a 4-step setup wizard at /setup:"
Write-Host "       Welcome -> AI provider -> Google / GitHub sign-in -> Plans and Billing."
Write-Host ""
Write-Host "       AI provider step covers 50+ providers including OpenAI, Anthropic,"
Write-Host "       Gemini, OpenRouter, Together, Fireworks, Groq, Cerebras, DeepSeek,"
Write-Host "       Mistral, Cohere, xAI, Perplexity, MiniMax, Moonshot, Zhipu, plus"
Write-Host "       Azure/Bedrock/Vertex enterprise endpoints AND local OpenAI-compatible"
Write-Host "       servers (Ollama, LM Studio, vLLM, llama.cpp, Jan, LocalAI, ...)."
Write-Host ""

if ($Mode -ne 'domain') {
    Write-Host "  NOTE: Self-signed SSL - browsers will show a certificate warning." -ForegroundColor Yellow
    Write-Host "        Accept it once, or import $SslCert into Windows Certificate Store:"
    Write-Host "        certutil -addstore Root `"$SslCert`""
    Write-Host ""
}

if ($activeBootstrapToken) {
    Write-Host "  Bootstrap token (only needed if signup is delayed past 24h):"
    Write-Host ""
    Write-Host "      $activeBootstrapToken"
    Write-Host ""
}

Write-Host "  OAuth callback URLs to register in each provider dashboard:"
Write-Host ""
Write-Host "    Google login:  $ApiUrl/auth/google/callback"
Write-Host "    GitHub login:  $ApiUrl/auth/github/callback"
Write-Host "    GitHub repo:   $ApiUrl/auth/github/repo/callback"
Write-Host ""
Write-Host "  Useful commands:"
Write-Host "    View logs:   docker compose -f deployment\docker\docker-compose.yml logs -f"
Write-Host "    Stop:        docker compose -f deployment\docker\docker-compose.yml down"
Write-Host "    Restart:     docker compose -f deployment\docker\docker-compose.yml restart"
Write-Host "    nginx stop:  C:\nginx\nginx.exe -s stop"
Write-Host "    nginx reload: C:\nginx\nginx.exe -s reload"
Write-Host "    Edit config: deployment\docker\.env"
Write-Host ("=" * 74)
