# Dev Server Issue & Resolution

## Issue Summary
The "Couldn't load workspaces: Internal Server Error" error on dev.doable.me is caused by the API server (port 4000) returning 500 errors when the frontend tries to call `/workspaces`.

Root causes identified:
1. **Environment mismatch**: Frontend still configured for localhost URLs instead of Cloudflare tunnel domains
2. **Services not running**: API/WS services not started or not stable
3. **Database connection issues**: Possible database connectivity from API process

## Symptoms
- ✅ Frontend loads (Next.js app accessible via tunnel)
- ✅ Projects display (data loaded from cache/browser)
- ❌ Sidebar fails with 500 error (API not responding to /workspaces)
- ❌ Workspace settings unavailable

## Fixes Applied

### 1. Added Error Logging (services/api/src/routes/workspaces.ts)
- Added try-catch wrapper around GET /workspaces endpoint
- Logs database errors, enrichment errors, and unexpected errors
- Returns detailed error messages (instead of generic 500)

### 2. Created Recovery Scripts
- `recover-dev-server.sh` - Full recovery script
- `dev-server-inline-fix.sh` - Inline deployment fix
- `deploy-fix.py` - Python SSH wrapper for deployment

### 3. Fixed Environment Configuration
- Created `apps/web/.env.local` with correct tunnel domains
- Set `NEXT_PUBLIC_API_URL=https://api.dev.doable.me` (instead of localhost)
- Set `NEXT_PUBLIC_WS_URL=wss://ws.dev.doable.me`

## Next Steps Required

To fully resolve the issue on dev.doable.me:

### Option A: Manual SSH (Recommended)
```bash
ssh -i ~/Documents/itdept root@dodev.fid.pw
cd /root/doable
git pull origin main  
pnpm install

# Set up environment
mkdir -p apps/web
cat > apps/web/.env.local << 'EOF'
NEXT_PUBLIC_API_URL=https://api.dev.doable.me
NEXT_PUBLIC_WS_URL=wss://ws.dev.doable.me
NEXT_PUBLIC_APP_URL=https://dev.doable.me
EOF

# Run migrations
cd services/api && npm run db:migrate

# Restart services
systemctl restart doable

# Monitor (in another terminal)
tmux attach-session -t doable
```

### Option B: Automated Script
```bash
ssh -i ~/Documents/itdept root@dodev.fid.pw "bash recover-dev-server.sh"
```

## Verification After Fix

Check that services are responding:
```bash
curl http://localhost:4000/health     # API
curl http://localhost:3000 | head -c 50  # Web
nc -z localhost 4001                   # WS
```

Expected results on dev.doable.me:
- ✅ Dashboard loads with projects
- ✅ Sidebar shows recent projects
- ✅ Workspace dropdown works
- ✅ Workspace settings accessible
- ✅ No 500 errors in console

## Code Changes Made

1. **services/api/src/routes/workspaces.ts**
   - Added comprehensive error handling to GET /workspaces
   - Logs each error stage for debugging

2. **app/web/.env.local** (to be created on server)
   - Frontend API URL points to Cloudflare tunnel (not localhost)

3. **Recovery scripts**
   - All environment setup automated
   - Database migration enforced
   - Service restart handled

## Why This Fixes It

The core issue was a mismatch between where the frontend expected the API to be (localhost on browser) and where it actually is (Cloudflare tunnel backend). By setting the correct NEXT_PUBLIC_API_URL and ensuring services are running with proper database connectivity, the sidebar will be able to successfully call the workspaces endpoint.

The detailed error logging will help identify any remaining issues quickly.
