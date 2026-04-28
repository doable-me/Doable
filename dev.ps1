<#
.SYNOPSIS
    Launches all Doable services in a psmux session.
.DESCRIPTION
    Creates a psmux session "doable" with three windows:
      - web  (Next.js on port 3000)
      - api  (Hono API on port 4000)
      - ws   (WebSocket on port 4001)
.EXAMPLE
    .\dev.ps1          # Start all services
    .\dev.ps1 -Kill    # Kill the existing session
#>
param(
    [switch]$Kill
)

$SessionName = "doable"
$ProjectRoot = $PSScriptRoot

# Kill existing session
if ($Kill) {
    psmux kill-session -t $SessionName 2>$null
    Write-Host "Killed session '$SessionName'" -ForegroundColor Yellow
    exit 0
}

# Run database migrations before starting services (mirrors start.sh)
Write-Host "Running database migrations..." -ForegroundColor Cyan
pnpm db:migrate
if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: Migration failed (non-fatal, continuing...)" -ForegroundColor Yellow
}

# Check if session already exists
$existing = psmux has-session -t $SessionName 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "Session '$SessionName' already running. Attaching..." -ForegroundColor Cyan
    psmux attach -t $SessionName
    exit 0
}

# Create session with the API window first (detached)
psmux new-session -s $SessionName -n api -d -- cmd /K "cd /d $ProjectRoot && pnpm dev:api"

# Add web window
psmux neww -t $SessionName -n web -d -- cmd /K "cd /d $ProjectRoot && pnpm dev:web"

# Add ws window
psmux neww -t $SessionName -n ws -d -- cmd /K "cd /d $ProjectRoot && pnpm dev:ws"

Write-Host ""
Write-Host "Doable dev session started!" -ForegroundColor Green
Write-Host ""
Write-Host "  Services:" -ForegroundColor Cyan
Write-Host "    Web   http://localhost:3000"
Write-Host "    API   http://localhost:4000"
Write-Host "    WS    ws://localhost:4001"
Write-Host ""
Write-Host "  Attach:  psmux attach -t $SessionName" -ForegroundColor Gray
Write-Host "  Kill:    .\dev.ps1 -Kill" -ForegroundColor Gray
Write-Host ""

# Attach to the session
psmux attach -t $SessionName
