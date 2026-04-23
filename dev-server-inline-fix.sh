#!/bin/bash
set -e
cd /root/doable

# Update .env.local for web
mkdir -p apps/web
cat > apps/web/.env.local << 'WEBENV'
NEXT_PUBLIC_API_URL=https://api.dev.doable.me
NEXT_PUBLIC_WS_URL=wss://ws.dev.doable.me
NEXT_PUBLIC_APP_URL=https://dev.doable.me
WEBENV

# Run migrations
cd services/api && npm run db:migrate 2>&1 | tail -3 && cd /root/doable

# Restart systemd service which manages tmux
systemctl restart doable || systemctl start doable

# Wait for services
sleep 8

# Check status
echo "=== STATUS CHECK ==="
curl -s http://localhost:4000/health || echo "API not ready"
curl -s http://localhost:3000 | head -c 50 || echo "Web not ready"

echo "✓ Dev server recovery completed"
